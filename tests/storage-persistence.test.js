"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadPersistenceHelpers() {
    const context = {
        console,
        Date,
        JSON,
        structuredClone:
            typeof structuredClone === "function" ? structuredClone : undefined,
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
        document: {
            body: { classList: { remove() {}, add() {} } },
            getElementById() {
                return null;
            }
        },
        showToast() {},
        renderAll() {},
        indexedDB: undefined
    };

    vm.createContext(context);
    [
        "constants.js",
        "state.js",
        "money.js",
        "dates.js",
        "calculations.js",
        "storage.js"
    ].forEach((file) => {
        vm.runInContext(
            fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
            context
        );
    });

    context.keys = vm.runInContext(
        `({
            STORAGE_KEY,
            STORAGE_MIGRATION_BACKUP_KEY,
            STORAGE_BACKEND_KEY,
            STORAGE_BACKEND_INDEXEDDB,
            STORAGE_BACKEND_LOCALSTORAGE,
            CURRENT_SCHEMA_VERSION
        })`,
        context
    );

    return context;
}

test("normalizeStoredState migrates v1 money and fills accountId", () => {
    const ctx = loadPersistenceHelpers();
    const normalized = ctx.normalizeStoredState({
        schemaVersion: 1,
        accounts: [{ id: "a1", name: "Основной", openingBalance: 10 }],
        transfers: [],
        transactions: [
            {
                id: "t1",
                date: "2026-08-08",
                type: "expense",
                amount: 12.5,
                category: "Продукты",
                member: "",
                comment: ""
            }
        ],
        goals: [],
        contributions: []
    });

    assert.equal(normalized.schemaVersion, 2);
    assert.equal(normalized.accounts[0].openingBalance, 1000);
    assert.equal(normalized.transactions[0].amount, 1250);
    assert.equal(normalized.transactions[0].accountId, "a1");
});

test("resolveFinancialStorageSource prefers IndexedDB over legacy", () => {
    const ctx = loadPersistenceHelpers();

    assert.equal(
        ctx.resolveFinancialStorageSource({
            indexedDbAvailable: true,
            hasIndexedDbState: true,
            hasLegacyState: true,
            backendMarker: null
        }).action,
        "use-indexeddb"
    );

    assert.equal(
        ctx.resolveFinancialStorageSource({
            indexedDbAvailable: true,
            hasIndexedDbState: false,
            hasLegacyState: true,
            backendMarker: null
        }).action,
        "migrate-legacy"
    );

    assert.equal(
        ctx.resolveFinancialStorageSource({
            indexedDbAvailable: true,
            hasIndexedDbState: false,
            hasLegacyState: true,
            backendMarker: ctx.keys.STORAGE_BACKEND_INDEXEDDB
        }).action,
        "use-indexeddb-empty"
    );

    assert.equal(
        ctx.resolveFinancialStorageSource({
            indexedDbAvailable: false,
            hasIndexedDbState: false,
            hasLegacyState: true,
            backendMarker: ctx.keys.STORAGE_BACKEND_INDEXEDDB
        }).action,
        "error"
    );
});

test("ensureMigrationBackup writes once and leaves existing backup intact", () => {
    const ctx = loadPersistenceHelpers();
    const key = ctx.keys.STORAGE_MIGRATION_BACKUP_KEY;

    assert.equal(ctx.ensureMigrationBackup('{"v":1}'), true);
    assert.equal(ctx.localStorage.getItem(key), '{"v":1}');
    assert.equal(ctx.ensureMigrationBackup('{"v":2}'), false);
    assert.equal(ctx.localStorage.getItem(key), '{"v":1}');
});

test("backend marker helpers only change marker when explicitly set", () => {
    const ctx = loadPersistenceHelpers();
    assert.equal(ctx.getFinancialStorageBackendMarker(), null);

    ctx.setFinancialStorageBackendMarker(ctx.keys.STORAGE_BACKEND_INDEXEDDB);
    assert.equal(
        ctx.getFinancialStorageBackendMarker(),
        ctx.keys.STORAGE_BACKEND_INDEXEDDB
    );
});

test("persistence queue keeps latest snapshot last", async () => {
    const ctx = loadPersistenceHelpers();
    const writes = [];

    ctx.setFinancialStorageBackend(ctx.keys.STORAGE_BACKEND_INDEXEDDB);
    ctx.writeIndexedDbState = async (snapshot) => {
        writes.push(snapshot.transactions.map((item) => item.id).join(","));
    };

    ctx.replaceState({
        ...ctx.createInitialState(),
        transactions: [{ id: "a" }]
    });
    const first = ctx.enqueueStatePersist();

    ctx.replaceState({
        ...ctx.createInitialState(),
        transactions: [{ id: "a" }, { id: "b" }]
    });
    const second = ctx.enqueueStatePersist();

    ctx.replaceState({
        ...ctx.createInitialState(),
        transactions: [{ id: "a" }, { id: "b" }, { id: "c" }]
    });
    const third = ctx.enqueueStatePersist();

    await Promise.all([first, second, third]);
    assert.deepEqual(writes, ["a", "a,b", "a,b,c"]);
});

