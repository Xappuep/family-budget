"use strict";

/**
 * Локальный словарь голосовых привычек (Этап 6.1).
 * Отдельное хранилище — не часть финансового state / schemaVersion.
 */

const VOICE_HABIT_GENERIC_WORDS = Object.freeze([
    "расход",
    "доход",
    "купил",
    "купила",
    "потратил",
    "потратила",
    "потратили",
    "заплатил",
    "заплатила",
    "оплатил",
    "оплатила",
    "получил",
    "получила",
    "получили",
    "поступило",
    "пришло",
    "сегодня",
    "вчера",
    "позавчера",
    "рублей",
    "рубля",
    "руб",
    "р",
    "счет",
    "счёт",
    "счета",
    "счёта",
    "карта",
    "карты",
    "карту",
    "карточка",
    "кошелек",
    "кошелёк",
    "основной",
    "основного",
    "основную",
    "комментарий",
    "примечание",
    "с",
    "со",
    "на",
    "от",
    "из",
    "и",
    "в",
    "по"
]);

function normalizeVoiceHabitPhrase(phrase) {
    if (typeof normalizeVoiceText === "function") {
        return normalizeVoiceText(phrase);
    }

    return String(phrase || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/\u00a0/g, " ")
        .replace(/[«»"']/g, "")
        .replace(/[.,!?;:()[\]{}]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function createEmptyVoiceHabitsStore() {
    return {
        version: 1,
        mappings: []
    };
}

function createVoiceHabitId() {
    if (typeof createId === "function") {
        return createId();
    }

    return `habit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeVoiceHabitsStore(raw) {
    const store = createEmptyVoiceHabitsStore();

    if (!raw || typeof raw !== "object") {
        return store;
    }

    const mappings = Array.isArray(raw.mappings) ? raw.mappings : [];

    store.mappings = mappings
        .map((item) => {
            if (!item || typeof item !== "object") {
                return null;
            }

            const phrase = String(item.phrase || "").trim();
            const category = String(item.category || "").trim();
            const normalizedPhrase =
                String(item.normalizedPhrase || "").trim() ||
                normalizeVoiceHabitPhrase(phrase);

            if (!phrase || !category || !normalizedPhrase) {
                return null;
            }

            return {
                id: String(item.id || createVoiceHabitId()),
                phrase,
                normalizedPhrase,
                category,
                createdAt: String(item.createdAt || new Date().toISOString()),
                updatedAt: String(item.updatedAt || item.createdAt || new Date().toISOString())
            };
        })
        .filter(Boolean);

    return store;
}

function parseVoiceHabitsJson(rawText) {
    if (!rawText) {
        return createEmptyVoiceHabitsStore();
    }

    try {
        return normalizeVoiceHabitsStore(JSON.parse(rawText));
    } catch (_error) {
        return createEmptyVoiceHabitsStore();
    }
}

function serializeVoiceHabitsStore(store) {
    return JSON.stringify(normalizeVoiceHabitsStore(store), null, 2);
}

/**
 * Phrase match с границами слов/фраз (не substring внутри слова).
 */
function voiceHabitPhraseMatchesText(normalizedPhrase, normalizedText) {
    const phrase = normalizeVoiceHabitPhrase(normalizedPhrase);
    const text = normalizeVoiceHabitPhrase(normalizedText);

    if (!phrase || !text) {
        return false;
    }

    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "u");
    return pattern.test(text);
}

/**
 * Longest match wins.
 */
function findVoiceHabitInMappings(mappings, text) {
    const list = Array.isArray(mappings) ? mappings : [];
    const normalizedText = normalizeVoiceHabitPhrase(text);

    if (!normalizedText || list.length === 0) {
        return null;
    }

    const matches = list
        .filter((habit) =>
            voiceHabitPhraseMatchesText(
                habit.normalizedPhrase || habit.phrase,
                normalizedText
            )
        )
        .sort(
            (first, second) =>
                String(second.normalizedPhrase || "").length -
                String(first.normalizedPhrase || "").length
        );

    return matches[0] || null;
}

function upsertVoiceHabitInStore(store, phrase, category) {
    const next = normalizeVoiceHabitsStore(store);
    const cleanPhrase = String(phrase || "").trim();
    const cleanCategory = String(category || "").trim();
    const normalizedPhrase = normalizeVoiceHabitPhrase(cleanPhrase);

    if (!cleanPhrase || !cleanCategory || !normalizedPhrase) {
        return next;
    }

    if (isVoiceHabitGenericPhrase(normalizedPhrase)) {
        return next;
    }

    const now = new Date().toISOString();
    const existingIndex = next.mappings.findIndex(
        (habit) => habit.normalizedPhrase === normalizedPhrase
    );

    if (existingIndex === -1) {
        next.mappings.push({
            id: createVoiceHabitId(),
            phrase: cleanPhrase,
            normalizedPhrase,
            category: cleanCategory,
            createdAt: now,
            updatedAt: now
        });
        return next;
    }

    next.mappings[existingIndex] = {
        ...next.mappings[existingIndex],
        phrase: cleanPhrase,
        normalizedPhrase,
        category: cleanCategory,
        updatedAt: now
    };

    return next;
}

function deleteVoiceHabitFromStore(store, habitId) {
    const next = normalizeVoiceHabitsStore(store);
    next.mappings = next.mappings.filter((habit) => habit.id !== habitId);
    return next;
}

function clearVoiceHabitsStore() {
    return createEmptyVoiceHabitsStore();
}

function isVoiceHabitGenericToken(token) {
    const value = normalizeVoiceHabitPhrase(token);
    return !value || VOICE_HABIT_GENERIC_WORDS.includes(value);
}

function isVoiceHabitGenericPhrase(phrase) {
    const tokens = normalizeVoiceHabitPhrase(phrase)
        .split(" ")
        .filter(Boolean);

    if (tokens.length === 0) {
        return true;
    }

    return tokens.every((token) => isVoiceHabitGenericToken(token));
}

/**
 * Убирает уже распознанные сущности и служебные слова,
 * возвращает короткий candidate 1–3 слова.
 */
function extractVoiceHabitCandidate(normalizedText, options = {}) {
    let working = normalizeVoiceHabitPhrase(normalizedText);

    if (!working) {
        return "";
    }

    const removals = []
        .concat(options.removeTexts || [])
        .concat(options.matchedTexts || [])
        .map((item) => normalizeVoiceHabitPhrase(item))
        .filter(Boolean)
        .sort((first, second) => second.length - first.length);

    removals.forEach((chunk) => {
        const escaped = chunk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        working = working
            .replace(new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "gu"), " ")
            .replace(/\s+/g, " ")
            .trim();
    });

    working = working
        .replace(
            /(?:^|\s)(?:комментарий|примечание)\s+.+$/u,
            " "
        )
        .replace(/\d+(?:[.,]\d+)?/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const tokens = working
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token && !isVoiceHabitGenericToken(token));

    if (tokens.length === 0 || tokens.length > 3) {
        return "";
    }

    const phrase = tokens.join(" ");

    if (isVoiceHabitGenericPhrase(phrase)) {
        return "";
    }

    return phrase;
}

function loadVoiceHabits() {
    if (typeof localStorage === "undefined") {
        return createEmptyVoiceHabitsStore();
    }

    try {
        const key =
            typeof VOICE_HABITS_STORAGE_KEY === "string"
                ? VOICE_HABITS_STORAGE_KEY
                : "familyBudgetVoiceHabits_v1";
        return parseVoiceHabitsJson(localStorage.getItem(key));
    } catch (_error) {
        return createEmptyVoiceHabitsStore();
    }
}

function saveVoiceHabits(store) {
    if (typeof localStorage === "undefined") {
        return normalizeVoiceHabitsStore(store);
    }

    const normalized = normalizeVoiceHabitsStore(store);
    const key =
        typeof VOICE_HABITS_STORAGE_KEY === "string"
            ? VOICE_HABITS_STORAGE_KEY
            : "familyBudgetVoiceHabits_v1";

    localStorage.setItem(key, JSON.stringify(normalized));
    return normalized;
}

function getVoiceHabitMappings() {
    return loadVoiceHabits().mappings;
}

function findVoiceHabit(text) {
    return findVoiceHabitInMappings(getVoiceHabitMappings(), text);
}

function upsertVoiceHabit(phrase, category) {
    const next = upsertVoiceHabitInStore(loadVoiceHabits(), phrase, category);
    return saveVoiceHabits(next);
}

function deleteVoiceHabit(habitId) {
    const next = deleteVoiceHabitFromStore(loadVoiceHabits(), habitId);
    return saveVoiceHabits(next);
}

function clearVoiceHabits() {
    return saveVoiceHabits(clearVoiceHabitsStore());
}

function exportVoiceHabitsForBackup() {
    return normalizeVoiceHabitsStore(loadVoiceHabits());
}

function importVoiceHabitsFromBackup(rawHabits) {
    if (rawHabits === undefined || rawHabits === null) {
        return null;
    }

    return saveVoiceHabits(normalizeVoiceHabitsStore(rawHabits));
}
