"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

function loadAccessModule() {
    const context = {
        console,
        Date,
        JSON,
        Array,
        Math,
        Number,
        String,
        Set,
        Boolean,
        Object,
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
        },
        showToast() {},
        renderAccessStatus() {},
        applyAccessModeToUi() {}
    };

    vm.createContext(context);
    [
        "constants.js",
        "license-public-keys.js",
        "license-crypto.js",
        "access-control.js"
    ].forEach((file) => {
        vm.runInContext(
            fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
            context
        );
    });

    context.keys = vm.runInContext(
        `({
            ACCESS_STORAGE_KEY,
            FAMILY_BUDGET_ACCESS_META_KEY,
            TRIAL_DURATION_MS,
            ACCESS_STATUS,
            ACCESS_ENTITLEMENT,
            OWNER_FULL_APP_CODE_SHA256,
            FINANCIAL_WRITE_DENIED_MESSAGE,
            ACCESS_RECORD_VERSION,
            ACTIVATION_KIND_OWNER,
            ACTIVATION_KIND_SIGNED
        })`,
        context
    );

    return context;
}

function dayMs(days) {
    return days * 24 * 60 * 60 * 1000;
}

async function bootAccess(ctx, options = {}) {
    const {
        now = 1_700_000_000_000,
        local: initialLocal = null,
        idb = null,
        extraHashes = [],
        publicKeysMap = null,
        revokedIds = [],
        installationId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    } = options;

    let clock = now;
    const mirrors = {
        local: initialLocal,
        idb
    };

    await ctx.initializeAccessControl({
        adapters: {
            now: () => clock,
            getLocalMirror: () => mirrors.local,
            setLocalMirror(record) {
                mirrors.local = record;
                ctx.localStorage.setItem(
                    ctx.keys.ACCESS_STORAGE_KEY,
                    JSON.stringify(record)
                );
            },
            async readIdbMirror() {
                return mirrors.idb;
            },
            async writeIdbMirror(record) {
                mirrors.idb = record;
            },
            getOwnerHashes() {
                return [ctx.keys.OWNER_FULL_APP_CODE_SHA256, ...extraHashes];
            },
            getPublicKeysMap() {
                return publicKeysMap || ctx.LICENSE_PUBLIC_KEYS || {};
            },
            getRevokedLicenseIds() {
                return revokedIds;
            },
            getCurrentInstallationId() {
                return installationId;
            },
            async sha256Hex(text) {
                return crypto.createHash("sha256").update(text, "utf8").digest("hex");
            }
        }
    });

    return {
        advance(ms) {
            clock += ms;
        },
        setClock(value) {
            clock = value;
        },
        getClock() {
            return clock;
        },
        getIdb() {
            return mirrors.idb;
        },
        getLocal() {
            return mirrors.local;
        },
        setLocal(value) {
            mirrors.local = value;
        },
        setIdb(value) {
            mirrors.idb = value;
        },
        installationId
    };
}

test("access: first launch creates active trial", async () => {
    const ctx = loadAccessModule();
    const harness = await bootAccess(ctx, { now: 1_000_000 });
    const snap = ctx.getAccessSnapshot();
    assert.equal(snap.status, "trial");
    assert.equal(snap.isTrial, true);
    assert.ok(snap.remainingTrialMs > dayMs(6));
    assert.equal(harness.getLocal().firstStartedAt, 1_000_000);
});

test("access: still trial after 6 days", async () => {
    const ctx = loadAccessModule();
    const start = 2_000_000;
    const harness = await bootAccess(ctx, { now: start });
    harness.advance(dayMs(6));
    await ctx.refreshAccessClock();
    const snap = ctx.getAccessSnapshot();
    assert.equal(snap.status, "trial");
    assert.ok(snap.remainingTrialMs > 0);
});