test("reset clearing marker+backup prevents legacy remigration plan", () => {
    const ctx = loadPersistenceHelpers();

    ctx.localStorage.setItem(
        ctx.keys.STORAGE_KEY,
        JSON.stringify(ctx.createInitialState())
    );
    ctx.ensureMigrationBackup("{}");
    ctx.setFinancialStorageBackendMarker(ctx.keys.STORAGE_BACKEND_INDEXEDDB);

    ctx.localStorage.removeItem(ctx.keys.STORAGE_KEY);
    ctx.clearMigrationBackup();

    const plan = ctx.resolveFinancialStorageSource({
        indexedDbAvailable: true,
        hasIndexedDbState: false,
        hasLegacyState: Boolean(
            ctx.localStorage.getItem(ctx.keys.STORAGE_KEY)
        ),
        backendMarker: ctx.getFinancialStorageBackendMarker()
    });

    assert.equal(plan.action, "use-indexeddb-empty");
    assert.notEqual(plan.action, "migrate-legacy");
});

test("reset invalidates pending save so stale snapshot cannot win", async () => {
    const ctx = loadPersistenceHelpers();
    const writes = [];
    let releaseFirstWrite;
    const firstWriteGate = new Promise((resolve) => {
        releaseFirstWrite = resolve;
    });
    let firstWriteStarted = false;

    ctx.setFinancialStorageBackend(ctx.keys.STORAGE_BACKEND_INDEXEDDB);
    ctx.isIndexedDbSupported = () => true;
    ctx.clearIndexedDbFinancialState = async () => {
        writes.push("CLEAR");
    };
    ctx.writeIndexedDbMeta = async () => undefined;
    ctx.writeIndexedDbState = async (snapshot) => {
        const label =
            snapshot.transactions.length === 0
                ? "EMPTY"
                : snapshot.transactions.map((item) => item.id).join(",");

        if (!firstWriteStarted && label !== "EMPTY") {
            firstWriteStarted = true;
            await firstWriteGate;
        }

        writes.push(label);
    };

    ctx.replaceState({
        ...ctx.createInitialState(),
        transactions: [{ id: "A" }]
    });
    const saveA = ctx.enqueueStatePersist();
    const resetP = ctx.resetFinancialPersistence();

    releaseFirstWrite();
    await Promise.all([saveA, resetP]);
    await ctx.flushFinancialPersistenceQueue();

    assert.ok(writes.includes("EMPTY"));
    assert.equal(writes[writes.length - 1], "EMPTY");
    assert.ok(!writes.includes("A") || writes.indexOf("A") < writes.indexOf("EMPTY"));
});

test("save A, save B, reset, save C — final persisted state is C", async () => {
    const ctx = loadPersistenceHelpers();
    const writes = [];

    ctx.setFinancialStorageBackend(ctx.keys.STORAGE_BACKEND_INDEXEDDB);
    ctx.isIndexedDbSupported = () => true;
    ctx.clearIndexedDbFinancialState = async () => {
        writes.push("CLEAR");
    };
    ctx.writeIndexedDbMeta = async () => undefined;
    ctx.writeIndexedDbState = async (snapshot) => {
        writes.push(
            snapshot.transactions.length === 0
                ? "EMPTY"
                : snapshot.transactions.map((item) => item.id).join(",")
        );
    };

    ctx.replaceState({
        ...ctx.createInitialState(),
        transactions: [{ id: "A" }]
    });
    const saveA = ctx.enqueueStatePersist();

    ctx.replaceState({
        ...ctx.createInitialState(),
        transactions: [{ id: "A" }, { id: "B" }]
    });
    const saveB = ctx.enqueueStatePersist();

    const resetP = ctx.resetFinancialPersistence();

    ctx.replaceState({
        ...ctx.createInitialState(),
        transactions: [{ id: "C" }]
    });
    const saveC = ctx.enqueueStatePersist();

    await Promise.all([saveA, saveB, resetP, saveC]);
    await ctx.flushFinancialPersistenceQueue();

    assert.equal(writes[writes.length - 1], "C");
    assert.ok(writes.includes("EMPTY"));

    const emptyIndex = writes.indexOf("EMPTY");
    const cIndex = writes.lastIndexOf("C");
    assert.ok(emptyIndex >= 0 && cIndex > emptyIndex);

    const aAfterEmpty = writes.slice(emptyIndex + 1).includes("A");
    const bAfterEmpty = writes.slice(emptyIndex + 1).includes("A,B");
    assert.equal(aAfterEmpty, false);
    assert.equal(bAfterEmpty, false);
});
