"use strict";

const STORAGE_KEY = "familyBudgetCalculator_v1";
const THEME_STORAGE_KEY = "familyBudgetTheme_v1";
const DEFAULT_ACCOUNT_ID = "default-account";
const CURRENT_SCHEMA_VERSION = 2;

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
