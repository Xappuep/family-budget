"use strict";

/* =========================================================
   License crypto — FB2 signed tokens (ECDSA P-256 / SHA-256)
   Classic script: browser APP_SHELL + Node via vm.runInContext
   after constants.js + license-public-keys.js.
   ========================================================= */

const LICENSE_TOKEN_MAX_LENGTH = 4096;
const LICENSE_TOKEN_PREFIX = "FB2.";
const LICENSE_ENTITLEMENT_PATTERN =
    /^FULL_APP$|^THEME_[A-Z0-9_]+$|^FEATURE_[A-Z0-9_]+$/;
const LICENSE_ID_UUID_ISH_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getLicenseCryptoSubtle() {
    const webCrypto =
        typeof globalThis !== "undefined" && globalThis.crypto
            ? globalThis.crypto
            : typeof crypto !== "undefined"
              ? crypto
              : null;
    if (!webCrypto || !webCrypto.subtle) {
        throw new Error("WebCrypto subtle is unavailable");
    }
    return webCrypto.subtle;
}

function licenseBytesFromInput(bytesOrString) {
    if (typeof bytesOrString === "string") {
        return new TextEncoder().encode(bytesOrString);
    }
    if (bytesOrString instanceof ArrayBuffer) {
        return new Uint8Array(bytesOrString);
    }
    if (ArrayBuffer.isView(bytesOrString)) {
        return new Uint8Array(
            bytesOrString.buffer,
            bytesOrString.byteOffset,
            bytesOrString.byteLength
        );
    }
    return new Uint8Array(bytesOrString);
}

function base64UrlEncode(bytesOrString) {
    const bytes = licenseBytesFromInput(bytesOrString);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    const b64 =
        typeof btoa === "function"
            ? btoa(binary)
            : Buffer.from(bytes).toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToBytes(str) {
    const input = String(str || "");
    const paddedBase =
        input.replace(/-/g, "+").replace(/_/g, "/") +
        "===".slice((input.length + 3) % 4);
    const binary =
        typeof atob === "function"
            ? atob(paddedBase)
            : Buffer.from(paddedBase, "base64").toString("binary");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function base64UrlDecodeToString(str) {
    return new TextDecoder().decode(base64UrlDecodeToBytes(str));
}

function canonicalizeLicensePayload(payload) {
    return JSON.stringify({
        v: payload.v,
        kid: payload.kid,
        licenseId: payload.licenseId,
        installationId: payload.installationId,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt,
        entitlements: payload.entitlements
    });
}

function buildLicenseToken(payloadSegment, signatureSegment) {
    return (
        LICENSE_TOKEN_PREFIX +
        String(payloadSegment) +
        "." +
        String(signatureSegment)
    );
}

function stripLicenseTokenNoise(raw) {
    return String(raw == null ? "" : raw)
        .trim()
        .replace(/[ \t\r\n]+/g, "");
}

function parseLicenseToken(raw) {
    const cleaned = stripLicenseTokenNoise(raw);
    if (!cleaned) {
        return { ok: false, reason: "malformed" };
    }
    if (cleaned.length > LICENSE_TOKEN_MAX_LENGTH) {
        return { ok: false, reason: "oversized" };
    }
    const parts = cleaned.split(".");
    if (parts.length !== 3 || parts[0] !== "FB2") {
        return { ok: false, reason: "malformed" };
    }
    const payloadSegment = parts[1];
    const signatureSegment = parts[2];
    if (!payloadSegment || !signatureSegment) {
        return { ok: false, reason: "malformed" };
    }
    if (!/^[A-Za-z0-9_-]+$/.test(payloadSegment) || !/^[A-Za-z0-9_-]+$/.test(signatureSegment)) {
        return { ok: false, reason: "malformed" };
    }
    return { ok: true, payloadSegment, signatureSegment };
}

function isFb2Token(raw) {
    return stripLicenseTokenNoise(raw).startsWith(LICENSE_TOKEN_PREFIX);
}

function validateLicensePayload(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return { ok: false, reason: "invalid_payload" };
    }
    if (obj.v !== 1) {
        return { ok: false, reason: "invalid_payload" };
    }
    if (typeof obj.kid !== "string" || obj.kid.length === 0) {
        return { ok: false, reason: "invalid_payload" };
    }
    if (
        typeof obj.licenseId !== "string" ||
        !LICENSE_ID_UUID_ISH_PATTERN.test(obj.licenseId)
    ) {
        return { ok: false, reason: "invalid_payload" };
    }
    if (
        typeof obj.installationId !== "string" ||
        !LICENSE_ID_UUID_ISH_PATTERN.test(obj.installationId)
    ) {
        return { ok: false, reason: "invalid_payload" };
    }
    if (typeof obj.issuedAt !== "number" || !Number.isFinite(obj.issuedAt)) {
        return { ok: false, reason: "invalid_payload" };
    }
    if (
        !(
            obj.expiresAt === null ||
            (typeof obj.expiresAt === "number" && Number.isFinite(obj.expiresAt))
        )
    ) {
        return { ok: false, reason: "invalid_payload" };
    }
    if (!Array.isArray(obj.entitlements)) {
        return { ok: false, reason: "invalid_payload" };
    }
    for (let i = 0; i < obj.entitlements.length; i += 1) {
        const entitlement = obj.entitlements[i];
        if (
            typeof entitlement !== "string" ||
            entitlement.length === 0 ||
            !LICENSE_ENTITLEMENT_PATTERN.test(entitlement)
        ) {
            return { ok: false, reason: "invalid_payload" };
        }
    }
    return { ok: true };
}

async function importLicensePublicKey(jwk) {
    return getLicenseCryptoSubtle().importKey(
        "jwk",
        jwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
    );
}

async function verifyLicenseSignature(payloadSegment, signatureSegment, publicKey) {
    const data = new TextEncoder().encode(String(payloadSegment));
    const signature = base64UrlDecodeToBytes(signatureSegment);
    return getLicenseCryptoSubtle().verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        signature,
        data
    );
}

