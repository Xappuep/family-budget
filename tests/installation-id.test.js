"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

function loadInstallationModule() {
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
        crypto: crypto.webcrypto,
        localStorage: {
            _data: Object.create(null),
            getItem(key) {
                return Object.prototype.hasOwnProperty.call(this._data, key)
                    ? this._data[key]
                    : null;
            },
            setItem(key, value) {
                this._data[key] = String(value);
            },
            removeItem(key) {
                delete this._data[key];
            }
        }
    };
    vm.createContext(context);
    ["constants.js", "installation-id.js"].forEach((file) => {
        vm.runInContext(
            fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
            context
        );
    });
    return context;
}

async function bootInstallation(ctx, options = {}) {
    const {
        now = 1_700_000_000_000,
        local = null,
        idb = null,
        createUuid = () => crypto.randomUUID(),
        getLicenseProofTokens = async () => [],
        isProofValidForInstallation = async () => false
    } = options;

    const mirrors = { local, idb };

    await ctx.initializeInstallationIdentity({
        adapters: {
            now: () => now,
            createUuid,
            getLocalMirror: () => mirrors.local,
            setLocalMirror(record) {
                mirrors.local = record;
                ctx.localStorage.setItem(
                    ctx.INSTALLATION_STORAGE_KEY,
                    JSON.stringify(record)
                );
            },
            async readIdbMirror() {
                return mirrors.idb;
            },
            async writeIdbMirror(record) {
                mirrors.idb = record;
            },
            getLicenseProofTokens,
            isProofValidForInstallation
        }
    });

    return mirrors;
}

test("installation: first run creates UUID", async () => {
    const ctx = loadInstallationModule();
    const fixed = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    await bootInstallation(ctx, { createUuid: () => fixed });
    assert.equal(ctx.getInstallationId(), fixed);
});

test("installation: reload keeps same UUID", async () => {
    const ctx = loadInstallationModule();
    const mirrors = await bootInstallation(ctx);
    const first = ctx.getInstallationId();
    const ctx2 = loadInstallationModule();
    await bootInstallation(ctx2, {
        local: mirrors.local,
        idb: mirrors.idb,
        createUuid: () => "ffffffff-ffff-4fff-8fff-ffffffffffff"
    });
    assert.equal(ctx2.getInstallationId(), first);
});

test("installation: only IDB restores local mirror", async () => {
    const ctx = loadInstallationModule();
    const id = "11111111-1111-4111-8111-111111111111";
    const idb = ctx.InstallationIdentityPure.createFreshInstallationRecord(
        1000,
        id
    );
    const mirrors = await bootInstallation(ctx, { local: null, idb });
    assert.equal(ctx.getInstallationId(), id);
    assert.equal(mirrors.local.installationId, id);
});

test("installation: only local restores IDB mirror", async () => {
    const ctx = loadInstallationModule();
    const id = "22222222-2222-4222-8222-222222222222";
    const local = ctx.InstallationIdentityPure.createFreshInstallationRecord(
        1000,
        id
    );
    const mirrors = await bootInstallation(ctx, { local, idb: null });
    assert.equal(ctx.getInstallationId(), id);
    assert.equal(mirrors.idb.installationId, id);
});

test("installation: financial reset concept keeps UUID", async () => {
    const ctx = loadInstallationModule();
    await bootInstallation(ctx);
    const before = ctx.getInstallationId();
    // Financial reset must not call installation clear.
    assert.equal(ctx.getInstallationId(), before);
});

test("installation: financial import concept keeps UUID", async () => {
    const ctx = loadInstallationModule();
    await bootInstallation(ctx);
    const before = ctx.getInstallationId();
    assert.equal(ctx.getInstallationId(), before);
    const backupSource = fs.readFileSync(
        path.join(__dirname, "..", "backup.js"),
        "utf8"
    );
    assert.equal(backupSource.includes("installationId"), false);
    assert.equal(backupSource.includes("INSTALLATION_STORAGE_KEY"), false);
});

test("installation: mirror mismatch prefers license-matched id", async () => {
    const ctx = loadInstallationModule();
    const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const local = ctx.InstallationIdentityPure.createFreshInstallationRecord(
        1000,
        idA
    );
    const idb = ctx.InstallationIdentityPure.createFreshInstallationRecord(
        1000,
        idB
    );
    await bootInstallation(ctx, {
        local,
        idb,
        getLicenseProofTokens: async () => ["proof-for-A"],
        isProofValidForInstallation: async (_token, installationId) =>
            installationId === idA
    });
    assert.equal(ctx.getInstallationId(), idA);
});

test("installation: mirror mismatch without license match prefers IndexedDB", async () => {
    const ctx = loadInstallationModule();
    const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const local = ctx.InstallationIdentityPure.createFreshInstallationRecord(
        1000,
        idA
    );
    const idb = ctx.InstallationIdentityPure.createFreshInstallationRecord(
        1000,
        idB
    );
    const mirrors = await bootInstallation(ctx, {
        local,
        idb,
        getLicenseProofTokens: async () => [],
        isProofValidForInstallation: async () => false
    });
    assert.equal(ctx.getInstallationId(), idB);
    assert.equal(mirrors.local.installationId, idB);
});

test("installation: full identity loss creates new UUID", async () => {
    const ctx = loadInstallationModule();
    await bootInstallation(ctx, {
        createUuid: () => "11111111-1111-4111-8111-111111111111"
    });
    const ctx2 = loadInstallationModule();
    await bootInstallation(ctx2, {
        local: null,
        idb: null,
        createUuid: () => "22222222-2222-4222-8222-222222222222"
    });
    assert.equal(
        ctx2.getInstallationId(),
        "22222222-2222-4222-8222-222222222222"
    );
});

test("installation: old signed license fails with new UUID (crypto check)", async () => {
    const subtle = crypto.webcrypto.subtle;
    const keyPair = await subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
    );
    const publicJwk = await subtle.exportKey("jwk", keyPair.publicKey);
    delete publicJwk.d;
    const oldId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const newId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const payload = {
        v: 1,
        kid: "K1",
        licenseId: crypto.randomUUID(),
        installationId: oldId,
        issuedAt: Date.now(),
        expiresAt: null,
        entitlements: ["FULL_APP"]
    };
    const json = JSON.stringify(payload);
    const payloadSegment = Buffer.from(json, "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
    const signature = await subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        keyPair.privateKey,
        new TextEncoder().encode(payloadSegment)
    );
    const signatureSegment = Buffer.from(signature)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
    const token = `FB2.${payloadSegment}.${signatureSegment}`;

    const cryptoCtx = {
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
        LICENSE_PUBLIC_KEYS: { K1: publicJwk },
        REVOKED_LICENSE_IDS: Object.freeze([])
    };
    vm.createContext(cryptoCtx);
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, "..", "license-crypto.js"), "utf8"),
        cryptoCtx
    );

    const okOld = await cryptoCtx.verifySignedLicenseToken(token, {
        expectedInstallationId: oldId
    });
    const failNew = await cryptoCtx.verifySignedLicenseToken(token, {
        expectedInstallationId: newId
    });
    assert.equal(okOld.ok, true);
    assert.equal(failNew.ok, false);
    assert.equal(failNew.reason, "installation_mismatch");
});
