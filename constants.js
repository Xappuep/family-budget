"use strict";

const STORAGE_KEY = "familyBudgetCalculator_v1";
const STORAGE_MIGRATION_BACKUP_KEY = "familyBudgetCalculator_v1_migrationBackup";
const STORAGE_BACKEND_KEY = "familyBudgetStorageBackend_v1";
const THEME_STORAGE_KEY = "familyBudgetTheme_v1";
const VOICE_HABITS_STORAGE_KEY = "familyBudgetVoiceHabits_v1";
const DEFAULT_ACCOUNT_ID = "default-account";
const CURRENT_SCHEMA_VERSION = 2;

const FAMILY_BUDGET_DB_NAME = "familyBudgetDB";
const FAMILY_BUDGET_DB_VERSION = 1;
const FAMILY_BUDGET_APP_STATE_KEY = "current";
const FAMILY_BUDGET_META_KEY = "storage";
const STORAGE_BACKEND_INDEXEDDB = "indexeddb";
const STORAGE_BACKEND_LOCALSTORAGE = "localStorage";

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
