"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");

async function withTempDir(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-license-gen-"));
    try {
        return await fn(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

async function createTempSigningKey(dir) {
    const subtle = crypto.webcrypto.subtle;
    const keyPair = await subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
    );
    const privateJwk = await subtle.exportKey("jwk", keyPair.privateKey);
    const publicJwk = await subtle.exportKey("jwk", keyPair.publicKey);
    delete publicJwk.d;
    const keyPath = path.join(dir, "license-signing-key.json");
    fs.writeFileSync(
        keyPath,
        JSON.stringify(
            {
                kid: "K1",
                privateJwk,
                publicJwk,
                createdAt: new Date().toISOString()
            },
            null,
            2
        ),
        "utf8"
    );
    return { keyPath, publicJwk, privateJwk };
}

function loadVerifier(publicKeysMap) {
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
        LICENSE_PUBLIC_KEYS: publicKeysMap,
        REVOKED_LICENSE_IDS: Object.freeze([])
    };
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, "..", "license-crypto.js"), "utf8"),
        context
    );
    return context;
}

test("generator: refuses missing/invalid installationId; includes valid UUID", async () => {
    await withTempDir(async (dir) => {
        const { keyPath, publicJwk } = await createTempSigningKey(dir);
        const registryPath = path.join(dir, "licenses-registry.json");
        const lib = await import(
            pathToFileURL(
                path.join(__dirname, "..", "scripts", "license-issue-lib.mjs")
            ).href
        );
        const key = lib.loadSigningKeyFile(keyPath);
        const privateKey = await lib.importPrivateSigningKey(key.privateJwk);
        const installationId = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";

        await assert.rejects(
            () => lib.issueFullAppLicense({ privateKey, kid: key.kid }),
            /installationId/i
        );
        await assert.rejects(
            () =>
                lib.issueFullAppLicense({
                    privateKey,
                    kid: key.kid,
                    installationId: "not-a-uuid"
                }),
            /UUID/i
        );

        const one = await lib.issueFullAppLicense({
            privateKey,
            kid: key.kid,
            installationId
        });
        const two = await lib.issueFullAppLicense({
            privateKey,
            kid: key.kid,
            installationId
        });

        assert.equal(one.payload.installationId, installationId);
        assert.notEqual(one.payload.licenseId, two.payload.licenseId);
        assert.notEqual(one.token, two.token);

        const payloadJson = Buffer.from(
            one.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
            "base64"
        ).toString("utf8");
        assert.ok(payloadJson.includes(installationId));
        assert.equal(payloadJson.includes("note"), false);
        assert.equal(payloadJson.includes("local-only-note"), false);

        lib.appendLicenseToRegistry(registryPath, {
            licenseId: one.payload.licenseId,
            installationId: one.payload.installationId,
            kid: one.payload.kid,
            issuedAt: one.payload.issuedAt,
            expiresAt: one.payload.expiresAt,
            entitlements: one.payload.entitlements,
            note: "local-only-note",
            token: one.token
        });

        const registry = lib.readRegistry(registryPath);
        assert.equal(registry.licenses[0].note, "local-only-note");
        assert.equal(registry.licenses[0].installationId, installationId);

        const verified = await loadVerifier({ K1: publicJwk }).verifySignedLicenseToken(
            one.token,
            {
                publicKeysMap: { K1: publicJwk },
                expectedInstallationId: installationId
            }
        );
        assert.equal(verified.ok, true);

        const mismatch = await loadVerifier({ K1: publicJwk }).verifySignedLicenseToken(
            one.token,
            {
                publicKeysMap: { K1: publicJwk },
                expectedInstallationId: "bbbbbbbb-bbbb-4bbb-8bbb-222222222222"
            }
        );
        assert.equal(mismatch.ok, false);
        assert.equal(mismatch.reason, "installation_mismatch");
    });
});

test("generator: missing signing key fails clearly without creating a new key", async () => {
    await withTempDir(async (dir) => {
        const lib = await import(
            pathToFileURL(
                path.join(__dirname, "..", "scripts", "license-issue-lib.mjs")
            ).href
        );
        const missing = path.join(dir, "missing-key.json");
        assert.throws(() => lib.loadSigningKeyFile(missing), /not found/i);
        assert.equal(fs.existsSync(missing), false);
    });
});
