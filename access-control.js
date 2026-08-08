"use strict";

/* =========================================================
   Access control — Version 8.1
   Soft local trial / licensing (not DRM).
   Separate from financial state / schemaVersion.
   ========================================================= */

let accessRuntimeRecord = null;
let accessAdapters = null;

function createDefaultAccessAdapters(overrides = {}) {
    return {
        now: () => Date.now(),
        getLocalMirror() {
            try {
                const raw = localStorage.getItem(ACCESS_STORAGE_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch (_error) {
                return null;
            }
        },
        setLocalMirror(record) {
            localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(record));
        },
        async readIdbMirror() {
            if (typeof readIndexedDbMetaByKey !== "function") {
                return null;
            }
            try {
                return await readIndexedDbMetaByKey(FAMILY_BUDGET_ACCESS_META_KEY);
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
        getOwnerHashes() {
            return [OWNER_FULL_APP_CODE_SHA256];
        },
        async sha256Hex(text) {
            if (
                typeof crypto !== "undefined" &&
                crypto.subtle &&
                typeof TextEncoder !== "undefined"
            ) {
                const data = new TextEncoder().encode(text);
                const digest = await crypto.subtle.digest("SHA-256", data);
                return Array.from(new Uint8Array(digest))
                    .map((byte) => byte.toString(16).padStart(2, "0"))
                    .join("");
            }

            throw new Error("SHA-256 is unavailable in this environment");
        },
        ...overrides
    };
}

function configureAccessControl(overrides = {}) {
    accessAdapters = createDefaultAccessAdapters(overrides);
    return accessAdapters;
}

function getAccessAdapters() {
    if (!accessAdapters) {
        accessAdapters = createDefaultAccessAdapters();
    }
    return accessAdapters;
}

function normalizePromoCode(rawInput) {
    return String(rawInput || "")
        .trim()
        .toUpperCase()
        .replace(/[\s\-]+/g, "");
}

function isValidAccessTimestamp(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function createFreshAccessRecord(nowMs) {
    return {
        key: FAMILY_BUDGET_ACCESS_META_KEY,
        version: 1,
        firstStartedAt: nowMs,
        maxSeenAt: nowMs,
        entitlements: [],
        activationHash: null,
        activatedAt: null,
        activationKind: null
    };
}

function sanitizeAccessRecord(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const firstStartedAt = Number(raw.firstStartedAt);
    const maxSeenAt = Number(raw.maxSeenAt);

    if (!isValidAccessTimestamp(firstStartedAt)) {
        return null;
    }

    const entitlements = Array.isArray(raw.entitlements)
        ? raw.entitlements.filter((item) => typeof item === "string")
        : [];

    return {
        key: FAMILY_BUDGET_ACCESS_META_KEY,
        version: 1,
        firstStartedAt,
        maxSeenAt: isValidAccessTimestamp(maxSeenAt)
            ? maxSeenAt
            : firstStartedAt,
        entitlements,
        activationHash:
            typeof raw.activationHash === "string" ? raw.activationHash : null,
        activatedAt: isValidAccessTimestamp(Number(raw.activatedAt))
            ? Number(raw.activatedAt)
            : null,
        activationKind:
            typeof raw.activationKind === "string" ? raw.activationKind : null
    };
}

function mergeAccessRecords(primary, secondary) {
    const a = sanitizeAccessRecord(primary);
    const b = sanitizeAccessRecord(secondary);

    if (!a && !b) {
        return null;
    }
    if (!a) {
        return b;
    }
    if (!b) {
        return a;
    }

    const entitlements = Array.from(
        new Set([...(a.entitlements || []), ...(b.entitlements || [])])
    );

    const preferLicensed = a.activationHash ? a : b.activationHash ? b : a;

    return {
        key: FAMILY_BUDGET_ACCESS_META_KEY,
        version: 1,
        firstStartedAt: Math.min(a.firstStartedAt, b.firstStartedAt),
        maxSeenAt: Math.max(a.maxSeenAt, b.maxSeenAt),
        entitlements:
            entitlements.length > 0 ? entitlements : preferLicensed.entitlements,
        activationHash: preferLicensed.activationHash,
        activatedAt: preferLicensed.activatedAt,
        activationKind: preferLicensed.activationKind
    };
}

function computeEffectiveNow(record, wallClockMs) {
    const maxSeen = sanitizeAccessRecord(record)?.maxSeenAt || 0;
    return Math.max(Number(wallClockMs) || 0, maxSeen);
}

function hasEntitlementInRecord(record, entitlement) {
    const safe = sanitizeAccessRecord(record);
    return Boolean(safe && safe.entitlements.includes(entitlement));
}

function deriveAccessStatus(record, effectiveNowMs, trialDurationMs) {
    const safe = sanitizeAccessRecord(record);
    if (!safe) {
        return ACCESS_STATUS.TRIAL;
    }

    if (hasEntitlementInRecord(safe, ACCESS_ENTITLEMENT.FULL_APP)) {
        return safe.activationKind === "owner"
            ? ACCESS_STATUS.OWNER
            : ACCESS_STATUS.LICENSED;
    }

    const elapsed = Math.max(0, effectiveNowMs - safe.firstStartedAt);
    if (elapsed >= trialDurationMs) {
        return ACCESS_STATUS.EXPIRED;
    }

    return ACCESS_STATUS.TRIAL;
}

function getRemainingTrialMs(record, effectiveNowMs, trialDurationMs) {
    const safe = sanitizeAccessRecord(record);
    if (!safe || hasEntitlementInRecord(safe, ACCESS_ENTITLEMENT.FULL_APP)) {
        return 0;
    }

    const endsAt = safe.firstStartedAt + trialDurationMs;
    return Math.max(0, endsAt - effectiveNowMs);
}

function formatRemainingTrial(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) {
        return `${days} дн. ${hours} ч.`;
    }
    if (hours > 0) {
        return `${hours} ч. ${minutes} мин.`;
    }
    return `${Math.max(1, minutes)} мин.`;
}

function touchAccessRecord(record, wallClockMs) {
    const safe = sanitizeAccessRecord(record) || createFreshAccessRecord(wallClockMs);
    const effectiveNow = computeEffectiveNow(safe, wallClockMs);
    return {
        ...safe,
        maxSeenAt: Math.max(safe.maxSeenAt, effectiveNow)
    };
}

function applyLicenseToRecord(record, options) {
    const {
        activationHash,
        activatedAt,
        activationKind = "promo",
        entitlements = [ACCESS_ENTITLEMENT.FULL_APP]
    } = options;

    const safe = sanitizeAccessRecord(record);
    if (!safe) {
        return null;
    }

    return {
        ...safe,
        entitlements: Array.from(new Set(entitlements)),
        activationHash,
        activatedAt,
        activationKind,
        maxSeenAt: Math.max(safe.maxSeenAt, activatedAt)
    };
}

async function persistAccessRecord(record) {
    const adapters = getAccessAdapters();
    const safe = sanitizeAccessRecord(record);
    if (!safe) {
        return null;
    }

    adapters.setLocalMirror(safe);
    try {
        await adapters.writeIdbMirror(safe);
    } catch (error) {
        console.error("Не удалось сохранить access metadata в IndexedDB:", error);
    }

    accessRuntimeRecord = safe;
    return safe;
}

async function initializeAccessControl(options = {}) {
    const adapters = configureAccessControl(options.adapters || {});
    const wallClock = adapters.now();

    const localRecord = sanitizeAccessRecord(adapters.getLocalMirror());
    let idbRecord = null;
    try {
        idbRecord = sanitizeAccessRecord(await adapters.readIdbMirror());
    } catch (_error) {
        idbRecord = null;
    }

    let merged = mergeAccessRecords(localRecord, idbRecord);

    if (!merged) {
        merged = createFreshAccessRecord(wallClock);
    } else {
        merged = touchAccessRecord(merged, wallClock);
    }

    await persistAccessRecord(merged);
    return getAccessSnapshot();
}

function getAccessRecord() {
    return sanitizeAccessRecord(accessRuntimeRecord);
}

function getAccessSnapshot() {
    const adapters = getAccessAdapters();
    const record = getAccessRecord();
    const wallClock = adapters.now();
    const effectiveNow = computeEffectiveNow(record, wallClock);
    const status = deriveAccessStatus(record, effectiveNow, TRIAL_DURATION_MS);
    const remainingMs = getRemainingTrialMs(
        record,
        effectiveNow,
        TRIAL_DURATION_MS
    );

    const uiStatus =
        status === ACCESS_STATUS.OWNER ? ACCESS_STATUS.LICENSED : status;

    return {
        status: uiStatus,
        internalStatus: status,
        firstStartedAt: record?.firstStartedAt || null,
        maxSeenAt: record?.maxSeenAt || null,
        entitlements: record?.entitlements || [],
        remainingTrialMs: remainingMs,
        remainingTrialLabel: formatRemainingTrial(remainingMs),
        isLicensed:
            status === ACCESS_STATUS.LICENSED || status === ACCESS_STATUS.OWNER,
        isTrial: status === ACCESS_STATUS.TRIAL,
        isExpired: status === ACCESS_STATUS.EXPIRED
    };
}

function hasEntitlement(entitlement) {
    return hasEntitlementInRecord(getAccessRecord(), entitlement);
}

function hasFinancialWriteAccess() {
    const snapshot = getAccessSnapshot();
    return snapshot.isLicensed || snapshot.isTrial;
}

function requireFinancialWriteAccess() {
    if (hasFinancialWriteAccess()) {
        return true;
    }

    if (typeof showToast === "function") {
        showToast(FINANCIAL_WRITE_DENIED_MESSAGE, "error");
    }

    if (typeof renderAccessStatus === "function") {
        renderAccessStatus();
    }

    if (typeof applyAccessModeToUi === "function") {
        applyAccessModeToUi();
    }

    return false;
}

async function refreshAccessClock() {
    const adapters = getAccessAdapters();
    const current = getAccessRecord();
    if (!current) {
        return getAccessSnapshot();
    }

    const touched = touchAccessRecord(current, adapters.now());
    await persistAccessRecord(touched);
    return getAccessSnapshot();
}

async function activatePromoCode(rawInput, options = {}) {
    const adapters = getAccessAdapters();
    const normalized = normalizePromoCode(rawInput);

    if (!normalized || normalized.length > PROMO_CODE_MAX_LENGTH) {
        return {
            ok: false,
            reason: "invalid"
        };
    }

    const hash = await adapters.sha256Hex(normalized);
    const allowed = new Set([
        ...adapters.getOwnerHashes(),
        ...(options.extraHashes || [])
    ]);

    if (!allowed.has(hash)) {
        return {
            ok: false,
            reason: "mismatch"
        };
    }

    const now = adapters.now();
    const current =
        getAccessRecord() || createFreshAccessRecord(now);
    const next = applyLicenseToRecord(current, {
        activationHash: hash,
        activatedAt: now,
        activationKind: adapters.getOwnerHashes().includes(hash)
            ? "owner"
            : "promo",
        entitlements: [ACCESS_ENTITLEMENT.FULL_APP]
    });

    await persistAccessRecord(next);

    return {
        ok: true,
        snapshot: getAccessSnapshot()
    };
}

/** Pure helpers exported for unit tests. */
var AccessControlPure = {
    normalizePromoCode,
    createFreshAccessRecord,
    sanitizeAccessRecord,
    mergeAccessRecords,
    computeEffectiveNow,
    deriveAccessStatus,
    getRemainingTrialMs,
    formatRemainingTrial,
    touchAccessRecord,
    applyLicenseToRecord,
    hasEntitlementInRecord
};