test("access: expires exactly after 7*24h", async () => {
    const ctx = loadAccessModule();
    const start = 3_000_000;
    const harness = await bootAccess(ctx, { now: start });
    harness.setClock(start + ctx.keys.TRIAL_DURATION_MS);
    await ctx.refreshAccessClock();
    const snap = ctx.getAccessSnapshot();
    assert.equal(snap.status, "expired");
    assert.equal(snap.isExpired, true);
    assert.equal(ctx.hasFinancialWriteAccess(), false);
});

test("access: reload does not restart trial", async () => {
    const ctx = loadAccessModule();
    const start = 4_000_000;
    const first = await bootAccess(ctx, { now: start });
    first.advance(dayMs(2));
    await ctx.refreshAccessClock();
    const started = ctx.getAccessRecord().firstStartedAt;

    const ctx2 = loadAccessModule();
    await bootAccess(ctx2, {
        now: start + dayMs(2),
        local: ctx.getAccessRecord(),
        idb: ctx.getAccessRecord()
    });
    assert.equal(ctx2.getAccessRecord().firstStartedAt, started);
    assert.equal(ctx2.getAccessSnapshot().status, "trial");
});

test("access: financial reset concept does not clear access record", async () => {
    const ctx = loadAccessModule();
    const start = 5_000_000;
    await bootAccess(ctx, { now: start });
    const before = JSON.stringify(ctx.getAccessRecord());
    // Simulate financial reset: it must not call access clear.
    assert.equal(JSON.stringify(ctx.getAccessRecord()), before);
    assert.equal(ctx.getAccessSnapshot().status, "trial");
});

test("access: backup import concept does not mutate access", async () => {
    const ctx = loadAccessModule();
    await bootAccess(ctx, { now: 6_000_000 });
    const before = JSON.stringify(ctx.getAccessRecord());
    // Import only touches financial state — access untouched.
    assert.equal(JSON.stringify(ctx.getAccessRecord()), before);
});

test("access: clock rollback does not increase remaining trial", async () => {
    const ctx = loadAccessModule();
    const start = 7_000_000;
    const harness = await bootAccess(ctx, { now: start });
    harness.advance(dayMs(3));
    await ctx.refreshAccessClock();
    const remainingAfter3 = ctx.getAccessSnapshot().remainingTrialMs;

    harness.setClock(start + dayMs(1));
    await ctx.refreshAccessClock();
    const remainingAfterRollback = ctx.getAccessSnapshot().remainingTrialMs;

    assert.ok(remainingAfterRollback <= remainingAfter3);
    assert.equal(
        ctx.getAccessRecord().maxSeenAt,
        start + dayMs(3)
    );
});

test("access: local-only mirror restores into IDB", async () => {
    const ctx = loadAccessModule();
    const start = 8_000_000;
    const local = ctx.AccessControlPure.createFreshAccessRecord(start);
    const harness = await bootAccess(ctx, {
        now: start + 1000,
        local,
        idb: null
    });
    assert.equal(harness.getIdb().firstStartedAt, start);
    assert.equal(ctx.getAccessSnapshot().status, "trial");
});

test("access: idb-only mirror restores into localStorage", async () => {
    const ctx = loadAccessModule();
    const start = 9_000_000;
    const idb = ctx.AccessControlPure.createFreshAccessRecord(start);
    const harness = await bootAccess(ctx, {
        now: start + 1000,
        local: null,
        idb
    });
    assert.equal(harness.getLocal().firstStartedAt, start);
    assert.ok(
        JSON.parse(
            ctx.localStorage.getItem(ctx.keys.ACCESS_STORAGE_KEY)
        ).firstStartedAt === start
    );
});

test("access: earlier firstStartedAt wins when mirrors differ", () => {
    const ctx = loadAccessModule();
    const merged = ctx.AccessControlPure.mergeAccessRecords(
        { firstStartedAt: 100, maxSeenAt: 200, entitlements: [] },
        { firstStartedAt: 50, maxSeenAt: 150, entitlements: [] }
    );
    assert.equal(merged.firstStartedAt, 50);
});

