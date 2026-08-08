"use strict";

const STORAGE_KEY = "familyBudgetCalculator_v1";
const STORAGE_MIGRATION_BACKUP_KEY = "familyBudgetCalculator_v1_migrationBackup";
const STORAGE_BACKEND_KEY = "familyBudgetStorageBackend_v1";
const THEME_STORAGE_KEY = "familyBudgetTheme_v1";
const VOICE_HABITS_STORAGE_KEY = "familyBudgetVoiceHabits_v1";
const ACCESS_STORAGE_KEY = "familyBudgetAccess_v1";
const DEFAULT_ACCOUNT_ID = "default-account";
const CURRENT_SCHEMA_VERSION = 2;
const APP_DISPLAY_VERSION = "8.1";

const FAMILY_BUDGET_DB_NAME = "familyBudgetDB";
const FAMILY_BUDGET_DB_VERSION = 1;
const FAMILY_BUDGET_APP_STATE_KEY = "current";
const FAMILY_BUDGET_META_KEY = "storage";
const FAMILY_BUDGET_ACCESS_META_KEY = "access";
const STORAGE_BACKEND_INDEXEDDB = "indexeddb";
const STORAGE_BACKEND_LOCALSTORAGE = "localStorage";

/** 7 × 24 hours from first Version 8.1 launch in this installation storage. */
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const ACCESS_STATUS = Object.freeze({
    TRIAL: "trial",
    LICENSED: "licensed",
    EXPIRED: "expired",
    OWNER: "owner"
});

const ACCESS_ENTITLEMENT = Object.freeze({
    FULL_APP: "FULL_APP"
});

/**
 * SHA-256 of the normalized owner FULL_APP activation code.
 * Raw code is never committed — only the hash.
 */
const OWNER_FULL_APP_CODE_SHA256 =
    "f8923d634a198c2abe825150455184c1a2e951008a407f725e2263011d33f628";

const PROMO_CODE_MAX_LENGTH = 80;

const FINANCIAL_WRITE_DENIED_MESSAGE =
    "Пробный период завершён. Данные доступны для просмотра. Для продолжения работы активируйте приложение во вкладке «Ещё».";

const GOAL_TYPE = Object.freeze({
    DEPOSIT: "deposit",
    CREDIT: "credit"
});

/** Подсказки категорий для Quick Add (не datalist — Android плохо его показывает). */
const QUICK_ADD_CATEGORIES = Object.freeze({
    expense: Object.freeze([
        "Продукты",
        "Жильё",
        "Коммунальные услуги",
        "Транспорт",
        "Здоровье",
        "Образование",
        "Дети",
        "Одежда",
        "Развлечения",
        "Путешествия",
        "Кредиты",
        "Другое"
    ]),
    income: Object.freeze([
        "Зарплата",
        "Подработка",
        "Продажи",
        "Подарки",
        "Другое"
    ])
});
