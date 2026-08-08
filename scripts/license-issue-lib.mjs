/**
 * Shared FB2 license issuance helpers (Node only).
 * Uses node:crypto webcrypto — no npm crypto packages.
 */

import { webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const subtle = webcrypto.subtle;

const INSTALLATION_UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeInstallationId(raw) {
    return String(raw == null ? "" : raw)
        .trim()
        .toLowerCase();
}

export function isValidInstallationId(raw) {
    return INSTALLATION_UUID_PATTERN.test(normalizeInstallationId(raw));
}

export function base64UrlEncode(bytesOrString) {
    const bytes =
        typeof bytesOrString === "string"
            ? new TextEncoder().encode(bytesOrString)
            : bytesOrString instanceof Uint8Array
              ? bytesOrString
              : new Uint8Array(bytesOrString);
    const b64 = Buffer.from(bytes).toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function canonicalizeLicensePayload(payload) {
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

export function loadSigningKeyFile(keyPath) {
    if (!fs.existsSync(keyPath)) {
        const err = new Error(
            `Signing key file not found: ${keyPath}\n` +
                "Run scripts/init-license-signing-key.mjs once to create K1, " +
                "or restore your backup of .local-secrets/license-signing-key.json. " +
                "A new key will NOT be created automatically."
        );
        err.code = "SIGNING_KEY_MISSING";
        throw err;
    }

    const raw = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    if (!raw || !raw.privateJwk || !raw.publicJwk || !raw.kid) {
        const err = new Error(
            `Signing key file is incomplete or corrupted: ${keyPath}`
        );
        err.code = "SIGNING_KEY_INVALID";
        throw err;
    }
    if (raw.privateJwk.d == null) {
        const err = new Error(
            `Signing key file is missing private material: ${keyPath}`
        );
        err.code = "SIGNING_KEY_INVALID";
        throw err;
    }
    return raw;
}

export async function importPrivateSigningKey(privateJwk) {
    return subtle.importKey(
        "jwk",
        privateJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
    );
}

export async function signLicensePayloadSegment(payloadSegment, privateKey) {
    const data = new TextEncoder().encode(String(payloadSegment));
    const signature = await subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        data
    );
    return base64UrlEncode(new Uint8Array(signature));
}

export async function issueFullAppLicense(options) {
    const {
        privateKey,
        kid,
        installationId: rawInstallationId,
        issuedAt = Date.now(),
        expiresAt = null,
        entitlements = ["FULL_APP"],
        licenseId = webcrypto.randomUUID()
    } = options || {};

    if (rawInstallationId == null || String(rawInstallationId).trim() === "") {
        const err = new Error(
            "installationId is required to issue a FULL_APP license"
        );
        err.code = "INSTALLATION_ID_REQUIRED";
        throw err;
    }

    const installationId = normalizeInstallationId(rawInstallationId);
    if (!isValidInstallationId(installationId)) {
        const err = new Error("installationId must be a valid UUID");
        err.code = "INSTALLATION_ID_INVALID";
        throw err;
    }

    const payload = {
        v: 1,
        kid,
        licenseId,
        installationId,
        issuedAt,
        expiresAt,
        entitlements
    };

    const json = canonicalizeLicensePayload(payload);
    const payloadSegment = base64UrlEncode(json);
    const signatureSegment = await signLicensePayloadSegment(
        payloadSegment,
        privateKey
    );
    const token = `FB2.${payloadSegment}.${signatureSegment}`;

    return { payload, token, payloadSegment };
}

export function readRegistry(registryPath) {
    if (!fs.existsSync(registryPath)) {
        return { version: 1, licenses: [] };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(registryPath, "utf8"));
        if (!raw || !Array.isArray(raw.licenses)) {
            return { version: 1, licenses: [] };
        }
        return { version: Number(raw.version) || 1, licenses: raw.licenses };
    } catch (_error) {
        return { version: 1, licenses: [] };
    }
}

export function writeRegistry(registryPath, registry) {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(
        registryPath,
        JSON.stringify(registry, null, 2) + "\n",
        "utf8"
    );
}

export function appendLicenseToRegistry(registryPath, entry) {
    const registry = readRegistry(registryPath);
    registry.licenses.unshift(entry);
    writeRegistry(registryPath, registry);
    return registry;
}
