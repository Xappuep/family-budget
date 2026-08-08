"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createVoiceParserHarness() {
    const context = {
        console
    };
    vm.createContext(context);

    ["constants.js", "voice-parser.js"].forEach((file) => {
        const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        vm.runInContext(source, context);
    });

    return context;
}

function parse(text, overrides = {}) {
    const api = createVoiceParserHarness();
    const accounts = overrides.accounts || [
        { id: "main", name: "Основной счёт" },
        { id: "test-card", name: "Тестовая карта" }
    ];

    return api.parseVoiceTransaction(text, {
        accounts,
        preferredAccountId: overrides.preferredAccountId || "main",
        today: overrides.today || "2026-08-08",
        categories: api.QUICK_ADD_CATEGORIES,
        ...overrides
    });
}

test("voice: Продукты 2450", () => {
    const result = parse("Продукты 2450 рублей с основного счёта");
    assert.equal(result.type, "expense");
    assert.equal(result.amount, 2450);
    assert.equal(result.category, "Продукты");
    assert.equal(result.accountId, "main");
    assert.equal(result.date, "2026-08-08");
    assert.equal(result.recognized.amount, true);
    assert.equal(result.recognized.category, true);
});

test("voice: 2 450 рублей with spaced thousands", () => {
    const result = parse("Продукты 2 450 рублей");
    assert.equal(result.amount, 2450);
});

test("voice: две тысячи четыреста пятьдесят", () => {
    const result = parse(
        "Продукты две тысячи четыреста пятьдесят рублей с основного счёта"
    );
    assert.equal(result.amount, 2450);
});

test("voice: expense keyword", () => {
    const result = parse("Потратил 850 рублей на транспорт с тестовой карты");
    assert.equal(result.type, "expense");
    assert.equal(result.recognized.type, true);
    assert.equal(result.amount, 850);
    assert.equal(result.category, "Транспорт");
    assert.equal(result.accountId, "test-card");
});

test("voice: income keyword", () => {
    const result = parse("Доход 12000 рублей подработка");
    assert.equal(result.type, "income");
    assert.equal(result.recognized.type, true);
    assert.equal(result.amount, 12000);
    assert.equal(result.category, "Подработка");
});

test("voice: Зарплата implies income", () => {
    const result = parse("Зарплата 50000 рублей на основной счёт");
    assert.equal(result.type, "income");
    assert.equal(result.category, "Зарплата");
    assert.equal(result.amount, 50000);
    assert.equal(result.accountId, "main");
});

test("voice: yesterday", () => {
    const result = parse("Вчера продукты 1300 рублей с основного счёта");
    assert.equal(result.date, "2026-08-07");
    assert.equal(result.recognized.date, true);
    assert.equal(result.amount, 1300);
    assert.equal(result.category, "Продукты");
});

test("voice: позавчера", () => {
    const result = parse("Позавчера транспорт 700 рублей");
    assert.equal(result.date, "2026-08-06");
    assert.equal(result.recognized.date, true);
});

test("voice: account Основной счёт", () => {
    const result = parse("Продукты 100 рублей с основного счёта");
    assert.equal(result.accountId, "main");
    assert.equal(result.recognized.account, true);
});

test("voice: account Тестовая карта in case form", () => {
    const result = parse("Транспорт 200 рублей с тестовой карты");
    assert.equal(result.accountId, "test-card");
    assert.equal(result.recognized.account, true);
});

test("voice: preferred-account fallback", () => {
    const result = parse("Продукты 300 рублей", {
        preferredAccountId: "test-card"
    });
    assert.equal(result.accountId, "test-card");
    assert.equal(result.recognized.account, false);
    assert.ok(
        result.warnings.some((warning) =>
            warning.includes("Счёт не распознан")
        )
    );
});

test("voice: ambiguous account", () => {
    const result = parse("Продукты 400 рублей с основного", {
        accounts: [
            { id: "a", name: "Основной счёт" },
            { id: "b", name: "Основной резерв" }
        ],
        preferredAccountId: "a"
    });
    assert.equal(result.accountId, "a");
    assert.equal(result.recognized.account, false);
    assert.ok(
        result.warnings.some((warning) =>
            warning.includes("однозначно определить счёт")
        )
    );
});

test("voice: unknown category stays empty", () => {
    const result = parse("Лента 1200 рублей с основного счёта");
    assert.equal(result.amount, 1200);
    assert.equal(result.category, "");
    assert.equal(result.recognized.category, false);
    assert.ok(
        result.warnings.some((warning) => warning.includes("Категория не распознана"))
    );
});

test("voice: missing amount", () => {
    const result = parse("Продукты с основного счёта");
    assert.equal(result.amount, null);
    assert.equal(result.category, "Продукты");
    assert.equal(result.accountId, "main");
    assert.ok(
        result.warnings.some((warning) =>
            warning.includes("Не удалось определить сумму")
        )
    );
});

test("voice: explicit comment", () => {
    const result = parse(
        "Транспорт семьсот рублей комментарий такси домой"
    );
    assert.equal(result.amount, 700);
    assert.equal(result.category, "Транспорт");
    assert.equal(result.comment, "такси домой");
    assert.equal(result.recognized.comment, true);
});

test("voice: vendor name is not learned into category", () => {
    const result = parse("Пятёрочка 900 рублей с основного счёта");
    assert.equal(result.amount, 900);
    assert.equal(result.category, "");
    assert.notEqual(result.category, "Продукты");
});