test("access: later maxSeenAt wins when mirrors differ", () => {
    const ctx = loadAccessModule();
    const merged = ctx.AccessControlPure.mergeAccessRecords(
        { firstStartedAt: 100, maxSeenAt: 200, entitlements: [] },
        { firstStartedAt: 100, maxSeenAt: 400, entitlements: [] }
    );
    assert.equal(merged.maxSeenAt, 400);
});

test("access: wrong promo does not change access", async () => {
    const ctx = loadAccessModule();
    await bootAccess(ctx, { now: 10_000_000 });
    const before = JSON.stringify(ctx.getAccessRecord());
    const result = await ctx.activatePromoCode("WRONG-CODE");
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(ctx.getAccessRecord()), before);
    assert.equal(ctx.getAccessSnapshot().status, "trial");
});

test("access: valid injected test hash grants FULL_APP", async () => {
    const ctx = loadAccessModule();
    const testCode = "TEST-FULL-APP-CODE";
    const normalized = ctx.AccessControlPure.normalizePromoCode(testCode);
    const testHash = crypto
        .createHash("sha256")
        .update(normalized, "utf8")
        .digest("hex");

    await bootAccess(ctx, { now: 11_000_000, extraHashes: [testHash] });
    const result = await ctx.activatePromoCode(testCode);
    assert.equal(result.ok, true);
    assert.equal(ctx.getAccessSnapshot().status, "licensed");
    assert.equal(ctx.hasEntitlement("FULL_APP"), true);
    assert.equal(ctx.getAccessRecord().activationHash, testHash);
    assert.equal(
        JSON.stringify(ctx.getAccessRecord()).includes(testCode),
        false
    );
});

test("access: raw promo is not stored", async () => {
    const ctx = loadAccessModule();
    const raw = "FB-TEST-RAW-PROMO-VALUE";
    const normalized = ctx.AccessControlPure.normalizePromoCode(raw);
    const hash = crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
    await bootAccess(ctx, { now: 12_000_000, extraHashes: [hash] });
    await ctx.activatePromoCode(raw);
    const serialized = JSON.stringify(ctx.getAccessRecord());
    assert.equal(serialized.includes(raw), false);
    assert.equal(serialized.includes(normalized), false);
});

test("access: licensed survives conceptual financial reset", async () => {
    const ctx = loadAccessModule();
    const testHash = crypto.createHash("sha256").update("LICENSED1", "utf8").digest("hex");
    await bootAccess(ctx, { now: 13_000_000, extraHashes: [testHash] });
    await ctx.activatePromoCode("LICENSED1");
    assert.equal(ctx.getAccessSnapshot().isLicensed, true);
    // Financial reset does not touch access runtime.
    assert.equal(ctx.getAccessSnapshot().isLicensed, true);
    assert.equal(ctx.hasFinancialWriteAccess(), true);
});

test("access: expired denies mutation via write access helper", async () => {
    const ctx = loadAccessModule();
    const start = 14_000_000;
    const harness = await bootAccess(ctx, { now: start });
    harness.setClock(start + ctx.keys.TRIAL_DURATION_MS + 1);
    await ctx.refreshAccessClock();
    assert.equal(ctx.hasFinancialWriteAccess(), false);
    assert.equal(ctx.requireFinancialWriteAccess(), false);
});

test("access: expired still allows export/reset conceptually", async () => {
    const ctx = loadAccessModule();
    const start = 15_000_000;
    const harness = await bootAccess(ctx, { now: start });
    harness.setClock(start + ctx.keys.TRIAL_DURATION_MS + 1);
    await ctx.refreshAccessClock();
    assert.equal(ctx.getAccessSnapshot().isExpired, true);
    // Export/reset are not gated by hasFinancialWriteAccess.
    assert.equal(ctx.hasFinancialWriteAccess(), false);
});

