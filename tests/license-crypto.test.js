"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

function loadLicenseCrypto(extra = {}) {
    const context = {
        console,
        Date,
        JSON,
        Math,
        Number,
        String,
        Array,
        Object,
        Boolean,
        Promise,
        TextEncoder,
        TextDecoder,
        Buffer,
        Uint8Array,
        ArrayBuffer,
        crypto: crypto.webcrypto,
        atob(str) {
            return Buffer.from(str, "base64").toString("binary");
        },
        btoa(str) {
            return Buffer.from(str, "binary").toString("base64");
        },
        LICENSE_PUBLIC_KEYS: {},
        REVOKED_LICENSE_IDS: Object.freeze([]),
        ...extra
    };
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, "..", "license-crypto.js"), "utf8"),
        context
    );
    return context;
}

function b64url(bytesOrString) {
    const buf =
        typeof bytesOrString === "string"
            ? Buffer.from(bytesOrString, "utf8")
            : Buffer.from(bytesOrString);
    return buf
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

async function mintEphemeralLicense(overrides = {}) {
    const subtle = crypto.webcrypto.subtle;
    const keyPair = await subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
    );
    const publicJwk = await subtle.exportKey("jwk", keyPair.publicKey);
    delete publicJwk.d;
    const kid = overrides.kid || "KT";
    const installationId = (
        overrides.installationId || crypto.randomUUID()
    ).toLowerCase();
    const payload = {
        v: 1,
        kid,
        licenseId: overrides.licenseId || crypto.randomUUID(),
        installationId,
        issuedAt: overrides.issuedAt || Date.now(),
        expiresAt: Object.prototype.hasOwnProperty.call(overrides, "expiresAt")
            ? overrides.expiresAt
            : null,
        entitlements: overrides.entitlements || ["FULL_APP"]
    };
    const json = JSON.stringify({
        v: payload.v,
        kid: payload.kid,
        licenseId: payload.licenseId,
        installationId: payload.installationId,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt,
        entitlements: payload.entitlements
    });
    const payloadSegment = b64url(json);
    const signature = await subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        keyPair.privateKey,
        new TextEncoder().encode(payloadSegment)
    );
    return {
        token: `FB2.${payloadSegment}.${signatureSegment(signature)}`,
        payload,
        payloadSegment,
        publicKeysMap: { [kid]: publicJwk },
        privateKey: keyPair.privateKey
    };
}

function signatureSegment(signature) {
    return b64url(Buffer.from(signature));
}

test("license-crypto: valid signed license verifies", async () => {
    const minted = await mintEphemeralLicense();
    const ctx = loadLicenseCrypto({
        LICENSE_PUBLIC_KEYS: minted.publicKeysMap
    });
    const result = await ctx.verifySignedLicenseToken(minted.token, {
        publicKeysMap: minted.publicKeysMap,
        now: Date.now()
    });
    assert.equal(result.ok, true);
    assert.equal(result.payload.licenseId, minted.payload.licenseId);
});

