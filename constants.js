"use strict";

const STORAGE_KEY = "familyBudgetCalculator_v1";
const THEME_STORAGE_KEY = "familyBudgetTheme_v1";
const DEFAULT_ACCOUNT_ID = "default-account";
const CURRENT_SCHEMA_VERSION = 2;

const GOAL_TYPE = Object.freeze({
    DEPOSIT: "deposit",
    CREDIT: "credit"
});
