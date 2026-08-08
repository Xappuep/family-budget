"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createHabitsHarness() {
    const context = { console, Date, Math };
    vm.createContext(context);

    ["constants.js", "voice-parser.js", "voice-habits.js"].forEach((file) => {
        vm.runInContext(
            fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
            context
        );
    });

    vm.runInContext(
        "this.QUICK_ADD_CATEGORIES = QUICK_ADD_CATEGORIES;",
        context
    );

    return context;
}

function parse(api, text, overrides = {}) {
    return api.parseVoiceTransaction(text, {
        accounts: overrides.accounts || [
            { id: "main", name: "Основной счёт" },
            { id: "test-card", name: "Тестовая карта" }
        ],
        preferredAccountId: overrides.preferredAccountId || "main",
        today: overrides.today || "2026-08-08",
        categories: api.QUICK_ADD_CATEGORIES,
        habits: overrides.habits || [],
        ...overrides
    });
}

test("habits: normalize Лента/лента", () => {
    const api = createHabitsHarness();
    assert.equal(api.normalizeVoiceHabitPhrase("Лента"), "лента");
    assert.equal(api.normalizeVoiceHabitPhrase("ЛЕНТА"), "лента");
});

test("habits: ё/е Пятёрочка/Пятерочка", () => {
    const api = createHabitsHarness();
    assert.equal(
        api.normalizeVoiceHabitPhrase("Пятёрочка"),
        api.normalizeVoiceHabitPhrase("Пятерочка")
    );
});

test("habits: create habit", () => {
    const api = createHabitsHarness();
    let store = api.createEmptyVoiceHabitsStore();
    store = api.upsertVoiceHabitInStore(store, "Лента", "Продукты");
    assert.equal(store.mappings.length, 1);
    assert.equal(store.mappings[0].category, "Продукты");
    assert.equal(store.mappings[0].normalizedPhrase, "лента");
});

test("habits: update existing habit", () => {
    const api = createHabitsHarness();
    let store = api.createEmptyVoiceHabitsStore();
    store = api.upsertVoiceHabitInStore(store, "Лента", "Продукты");
    store = api.upsertVoiceHabitInStore(store, "лента", "Другое");
    assert.equal(store.mappings.length, 1);
    assert.equal(store.mappings[0].category, "Другое");
});

test("habits: no duplicate normalized phrase", () => {
    const api = createHabitsHarness();
    let store = api.createEmptyVoiceHabitsStore();
    store = api.upsertVoiceHabitInStore(store, "Лента", "Продукты");
    store = api.upsertVoiceHabitInStore(store, "ЛЕНТА", "Продукты");
    assert.equal(store.mappings.length, 1);
});

test("habits: delete", () => {
    const api = createHabitsHarness();
    let store = api.upsertVoiceHabitInStore(
        api.createEmptyVoiceHabitsStore(),
        "Лента",
        "Продукты"
    );
    const id = store.mappings[0].id;
    store = api.deleteVoiceHabitFromStore(store, id);
    assert.equal(store.mappings.length, 0);
});

test("habits: clear", () => {
    const api = createHabitsHarness();
    let store = api.upsertVoiceHabitInStore(
        api.createEmptyVoiceHabitsStore(),
        "Лента",
        "Продукты"
    );
    store = api.clearVoiceHabitsStore();
    assert.equal(store.mappings.length, 0);
});

test("habits: exact phrase match", () => {
    const api = createHabitsHarness();
    const store = api.upsertVoiceHabitInStore(
        api.createEmptyVoiceHabitsStore(),
        "Лента",
        "Продукты"
    );
    const hit = api.findVoiceHabitInMappings(
        store.mappings,
        "лента 1200 рублей"
    );
    assert.equal(hit.category, "Продукты");
});