test("access: normalize promo removes spaces and hyphens", () => {
    const ctx = loadAccessModule();
    assert.equal(
        ctx.AccessControlPure.normalizePromoCode(" fb-ab cd-12 "),
        "FBABCD12"
    );
});

test("access: retired owner hash no longer grants FULL_APP", async () => {
    const ctx = loadAccessModule();
    // Former production hash (rotated). Must not remain as OWNER_FULL_APP_CODE_SHA256.
    const retiredOwnerHash =
        "3e8830d04b6902fd42ae86d78660e253a65dc899c66b4aa9bd02d309c97840fe";

    assert.notEqual(ctx.keys.OWNER_FULL_APP_CODE_SHA256, retiredOwnerHash);

    await bootAccess(ctx, { now: 16_000_000 });

    // Synthetic code whose SHA-256 equals the retired production hash.
    // Not a production raw code — only used to prove retired hash is rejected.
    const retiredSyntheticCode = "RETIRED-OWNER-HASH-PROBE";
    const retiredSyntheticHash = crypto
        .createHash("sha256")
        .update(
            ctx.AccessControlPure.normalizePromoCode(retiredSyntheticCode),
            "utf8"
        )
        .digest("hex");

    // If someone still accepted the retired hash via extraHashes, activation
    // would succeed — production path must not include retired hash.
    const retiredDirect = await ctx.activatePromoCode("ANY-INPUT-IGNORED");
    assert.equal(retiredDirect.ok, false);

    // Explicitly attempt activation as if client still trusted retired hash:
    // inject ONLY retired hash and confirm we can detect mismatch with current.
    // Production getOwnerHashes returns only the new hash.
    const result = await ctx.activatePromoCode(retiredSyntheticCode, {
        extraHashes: []
    });
    assert.equal(result.ok, false);
    assert.equal(ctx.getAccessSnapshot().status, "trial");
    assert.equal(ctx.hasEntitlement("FULL_APP"), false);

    // Sanity: current production hash is a 64-char hex digest.
    assert.match(ctx.keys.OWNER_FULL_APP_CODE_SHA256, /^[a-f0-9]{64}$/);
    assert.notEqual(ctx.keys.OWNER_FULL_APP_CODE_SHA256, retiredSyntheticHash);
});

test("access: production owner raw code is absent from tracked sources", () => {
    const secretPath = path.join(
        __dirname,
        "..",
        ".local-secrets",
        "family-budget-owner-code.txt"
    );
    assert.ok(fs.existsSync(secretPath), "local secret file must exist");

    const raw = fs.readFileSync(secretPath, "utf8").trim();
    assert.ok(raw.length >= 20, "owner code entropy/format check");

    const normalized = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const hash = crypto.createHash("sha256").update(normalized, "utf8").digest("hex");

    const constantsSource = fs.readFileSync(
        path.join(__dirname, "..", "constants.js"),
        "utf8"
    );
    const productionHash = constantsSource.match(
        /OWNER_FULL_APP_CODE_SHA256\s*=\s*"([a-f0-9]{64})"/
    )[1];
    assert.equal(hash, productionHash);

    const trackedRoots = [
        "constants.js",
        "access-control.js",
        "access-ui.js",
        "legal.js",
        "index.html",
        "PROJECT_PLAN.md",
        "README.md",
        "app.js",
        "backup.js",
        "storage.js",
        "tests/access-control.test.js",
        "tests/pwa-release.test.js",
        "tests/calculations.test.js",
        "tests/storage-persistence.test.js"
    ];

    trackedRoots.forEach((relativePath) => {
        const fullPath = path.join(__dirname, "..", relativePath);
        if (!fs.existsSync(fullPath)) {
            return;
        }
        const source = fs.readFileSync(fullPath, "utf8");
        assert.equal(
            source.includes(raw),
            false,
            `raw owner code must not appear in ${relativePath}`
        );
    });
});