function getDefaultRevokedLicenseIds() {
    return typeof REVOKED_LICENSE_IDS !== "undefined" ? REVOKED_LICENSE_IDS : [];
}

function getDefaultLicensePublicKeysMap() {
    return typeof LICENSE_PUBLIC_KEYS !== "undefined" ? LICENSE_PUBLIC_KEYS : {};
}

async function verifySignedLicenseToken(raw, options) {
    const opts = options && typeof options === "object" ? options : {};
    const publicKeysMap =
        opts.publicKeysMap != null
            ? opts.publicKeysMap
            : getDefaultLicensePublicKeysMap();
    const revokedIds =
        opts.revokedIds != null ? opts.revokedIds : getDefaultRevokedLicenseIds();
    const now = typeof opts.now === "number" ? opts.now : Date.now();
    const expectedInstallationId =
        opts.expectedInstallationId != null
            ? String(opts.expectedInstallationId).trim().toLowerCase()
            : null;

    const cleaned = stripLicenseTokenNoise(raw);
    if (!cleaned) {
        return { ok: false, reason: "malformed" };
    }
    if (cleaned.length > LICENSE_TOKEN_MAX_LENGTH) {
        return { ok: false, reason: "oversized" };
    }

    const parsed = parseLicenseToken(cleaned);
    if (!parsed.ok) {
        return { ok: false, reason: parsed.reason };
    }

    let payload;
    try {
        payload = JSON.parse(base64UrlDecodeToString(parsed.payloadSegment));
    } catch (_error) {
        return { ok: false, reason: "malformed" };
    }

    const payloadCheck = validateLicensePayload(payload);
    if (!payloadCheck.ok) {
        return { ok: false, reason: "invalid_payload" };
    }

    // Normalize installationId for comparisons (UUID case-insensitive).
    payload.installationId = String(payload.installationId).trim().toLowerCase();

    const jwk = publicKeysMap[payload.kid];
    if (!jwk || typeof jwk !== "object") {
        return { ok: false, reason: "unknown_kid" };
    }

    let publicKey;
    try {
        publicKey = await importLicensePublicKey(jwk);
    } catch (_error) {
        return { ok: false, reason: "unknown_kid" };
    }

    let signatureOk = false;
    try {
        signatureOk = await verifyLicenseSignature(
            parsed.payloadSegment,
            parsed.signatureSegment,
            publicKey
        );
    } catch (_error) {
        return { ok: false, reason: "bad_signature" };
    }
    if (!signatureOk) {
        return { ok: false, reason: "bad_signature" };
    }

    const revokedList = Array.isArray(revokedIds) ? revokedIds : [];
    if (revokedList.indexOf(payload.licenseId) !== -1) {
        return { ok: false, reason: "revoked" };
    }

    if (payload.expiresAt !== null && now > payload.expiresAt) {
        return { ok: false, reason: "expired" };
    }

    if (
        expectedInstallationId &&
        payload.installationId !== expectedInstallationId
    ) {
        return { ok: false, reason: "installation_mismatch" };
    }

    return {
        ok: true,
        reason: undefined,
        payload,
        entitlements: payload.entitlements.slice()
    };
}