test("habits: multiword Яндекс Go", () => {
    const api = createHabitsHarness();
    const store = api.upsertVoiceHabitInStore(
        api.createEmptyVoiceHabitsStore(),
        "Яндекс Go",
        "Транспорт"
    );
    const hit = api.findVoiceHabitInMappings(
        store.mappings,
        "сегодня яндекс go 700 рублей"
    );
    assert.equal(hit.category, "Транспорт");
});

test("habits: longest match wins", () => {
    const api = createHabitsHarness();
    let store = api.createEmptyVoiceHabitsStore();
    store = api.upsertVoiceHabitInStore(store, "Яндекс", "Другое");
    store = api.upsertVoiceHabitInStore(store, "Яндекс Go", "Транспорт");
    const hit = api.findVoiceHabitInMappings(
        store.mappings,
        "яндекс go 800 рублей"
    );
    assert.equal(hit.category, "Транспорт");
});

test("habits: explicit category > habit", () => {
    const api = createHabitsHarness();
    const habits = api.upsertVoiceHabitInStore(
        api.createEmptyVoiceHabitsStore(),
        "Лента",
        "Продукты"
    ).mappings;
    const result = parse(api, "Лента транспорт 700 рублей", { habits });
    assert.equal(result.category, "Транспорт");
    assert.equal(result.categorySource, "explicit");
});

test("habits: unknown vendor remains unknown before learning", () => {
    const api = createHabitsHarness();
    const result = parse(api, "Лента 1200 рублей");
    assert.equal(result.category, "");
    assert.equal(result.categorySource, "none");
    assert.equal(result.habitCandidate, "лента");
});

test("habits: learned Лента → Продукты", () => {
    const api = createHabitsHarness();
    const habits = api.upsertVoiceHabitInStore(
        api.createEmptyVoiceHabitsStore(),
        "Лента",
        "Продукты"
    ).mappings;
    const result = parse(api, "Лента 850 рублей", { habits });
    assert.equal(result.category, "Продукты");
    assert.equal(result.categorySource, "habit");
    assert.equal(result.type, "expense");
    assert.ok(
        !result.warnings.some((warning) =>
            warning.includes("Категория не распознана")
        )
    );
});

test("habits: learned category participates in expense type inference", () => {
    const api = createHabitsHarness();
    const habits = api.upsertVoiceHabitInStore(
        api.createEmptyVoiceHabitsStore(),
        "Лукойл",
        "Транспорт"
    ).mappings;
    const result = parse(api, "Вчера Лукойл 2500 рублей с основного счёта", {
        habits
    });
    assert.equal(result.category, "Транспорт");
    assert.equal(result.type, "expense");
    assert.equal(result.recognized.type, true);
    assert.equal(result.date, "2026-08-07");
});

test("habits: pending logic does not write habit until upsert", () => {
    const api = createHabitsHarness();
    let store = api.createEmptyVoiceHabitsStore();
    assert.equal(store.mappings.length, 0);
    // pending is UI-only; store remains empty until upsertVoiceHabitInStore
    store = api.upsertVoiceHabitInStore(store, "Пятёрочка", "Продукты");
    assert.equal(store.mappings.length, 1);
});

test("habits: update only via upsert of same phrase", () => {
    const api = createHabitsHarness();
    let store = api.upsertVoiceHabitInStore(
        api.createEmptyVoiceHabitsStore(),
        "Пятёрочка",
        "Продукты"
    );
    store = api.upsertVoiceHabitInStore(store, "Пятерочка", "Другое");
    assert.equal(store.mappings.length, 1);
    assert.equal(store.mappings[0].category, "Другое");
});

test("habits: generic words are not candidates", () => {
    const api = createHabitsHarness();
    assert.equal(api.isVoiceHabitGenericPhrase("сегодня"), true);
    assert.equal(api.isVoiceHabitGenericPhrase("рублей"), true);
    assert.equal(api.extractVoiceHabitCandidate("сегодня 100 рублей"), "");
    assert.equal(
        api.extractVoiceHabitCandidate("лента 1200 рублей", {
            removeTexts: ["1200 рублей"]
        }),
        "лента"
    );
});