test("license-crypto: tampered payload fails", async () => {
    const minted = await mintEphemeralLicense();
    const parts = minted.token.split(".");
    const tamperedPayload = b64url(
        JSON.stringify({
            ...minted.payload,
            entitlements: ["FULL_APP", "FEATURE_HACK"]
        })
    );
    const token = `FB2.${tamperedPayload}.${parts[2]}`;
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken(token, {
        publicKeysMap: minted.publicKeysMap
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "bad_signature");
});

test("license-crypto: tampered signature fails", async () => {
    const minted = await mintEphemeralLicense();
    const parts = minted.token.split(".");
    const badSig = b64url(Buffer.alloc(64, 7));
    const token = `FB2.${parts[1]}.${badSig}`;
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken(token, {
        publicKeysMap: minted.publicKeysMap
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "bad_signature");
});

test("license-crypto: unknown kid fails", async () => {
    const minted = await mintEphemeralLicense({ kid: "K9" });
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken(minted.token, {
        publicKeysMap: { K1: minted.publicKeysMap.K9 }
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "unknown_kid");
});

test("license-crypto: malformed FB2 token safe fail", async () => {
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken("FB2.not-a-token");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "malformed");
});

test("license-crypto: oversized token safe fail", async () => {
    const ctx = loadLicenseCrypto();
    const huge = "FB2." + "a".repeat(5000) + "." + "b".repeat(100);
    const result = await ctx.verifySignedLicenseToken(huge);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "oversized");
});

test("license-crypto: invalid entitlement rejected", async () => {
    const minted = await mintEphemeralLicense({
        entitlements: ["NOT_A_REAL_ENTITLEMENT"]
    });
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken(minted.token, {
        publicKeysMap: minted.publicKeysMap
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_payload");
});

test("license-crypto: revoked licenseId rejected", async () => {
    const licenseId = crypto.randomUUID();
    const minted = await mintEphemeralLicense({ licenseId });
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken(minted.token, {
        publicKeysMap: minted.publicKeysMap,
        revokedIds: [licenseId]
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "revoked");
});

test("license-crypto: expiresAt past is expired", async () => {
    const now = 2_000_000_000_000;
    const minted = await mintEphemeralLicense({
        issuedAt: now - 10_000,
        expiresAt: now - 1
    });
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken(minted.token, {
        publicKeysMap: minted.publicKeysMap,
        now
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "expired");
});

test("license-crypto: permanent expiresAt null is valid", async () => {
    const minted = await mintEphemeralLicense({ expiresAt: null });
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken(minted.token, {
        publicKeysMap: minted.publicKeysMap,
        now: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
        expectedInstallationId: minted.payload.installationId
    });
    assert.equal(result.ok, true);
});

test("license-crypto: valid A token + A → valid", async () => {
    const installationA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const minted = await mintEphemeralLicense({ installationId: installationA });
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken(minted.token, {
        publicKeysMap: minted.publicKeysMap,
        expectedInstallationId: installationA
    });
    assert.equal(result.ok, true);
});

test("license-crypto: valid A token + B → installation_mismatch", async () => {
    const minted = await mintEphemeralLicense({
        installationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken(minted.token, {
        publicKeysMap: minted.publicKeysMap,
        expectedInstallationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "installation_mismatch");
});

test("license-crypto: tampered A→B payload → bad_signature", async () => {
    const minted = await mintEphemeralLicense({
        installationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });
    const parts = minted.token.split(".");
    const tamperedPayload = b64url(
        JSON.stringify({
            ...minted.payload,
            installationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        })
    );
    const token = `FB2.${tamperedPayload}.${parts[2]}`;
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken(token, {
        publicKeysMap: minted.publicKeysMap,
        expectedInstallationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "bad_signature");
});

test("license-crypto: malformed installationId rejected", async () => {
    const minted = await mintEphemeralLicense({
        installationId: "not-a-uuid"
    });
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken(minted.token, {
        publicKeysMap: minted.publicKeysMap
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_payload");
});

test("license-crypto: missing installationId rejected", async () => {
    const subtle = crypto.webcrypto.subtle;
    const keyPair = await subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
    );
    const publicJwk = await subtle.exportKey("jwk", keyPair.publicKey);
    delete publicJwk.d;
    const payload = {
        v: 1,
        kid: "KT",
        licenseId: crypto.randomUUID(),
        issuedAt: Date.now(),
        expiresAt: null,
        entitlements: ["FULL_APP"]
    };
    const json = JSON.stringify(payload);
    const payloadSegment = b64url(json);
    const signature = await subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        keyPair.privateKey,
        new TextEncoder().encode(payloadSegment)
    );
    const token = `FB2.${payloadSegment}.${signatureSegment(signature)}`;
    const ctx = loadLicenseCrypto();
    const result = await ctx.verifySignedLicenseToken(token, {
        publicKeysMap: { KT: publicJwk }
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_payload");
});
