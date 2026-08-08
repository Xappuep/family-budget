"use strict";

/* =========================================================
   Access control — Version 8.2
   Soft licensing + offline signed FB2 licenses.
   Stored entitlements are NOT trusted; only verified proofs.
   ========================================================= */

let accessRuntimeRecord = null;
let verifiedAccessRuntime = null;
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
        getRevokedLicenseIds() {
            return typeof REVOKED_LICENSE_IDS !== "undefined"
                ? REVOKED_LICENSE_IDS
                : [];
        },
        getPublicKeysMap() {
            return typeof LICENSE_PUBLIC_KEYS !== "undefined"
                ? LICENSE_PUBLIC_KEYS
                : {};
        },
        getCurrentInstallationId() {
            if (typeof getInstallationId === "function") {
                return getInstallationId();
            }
            return null;
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
        async verifySignedToken(raw, nowMs) {
            if (typeof verifySignedLicenseToken !== "function") {
                return { ok: false, reason: "unavailable" };
            }
            return verifySignedLicenseToken(raw, {
                publicKeysMap: this.getPublicKeysMap(),
                revokedIds: this.getRevokedLicenseIds(),
                now: typeof nowMs === "number" ? nowMs : this.now(),
                expectedInstallationId: this.getCurrentInstallationId()
            });
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

function normalizeActivationInput(rawInput) {
    return String(rawInput || "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .replace(/\s+/g, "");
}

function isValidAccessTimestamp(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function createFreshAccessRecord(nowMs) {
    return {
        key: FAMILY_BUDGET_ACCESS_META_KEY,
        version: ACCESS_RECORD_VERSION,
        firstStartedAt: nowMs,
        maxSeenAt: nowMs,
        entitlements: [],
        activationHash: null,
        activatedAt: null,
        activationKind: null,
        licenseProofs: []
    };
}

function sanitizeLicenseProofs(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    const seen = new Set();
    const out = [];
    raw.forEach((item) => {
        if (typeof item !== "string") {
            return;
        }
        const token = normalizeActivationInput(item);
        if (!token || !token.startsWith("FB2.") || seen.has(token)) {
            return;
        }
        if (token.length > ACTIVATION_CODE_MAX_LENGTH) {
            return;
        }
        seen.add(token);
        out.push(token);
    });
    return out;
}

function migrateAccessRecordToV2(raw) {
    const base = sanitizeAccessRecordShape(raw);
    if (!base) {
        return null;
    }
    return {
        ...base,
        version: ACCESS_RECORD_VERSION,
        licenseProofs: sanitizeLicenseProofs(
            raw.licenseProofs || (raw.licenseProof ? [raw.licenseProof] : [])
        )
    };
}

function sanitizeAccessRecordShape(raw) {
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
        version: Number(raw.version) === 1 ? 1 : ACCESS_RECORD_VERSION,
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
            typeof raw.activationKind === "string" ? raw.activationKind : null,
        licenseProofs: sanitizeLicenseProofs(raw.licenseProofs)
    };
}

function sanitizeAccessRecord(raw) {
    const shape = sanitizeAccessRecordShape(raw);
    if (!shape) {
        return null;
    }
    return migrateAccessRecordToV2(shape);
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

    const preferOwner =
        a.activationKind === ACTIVATION_KIND_OWNER && a.activationHash
            ? a
            : b.activationKind === ACTIVATION_KIND_OWNER && b.activationHash
              ? b
              : a.activationHash
                ? a
                : b;

    return {
        key: FAMILY_BUDGET_ACCESS_META_KEY,
        version: ACCESS_RECORD_VERSION,
        firstStartedAt: Math.min(a.firstStartedAt, b.firstStartedAt),
        maxSeenAt: Math.max(a.maxSeenAt, b.maxSeenAt),
        entitlements: [],
        activationHash: preferOwner.activationHash,
        activatedAt: preferOwner.activatedAt,
        activationKind: preferOwner.activationKind,
        licenseProofs: sanitizeLicenseProofs([
            ...a.licenseProofs,
            ...b.licenseProofs
        ])
    };
}

function computeEffectiveNow(record, wallClockMs) {
    const maxSeen = sanitizeAccessRecord(record)?.maxSeenAt || 0;
    return Math.max(Number(wallClockMs) || 0, maxSeen);
}

function createEmptyVerifiedAccess(effectiveNowMs) {
    return {
        effectiveNow: effectiveNowMs,
        entitlements: [],
        sources: [],
        ownerVerified: false,
        signedLicenses: [],
        status: ACCESS_STATUS.TRIAL,
        remainingTrialMs: 0
    };
}

async function computeVerifiedAccess(record, adapters) {
    const wallClock = adapters.now();
    const safe = sanitizeAccessRecord(record);
    const effectiveNow = computeEffectiveNow(safe, wallClock);
    const verified = createEmptyVerifiedAccess(effectiveNow);
    const entitlementSet = new Set();

    if (
        safe &&
        safe.activationKind === ACTIVATION_KIND_OWNER &&
        typeof safe.activationHash === "string" &&
        adapters.getOwnerHashes().includes(safe.activationHash)
    ) {
        verified.ownerVerified = true;
        entitlementSet.add(ACCESS_ENTITLEMENT.FULL_APP);
        verified.sources.push({ kind: "owner" });
    }

    if (safe) {
        for (const token of safe.licenseProofs) {
            const result = await adapters.verifySignedToken(token, effectiveNow);
            if (!result || !result.ok) {
                continue;
            }
            const payload = result.payload;
            if (
                payload.expiresAt !== null &&
                payload.expiresAt !== undefined &&
                Number(payload.expiresAt) <= effectiveNow
            ) {
                continue;
            }
            (payload.entitlements || []).forEach((item) =>
                entitlementSet.add(item)
            );
            verified.signedLicenses.push({
                licenseId: payload.licenseId,
                entitlements: payload.entitlements || [],
                expiresAt: payload.expiresAt,
                kid: payload.kid
            });
            verified.sources.push({
                kind: "signed-license",
                licenseId: payload.licenseId
            });
        }
    }

    verified.entitlements = Array.from(entitlementSet);

    const hasFullApp = verified.entitlements.includes(
        ACCESS_ENTITLEMENT.FULL_APP
    );

    if (hasFullApp) {
        verified.status = verified.ownerVerified
            ? ACCESS_STATUS.OWNER
            : ACCESS_STATUS.LICENSED;
        verified.remainingTrialMs = 0;
    } else if (safe) {
        const elapsed = Math.max(0, effectiveNow - safe.firstStartedAt);
        if (elapsed >= TRIAL_DURATION_MS) {
            verified.status = ACCESS_STATUS.EXPIRED;
            verified.remainingTrialMs = 0;
        } else {
            verified.status = ACCESS_STATUS.TRIAL;
            verified.remainingTrialMs = TRIAL_DURATION_MS - elapsed;
        }
    } else {
        verified.status = ACCESS_STATUS.TRIAL;
        verified.remainingTrialMs = TRIAL_DURATION_MS;
    }

    return verified;
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
    const safe =
        sanitizeAccessRecord(record) || createFreshAccessRecord(wallClockMs);
    const effectiveNow = computeEffectiveNow(safe, wallClockMs);
    return {
        ...safe,
        version: ACCESS_RECORD_VERSION,
        maxSeenAt: Math.max(safe.maxSeenAt, effectiveNow)
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
    verifiedAccessRuntime = await computeVerifiedAccess(safe, adapters);
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

function getVerifiedAccess() {
    return verifiedAccessRuntime;
}

function getAccessSnapshot() {
    const adapters = getAccessAdapters();
    const record = getAccessRecord();
    const verified =
        verifiedAccessRuntime ||
        createEmptyVerifiedAccess(adapters.now());

    const uiStatus =
        verified.status === ACCESS_STATUS.OWNER
            ? ACCESS_STATUS.LICENSED
            : verified.status;

    const primaryLicense = verified.signedLicenses[0] || null;

    return {
        status: uiStatus,
        internalStatus: verified.status,
        firstStartedAt: record?.firstStartedAt || null,
        maxSeenAt: record?.maxSeenAt || null,
        entitlements: verified.entitlements.slice(),
        remainingTrialMs: verified.remainingTrialMs,
        remainingTrialLabel: formatRemainingTrial(verified.remainingTrialMs),
        isLicensed:
            verified.status === ACCESS_STATUS.LICENSED ||
            verified.status === ACCESS_STATUS.OWNER,
        isTrial: verified.status === ACCESS_STATUS.TRIAL,
        isExpired: verified.status === ACCESS_STATUS.EXPIRED,
        ownerVerified: verified.ownerVerified,
        licenseIdShort: primaryLicense
            ? String(primaryLicense.licenseId).slice(0, 8)
            : null,
        signedLicenseCount: verified.signedLicenses.length
    };
}

function hasEntitlement(entitlement) {
    const verified = getVerifiedAccess();
    return Boolean(
        verified && verified.entitlements.includes(entitlement)
    );
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

async function activateOwnerCode(rawInput, options = {}) {
    const adapters = getAccessAdapters();
    const normalized = normalizePromoCode(rawInput);
    const maxLen = ACTIVATION_CODE_MAX_LENGTH || PROMO_CODE_MAX_LENGTH;

    if (!normalized || normalized.length > maxLen) {
        return { ok: false, reason: "invalid" };
    }

    const hash = await adapters.sha256Hex(normalized);
    const allowed = new Set([
        ...adapters.getOwnerHashes(),
        ...(options.extraHashes || [])
    ]);

    if (!allowed.has(hash)) {
        return { ok: false, reason: "mismatch" };
    }

    const now = adapters.now();
    const current = getAccessRecord() || createFreshAccessRecord(now);
    const next = {
        ...current,
        version: ACCESS_RECORD_VERSION,
        entitlements: [],
        activationHash: hash,
        activatedAt: now,
        activationKind: adapters.getOwnerHashes().includes(hash)
            ? ACTIVATION_KIND_OWNER
            : "promo",
        maxSeenAt: Math.max(current.maxSeenAt, now),
        licenseProofs: current.licenseProofs || []
    };

    await persistAccessRecord(next);

    return {
        ok: true,
        kind: "owner",
        snapshot: getAccessSnapshot()
    };
}

async function activateSignedLicenseToken(rawInput) {
    const adapters = getAccessAdapters();
    const token = normalizeActivationInput(rawInput);

    if (!token || token.length > ACTIVATION_CODE_MAX_LENGTH) {
        return { ok: false, reason: "invalid" };
    }

    if (typeof isFb2Token === "function" && !isFb2Token(token)) {
        return { ok: false, reason: "malformed" };
    }

    const now = adapters.now();
    const current = getAccessRecord() || createFreshAccessRecord(now);
    const verification = await adapters.verifySignedToken(token);

    if (!verification || !verification.ok) {
        const reason = verification && verification.reason;
        if (reason === "revoked") {
            return { ok: false, reason: "revoked" };
        }
        if (reason === "expired") {
            return { ok: false, reason: "expired" };
        }
        if (reason === "installation_mismatch") {
            return { ok: false, reason: "installation_mismatch" };
        }
        if (reason === "bad_signature") {
            return { ok: false, reason: "bad_signature" };
        }
        if (reason === "malformed" || reason === "oversized") {
            return { ok: false, reason: "malformed" };
        }
        return { ok: false, reason: "bad_signature" };
    }

    const licenseId = verification.payload.licenseId;
    const existingProofs = current.licenseProofs || [];

    for (const existing of existingProofs) {
        const existingCheck = await adapters.verifySignedToken(existing);
        if (
            existingCheck &&
            existingCheck.ok &&
            existingCheck.payload &&
            existingCheck.payload.licenseId === licenseId
        ) {
            return { ok: false, reason: "duplicate", licenseId };
        }
    }

    const next = {
        ...current,
        version: ACCESS_RECORD_VERSION,
        entitlements: [],
        activationKind:
            current.activationKind === ACTIVATION_KIND_OWNER
                ? ACTIVATION_KIND_OWNER
                : ACTIVATION_KIND_SIGNED,
        maxSeenAt: Math.max(current.maxSeenAt, now),
        licenseProofs: sanitizeLicenseProofs([...existingProofs, token])
    };

    if (!next.activationHash && next.activationKind === ACTIVATION_KIND_SIGNED) {
        next.activatedAt = now;
    }

    await persistAccessRecord(next);

    return {
        ok: true,
        kind: "signed-license",
        licenseId,
        snapshot: getAccessSnapshot()
    };
}

async function activatePromoCode(rawInput, options = {}) {
    const trimmed = normalizeActivationInput(rawInput);

    if (!trimmed) {
        return { ok: false, reason: "invalid" };
    }

    if (
        (typeof isFb2Token === "function" && isFb2Token(trimmed)) ||
        trimmed.startsWith("FB2.")
    ) {
        return activateSignedLicenseToken(trimmed);
    }

    return activateOwnerCode(rawInput, options);
}

/** Pure helpers exported for unit tests. */
var AccessControlPure = {
    normalizePromoCode,
    normalizeActivationInput,
    createFreshAccessRecord,
    sanitizeAccessRecord,
    migrateAccessRecordToV2,
    mergeAccessRecords,
    computeEffectiveNow,
    formatRemainingTrial,
    touchAccessRecord,
    sanitizeLicenseProofs
};
