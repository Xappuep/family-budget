"use strict";

/* =========================================================
   Installation identity — random UUID per app install.
   Not a hardware fingerprint. Survives financial reset.
   ========================================================= */

let installationRuntimeRecord = null;
let installationAdapters = null;

const INSTALLATION_UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeInstallationId(raw) {
    return String(raw == null ? "" : raw)
        .trim()
        .toLowerCase();
}

function isValidInstallationId(raw) {
    const value = normalizeInstallationId(raw);
    return INSTALLATION_UUID_PATTERN.test(value);
}

function createDefaultInstallationAdapters(overrides = {}) {
    return {
        now: () => Date.now(),
        createUuid() {
            if (
                typeof crypto !== "undefined" &&
                typeof crypto.randomUUID === "function"
            ) {
                return crypto.randomUUID();
            }
            throw new Error("crypto.randomUUID is unavailable");
        },
        getLocalMirror() {
            try {
                const raw = localStorage.getItem(INSTALLATION_STORAGE_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch (_error) {
                return null;
            }
        },
        setLocalMirror(record) {
            localStorage.setItem(
                INSTALLATION_STORAGE_KEY,
                JSON.stringify(record)
            );
        },
        async readIdbMirror() {
            if (typeof readIndexedDbMetaByKey !== "function") {
                return null;
            }
            try {
                return await readIndexedDbMetaByKey(
                    FAMILY_BUDGET_INSTALLATION_META_KEY
                );
            } catch (_error) {
                return null;
            }
        },
        async writeIdbMirror(record) {
            if (typeof writeIndexedDbMetaByKey !== "function") {
                return;
            }
            await writeIndexedDbMetaByKey(record);
        },
        /**
         * Return license proof tokens for mismatch resolution.
         * @returns {Promise<string[]>}
         */
        async getLicenseProofTokens() {
            const tokens = [];
            const seen = new Set();
            const pushFrom = (raw) => {
                if (!raw || !Array.isArray(raw.licenseProofs)) {
                    return;
                }
                raw.licenseProofs.forEach((token) => {
                    if (typeof token === "string" && !seen.has(token)) {
                        seen.add(token);
                        tokens.push(token);
                    }
                });
            };
            try {
                const localRaw = localStorage.getItem(ACCESS_STORAGE_KEY);
                if (localRaw) {
                    pushFrom(JSON.parse(localRaw));
                }
            } catch (_error) {
                // ignore
            }
            try {
                if (typeof readIndexedDbMetaByKey === "function") {
                    const idbAccess = await readIndexedDbMetaByKey(
                        FAMILY_BUDGET_ACCESS_META_KEY
                    );
                    pushFrom(idbAccess);
                }
            } catch (_error) {
                // ignore
            }
            return tokens;
        },
        /**
         * Verify whether a proof is valid for a candidate installationId.
         */
        async isProofValidForInstallation(token, installationId) {
            if (typeof verifySignedLicenseToken !== "function") {
                return false;
            }
            const result = await verifySignedLicenseToken(token, {
                expectedInstallationId: installationId,
                now: this.now()
            });
            return Boolean(result && result.ok);
        },
        ...overrides
    };
}

function configureInstallationIdentity(overrides = {}) {
    installationAdapters = createDefaultInstallationAdapters(overrides);
    return installationAdapters;
}

function getInstallationAdapters() {
    if (!installationAdapters) {
        installationAdapters = createDefaultInstallationAdapters();
    }
    return installationAdapters;
}

function sanitizeInstallationRecord(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const installationId = normalizeInstallationId(raw.installationId);
    if (!isValidInstallationId(installationId)) {
        return null;
    }
    const createdAt = Number(raw.createdAt);
    return {
        key: FAMILY_BUDGET_INSTALLATION_META_KEY,
        version: INSTALLATION_RECORD_VERSION,
        installationId,
        createdAt:
            typeof createdAt === "number" &&
            Number.isFinite(createdAt) &&
            createdAt > 0
                ? createdAt
                : null
    };
}

function createFreshInstallationRecord(nowMs, uuid) {
    return {
        key: FAMILY_BUDGET_INSTALLATION_META_KEY,
        version: INSTALLATION_RECORD_VERSION,
        installationId: normalizeInstallationId(uuid),
        createdAt: nowMs
    };
}

async function persistInstallationRecord(record) {
    const adapters = getInstallationAdapters();
    const safe = sanitizeInstallationRecord(record);
    if (!safe) {
        return null;
    }
    if (safe.createdAt == null) {
        safe.createdAt = adapters.now();
    }
    adapters.setLocalMirror(safe);
    try {
        await adapters.writeIdbMirror(safe);
    } catch (error) {
        console.error(
            "Не удалось сохранить installation metadata в IndexedDB:",
            error
        );
    }
    installationRuntimeRecord = safe;
    return safe;
}

async function pickInstallationIdWhenMirrorsDiffer(localSafe, idbSafe, adapters) {
    const candidates = [idbSafe.installationId, localSafe.installationId];
    const unique = [...new Set(candidates)];
    const tokens = (await adapters.getLicenseProofTokens()) || [];

    const matching = [];
    for (const candidate of unique) {
        let matched = false;
        for (const token of tokens) {
            try {
                if (
                    await adapters.isProofValidForInstallation(token, candidate)
                ) {
                    matched = true;
                    break;
                }
            } catch (_error) {
                // Ignore verify errors during resolution.
            }
        }
        if (matched) {
            matching.push(candidate);
        }
    }

    if (matching.length === 1) {
        return matching[0];
    }

    // Prefer IndexedDB as primary when no unique license match.
    return idbSafe.installationId;
}

async function initializeInstallationIdentity(options = {}) {
    const adapters = configureInstallationIdentity(options.adapters || {});
    const wallClock = adapters.now();

    const localSafe = sanitizeInstallationRecord(adapters.getLocalMirror());
    let idbSafe = null;
    try {
        idbSafe = sanitizeInstallationRecord(await adapters.readIdbMirror());
    } catch (_error) {
        idbSafe = null;
    }

    let chosen;

    if (!localSafe && !idbSafe) {
        chosen = createFreshInstallationRecord(
            wallClock,
            adapters.createUuid()
        );
    } else if (localSafe && !idbSafe) {
        chosen = {
            ...localSafe,
            createdAt: localSafe.createdAt || wallClock
        };
    } else if (!localSafe && idbSafe) {
        chosen = {
            ...idbSafe,
            createdAt: idbSafe.createdAt || wallClock
        };
    } else if (localSafe.installationId === idbSafe.installationId) {
        chosen = {
            key: FAMILY_BUDGET_INSTALLATION_META_KEY,
            version: INSTALLATION_RECORD_VERSION,
            installationId: localSafe.installationId,
            createdAt:
                Math.min(
                    localSafe.createdAt || wallClock,
                    idbSafe.createdAt || wallClock
                ) || wallClock
        };
    } else {
        const pickedId = await pickInstallationIdWhenMirrorsDiffer(
            localSafe,
            idbSafe,
            adapters
        );
        const source =
            pickedId === idbSafe.installationId ? idbSafe : localSafe;
        chosen = {
            key: FAMILY_BUDGET_INSTALLATION_META_KEY,
            version: INSTALLATION_RECORD_VERSION,
            installationId: pickedId,
            createdAt: source.createdAt || wallClock
        };
    }

    await persistInstallationRecord(chosen);
    return getInstallationSnapshot();
}

function getInstallationRecord() {
    return sanitizeInstallationRecord(installationRuntimeRecord);
}

function getInstallationId() {
    const record = getInstallationRecord();
    return record ? record.installationId : null;
}

function getInstallationSnapshot() {
    const record = getInstallationRecord();
    return {
        installationId: record ? record.installationId : null,
        createdAt: record ? record.createdAt : null,
        version: record ? record.version : null
    };
}

var InstallationIdentityPure = {
    normalizeInstallationId,
    isValidInstallationId,
    sanitizeInstallationRecord,
    createFreshInstallationRecord,
    pickInstallationIdWhenMirrorsDiffer
};