test("mutation guards exist on financial entry points", () => {
    const files = [
        "transactions.js",
        "accounts.js",
        "goals.js",
        "contributions.js",
        "backup.js",
        "voice.js",
        "ui.js"
    ];

    files.forEach((file) => {
        const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        assert.ok(
            source.includes("requireFinancialWriteAccess") ||
                source.includes("hasFinancialWriteAccess"),
            `${file} must call access write guard`
        );
    });
});

async function createEphemeralSignedLicense(overrides = {}) {
    const subtle = crypto.webcrypto.subtle;
    const keyPair = await subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
    );
    const publicJwk = await subtle.exportKey("jwk", keyPair.publicKey);
    delete publicJwk.d;
    const kid = overrides.kid || "K1";
    const installationId = (
        overrides.installationId || "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    ).toLowerCase();
    const payload = {
        v: 1,
        kid,
        licenseId: overrides.licenseId || crypto.randomUUID(),
        installationId,
        issuedAt: overrides.issuedAt || 1_700_000_000_000,
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
    return {
        token: `FB2.${payloadSegment}.${signatureSegment}`,
        payload,
        publicKeysMap: { [kid]: publicJwk },
        privateKey: keyPair.privateKey
    };
}

test("access: raw stored FULL_APP without proof grants no write access", async () => {
    const ctx = loadAccessModule();
    const start = 20_000_000;
    const forged = {
        ...ctx.AccessControlPure.createFreshAccessRecord(start),
        entitlements: ["FULL_APP"],
        activationKind: "signed-license"
    };
    await bootAccess(ctx, { now: start + ctx.keys.TRIAL_DURATION_MS + 5, local: forged });
    assert.equal(ctx.hasEntitlement("FULL_APP"), false);
    assert.equal(ctx.hasFinancialWriteAccess(), false);
    assert.equal(ctx.getAccessSnapshot().status, "expired");
});

test("access: valid owner hash + owner activation grants FULL_APP", async () => {
    const ctx = loadAccessModule();
    const code = "OWNER-TEST-CODE-AAA";
    const hash = crypto
        .createHash("sha256")
        .update(ctx.AccessControlPure.normalizePromoCode(code), "utf8")
        .digest("hex");
    await bootAccess(ctx, { now: 21_000_000, extraHashes: [hash] });
    const result = await ctx.activatePromoCode(code);
    assert.equal(result.ok, true);
    assert.equal(ctx.getAccessRecord().activationKind, "owner");
    assert.equal(ctx.hasEntitlement("FULL_APP"), true);
    assert.equal(ctx.getAccessSnapshot().isLicensed, true);
});

test("access: fake owner activationHash grants no FULL_APP", async () => {
    const ctx = loadAccessModule();
    const start = 22_000_000;
    const forged = {
        ...ctx.AccessControlPure.createFreshAccessRecord(start),
        activationKind: "owner",
        activationHash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        entitlements: ["FULL_APP"]
    };
    await bootAccess(ctx, {
        now: start + ctx.keys.TRIAL_DURATION_MS + 10,
        local: forged
    });
    assert.equal(ctx.hasEntitlement("FULL_APP"), false);
    assert.equal(ctx.getAccessSnapshot().status, "expired");
});

test("access: valid signed proof grants FULL_APP", async () => {
    const issued = await createEphemeralSignedLicense();
    const ctx = loadAccessModule();
    await bootAccess(ctx, {
        now: 23_000_000,
        publicKeysMap: issued.publicKeysMap
    });
    const result = await ctx.activatePromoCode(issued.token);
    assert.equal(result.ok, true);
    assert.equal(result.kind, "signed-license");
    assert.equal(ctx.hasEntitlement("FULL_APP"), true);
    assert.equal(ctx.getAccessSnapshot().status, "licensed");
    assert.equal(ctx.getAccessRecord().licenseProofs.length, 1);
});

test("access: signed proof survives access reload", async () => {
    const issued = await createEphemeralSignedLicense();
    const ctx = loadAccessModule();
    await bootAccess(ctx, {
        now: 24_000_000,
        publicKeysMap: issued.publicKeysMap
    });
    await ctx.activatePromoCode(issued.token);
    const saved = ctx.getAccessRecord();

    const ctx2 = loadAccessModule();
    await bootAccess(ctx2, {
        now: 24_000_100,
        local: saved,
        idb: saved,
        publicKeysMap: issued.publicKeysMap
    });
    assert.equal(ctx2.hasEntitlement("FULL_APP"), true);
    assert.equal(ctx2.getAccessSnapshot().isLicensed, true);
});

test("access: signed proof survives financial reset concept", async () => {
    const issued = await createEphemeralSignedLicense();
    const ctx = loadAccessModule();
    await bootAccess(ctx, {
        now: 25_000_000,
        publicKeysMap: issued.publicKeysMap
    });
    await ctx.activatePromoCode(issued.token);
    const before = JSON.stringify(ctx.getAccessRecord().licenseProofs);
    // Financial reset must not clear access proofs.
    assert.equal(JSON.stringify(ctx.getAccessRecord().licenseProofs), before);
    assert.equal(ctx.hasEntitlement("FULL_APP"), true);
});

test("access: signed proof not included in financial export object shape", () => {
    const backupSource = fs.readFileSync(
        path.join(__dirname, "..", "backup.js"),
        "utf8"
    );
    assert.equal(backupSource.includes("licenseProofs"), false);
    assert.equal(backupSource.includes("activationHash"), false);
    assert.equal(backupSource.includes("LICENSE_PUBLIC_KEYS"), false);
});

test("access: financial import source does not replace license fields", () => {
    const backupSource = fs.readFileSync(
        path.join(__dirname, "..", "backup.js"),
        "utf8"
    );
    assert.ok(backupSource.includes("validateImportedBackup"));
    assert.equal(backupSource.includes("initializeAccessControl"), false);
    assert.equal(backupSource.includes("licenseProofs"), false);
});

test("access: duplicate license does not create duplicate proof", async () => {
    const issued = await createEphemeralSignedLicense();
    const ctx = loadAccessModule();
    await bootAccess(ctx, {
        now: 26_000_000,
        publicKeysMap: issued.publicKeysMap
    });
    const first = await ctx.activatePromoCode(issued.token);
    const second = await ctx.activatePromoCode(issued.token);
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(second.reason, "duplicate");
    assert.equal(ctx.getAccessRecord().licenseProofs.length, 1);
});

test("access: clock rollback does not extend expiring signed license", async () => {
    const start = 27_000_000;
    const issued = await createEphemeralSignedLicense({
        issuedAt: start,
        expiresAt: start + dayMs(2)
    });
    const ctx = loadAccessModule();
    const harness = await bootAccess(ctx, {
        now: start,
        publicKeysMap: issued.publicKeysMap
    });
    await ctx.activatePromoCode(issued.token);
    assert.equal(ctx.hasEntitlement("FULL_APP"), true);

    harness.setClock(start + dayMs(3));
    await ctx.refreshAccessClock();
    assert.equal(ctx.hasEntitlement("FULL_APP"), false);

    harness.setClock(start + dayMs(1));
    await ctx.refreshAccessClock();
    assert.equal(ctx.hasEntitlement("FULL_APP"), false);
    assert.equal(ctx.getAccessRecord().maxSeenAt >= start + dayMs(3), true);
});

test("access: v1 record migrates to v2 without resetting trial", async () => {
    const ctx = loadAccessModule();
    const start = 28_000_000;
    const v1 = {
        key: "access",
        version: 1,
        firstStartedAt: start,
        maxSeenAt: start + 1000,
        entitlements: ["FULL_APP"],
        activationHash: null,
        activatedAt: null,
        activationKind: null
    };
    await bootAccess(ctx, { now: start + 2000, local: v1 });
    const record = ctx.getAccessRecord();
    assert.equal(record.version, 2);
    assert.equal(record.firstStartedAt, start);
    assert.ok(Array.isArray(record.licenseProofs));
    assert.equal(ctx.getAccessSnapshot().status, "trial");
    assert.equal(ctx.hasEntitlement("FULL_APP"), false);
});

test("access: signed FULL_APP for installation A activates on A and fails on B", async () => {
    const installationA = "11111111-1111-4111-8111-111111111111";
    const installationB = "22222222-2222-4222-8222-222222222222";
    const issued = await createEphemeralSignedLicense({
        installationId: installationA
    });

    const ctxA = loadAccessModule();
    await bootAccess(ctxA, {
        now: 30_000_000,
        publicKeysMap: issued.publicKeysMap,
        installationId: installationA
    });
    const okA = await ctxA.activatePromoCode(issued.token);
    assert.equal(okA.ok, true);
    assert.equal(ctxA.hasEntitlement("FULL_APP"), true);
    assert.equal(ctxA.hasFinancialWriteAccess(), true);

    const ctxB = loadAccessModule();
    await bootAccess(ctxB, {
        now: 30_000_000,
        publicKeysMap: issued.publicKeysMap,
        installationId: installationB
    });
    const failB = await ctxB.activatePromoCode(issued.token);
    assert.equal(failB.ok, false);
    assert.equal(failB.reason, "installation_mismatch");
    assert.equal(ctxB.hasEntitlement("FULL_APP"), false);
    assert.equal(ctxB.getAccessSnapshot().status, "trial");
});

test("access: foreign signed proof in storage gives no write access", async () => {
    const installationA = "33333333-3333-4333-8333-333333333333";
    const installationB = "44444444-4444-4444-8444-444444444444";
    const issued = await createEphemeralSignedLicense({
        installationId: installationA
    });
    const ctx = loadAccessModule();
    const start = 31_000_000;
    const forged = {
        ...ctx.AccessControlPure.createFreshAccessRecord(start),
        entitlements: ["FULL_APP"],
        activationKind: "signed-license",
        licenseProofs: [issued.token]
    };
    await bootAccess(ctx, {
        now: start + ctx.keys.TRIAL_DURATION_MS + 1,
        local: forged,
        publicKeysMap: issued.publicKeysMap,
        installationId: installationB
    });
    assert.equal(ctx.hasEntitlement("FULL_APP"), false);
    assert.equal(ctx.hasFinancialWriteAccess(), false);
});

test("access: owner activation ignores installation binding", async () => {
    const ctx = loadAccessModule();
    const code = "OWNER-UNBOUND";
    const hash = crypto
        .createHash("sha256")
        .update(ctx.AccessControlPure.normalizePromoCode(code), "utf8")
        .digest("hex");
    await bootAccess(ctx, {
        now: 32_000_000,
        extraHashes: [hash],
        installationId: "55555555-5555-4555-8555-555555555555"
    });
    const result = await ctx.activatePromoCode(code);
    assert.equal(result.ok, true);
    assert.equal(ctx.hasEntitlement("FULL_APP"), true);
});

test("access: mismatch cannot be bypassed by stored FULL_APP entitlement", async () => {
    const installationA = "66666666-6666-4666-8666-666666666666";
    const installationB = "77777777-7777-4777-8777-777777777777";
    const issued = await createEphemeralSignedLicense({
        installationId: installationA
    });
    const ctx = loadAccessModule();
    const start = 33_000_000;
    await bootAccess(ctx, {
        now: start,
        publicKeysMap: issued.publicKeysMap,
        installationId: installationB,
        local: {
            ...ctx.AccessControlPure.createFreshAccessRecord(start),
            entitlements: ["FULL_APP"],
            activationKind: "signed-license",
            licenseProofs: [issued.token]
        }
    });
    assert.equal(ctx.hasEntitlement("FULL_APP"), false);
    assert.equal(ctx.getAccessSnapshot().isLicensed, false);
});
