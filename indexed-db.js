"use strict";

/* =========================================================
   IndexedDB infrastructure (Этап 8)
   Persistence only — business logic stays on runtime `state`.
   ========================================================= */

let familyBudgetDbPromise = null;

function isIndexedDbSupported() {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
            reject(transaction.error || new Error("IndexedDB transaction failed"));
        transaction.onabort = () =>
            reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
}

function notifyIndexedDbBlocked() {
    if (typeof showToast === "function") {
        showToast(
            "Другое окно приложения мешает обновлению хранилища. Закройте лишние вкладки и перезапустите приложение.",
            "error"
        );
    }
}

function notifyIndexedDbVersionChange() {
    if (typeof showToast === "function") {
        showToast(
            "Хранилище приложения обновляется. Закройте другие открытые окна приложения и перезапустите его.",
            "error"
        );
    }
}

function openFamilyBudgetDatabase() {
    if (!isIndexedDbSupported()) {
        return Promise.reject(new Error("IndexedDB is not supported"));
    }

    if (familyBudgetDbPromise) {
        return familyBudgetDbPromise;
    }

    familyBudgetDbPromise = new Promise((resolve, reject) => {
        let settled = false;
        const request = indexedDB.open(
            FAMILY_BUDGET_DB_NAME,
            FAMILY_BUDGET_DB_VERSION
        );

        request.onerror = () => {
            familyBudgetDbPromise = null;
            if (!settled) {
                settled = true;
                reject(request.error || new Error("Failed to open IndexedDB"));
            }
        };

        request.onblocked = () => {
            notifyIndexedDbBlocked();
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains("appState")) {
                db.createObjectStore("appState", { keyPath: "key" });
            }

            if (!db.objectStoreNames.contains("meta")) {
                db.createObjectStore("meta", { keyPath: "key" });
            }
        };

        request.onsuccess = () => {
            const db = request.result;

            db.onversionchange = () => {
                try {
                    db.close();
                } catch (_error) {
                    // ignore
                }
                familyBudgetDbPromise = null;
                notifyIndexedDbVersionChange();
            };

            if (!settled) {
                settled = true;
                resolve(db);
            }
        };
    });

    return familyBudgetDbPromise;
}

async function closeFamilyBudgetDatabase() {
    if (!familyBudgetDbPromise) {
        return;
    }

    try {
        const db = await familyBudgetDbPromise;
        db.close();
    } catch (_error) {
        // ignore close errors
    } finally {
        familyBudgetDbPromise = null;
    }
}

async function readIndexedDbState() {
    const db = await openFamilyBudgetDatabase();
    const transaction = db.transaction("appState", "readonly");
    const store = transaction.objectStore("appState");
    const record = await requestToPromise(store.get(FAMILY_BUDGET_APP_STATE_KEY));
    await transactionDone(transaction);

    if (!record || typeof record !== "object" || !record.state) {
        return null;
    }

    return record.state;
}

async function writeIndexedDbState(stateSnapshot) {
    const db = await openFamilyBudgetDatabase();
    const record = {
        key: FAMILY_BUDGET_APP_STATE_KEY,
        state: stateSnapshot,
        updatedAt: new Date().toISOString(),
        schemaVersion:
            stateSnapshot && stateSnapshot.schemaVersion !== undefined
                ? stateSnapshot.schemaVersion
                : CURRENT_SCHEMA_VERSION
    };

    const transaction = db.transaction("appState", "readwrite");
    const store = transaction.objectStore("appState");
    store.put(record);
    await transactionDone(transaction);
    return record;
}

async function readIndexedDbMeta() {
    const db = await openFamilyBudgetDatabase();
    const transaction = db.transaction("meta", "readonly");
    const store = transaction.objectStore("meta");
    const record = await requestToPromise(store.get(FAMILY_BUDGET_META_KEY));
    await transactionDone(transaction);
    return record || null;
}

async function writeIndexedDbMeta(metaPatch) {
    const db = await openFamilyBudgetDatabase();

    const readTx = db.transaction("meta", "readonly");
    const existing =
        (await requestToPromise(
            readTx.objectStore("meta").get(FAMILY_BUDGET_META_KEY)
        )) || {
            key: FAMILY_BUDGET_META_KEY,
            backend: STORAGE_BACKEND_INDEXEDDB,
            databaseVersion: FAMILY_BUDGET_DB_VERSION
        };
    await transactionDone(readTx);

    const next = {
        ...existing,
        ...metaPatch,
        key: FAMILY_BUDGET_META_KEY,
        backend: STORAGE_BACKEND_INDEXEDDB,
        databaseVersion: FAMILY_BUDGET_DB_VERSION
    };

    const writeTx = db.transaction("meta", "readwrite");
    writeTx.objectStore("meta").put(next);
    await transactionDone(writeTx);
    return next;
}

async function readIndexedDbMetaByKey(key) {
    const db = await openFamilyBudgetDatabase();
    const transaction = db.transaction("meta", "readonly");
    const store = transaction.objectStore("meta");
    const record = await requestToPromise(store.get(key));
    await transactionDone(transaction);
    return record || null;
}

async function writeIndexedDbMetaByKey(record) {
    if (!record || typeof record !== "object" || !record.key) {
        throw new Error("IndexedDB meta record requires a key");
    }

    const db = await openFamilyBudgetDatabase();
    const transaction = db.transaction("meta", "readwrite");
    transaction.objectStore("meta").put(record);
    await transactionDone(transaction);
    return record;
}

async function clearIndexedDbFinancialState() {
    const db = await openFamilyBudgetDatabase();
    const transaction = db.transaction(["appState", "meta"], "readwrite");
    transaction.objectStore("appState").delete(FAMILY_BUDGET_APP_STATE_KEY);
    // Only financial storage meta — never delete access/license metadata.
    transaction.objectStore("meta").delete(FAMILY_BUDGET_META_KEY);
    await transactionDone(transaction);
}
