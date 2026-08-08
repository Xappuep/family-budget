"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createHarness() {
    const context = {
        console,
        Date,
        state: {
            accounts: [],
            transactions: [],
            transfers: [],
            goals: [],
            contributions: []
        }
    };
    vm.createContext(context);
    ["constants.js", "money.js", "dates.js", "calculations.js"].forEach((file) => {
        const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        vm.runInContext(source, context);
    });
    vm.runInContext(`this.formulas = {
        normalizeGoal,
        calculateDeposit,
        calculateCreditSchedule,
        getGoalCurrentAmount,
        getAccountBalance,
        getAvailableAccountBalanceForContribution,
        calculateSummary
    };`, context);
    return context;
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function deposit(api, overrides = {}) {
    const openedAt = overrides.openedAt || "2025-01-01";
    return api.normalizeGoal({
        id: "deposit-1",
        type: "deposit",
        initialAmount: 10_000_000,
        annualRate: 10,
        openedAt,
        balanceAsOf: overrides.balanceAsOf || openedAt,
        capitalization: "none",
        ...overrides
    });
}

function credit(api, overrides = {}) {
    return api.normalizeGoal({
        id: "credit-1",
        type: "credit",
        target: 100_000_000,
        initialAmount: 0,
        annualRate: 12,
        openedAt: "2025-01-01",
        deadline: "2026-01-01",
        ...overrides
    });
}

test("deposit: one full ordinary year yields the annual rate", () => {
    const { formulas } = createHarness();
    assert.deepEqual(
        plain(formulas.calculateDeposit(deposit(formulas), "2026-01-01")),
        { principal: 10_000_000, interest: 1_000_000, total: 11_000_000 }
    );
});

test("deposit: leap year uses 366 days", () => {
    const { formulas } = createHarness();
    const result = formulas.calculateDeposit(
        deposit(formulas, { openedAt: "2024-01-01" }),
        "2025-01-01"
    );
    assert.equal(result.interest, 1_000_000);
});

test("deposit: a contribution earns interest only from its effective date", () => {
    const harness = createHarness();
    harness.state.contributions.push({
        goalId: "deposit-1",
        amount: 10_000_000,
        date: "2025-07-02"
    });
    const result = harness.formulas.calculateDeposit(
        deposit(harness.formulas),
        "2026-01-01"
    );
    assert.equal(result.principal, 20_000_000);
    assert.equal(result.interest, 1_501_370);
    assert.equal(result.total, 21_501_370);
});

test("deposit: contributions already covered by the balance snapshot are not counted twice", () => {
    const harness = createHarness();
    harness.state.contributions.push({
        goalId: "deposit-1",
        amount: 10_000_000,
        date: "2024-12-01"
    });
    const result = harness.formulas.calculateDeposit(
        deposit(harness.formulas),
        "2026-01-01"
    );
    assert.equal(result.principal, 10_000_000);
    assert.equal(result.interest, 1_000_000);
});

test("deposit: monthly capitalization increases yield and rounds to kopecks", () => {
    const { formulas } = createHarness();
    const simple = formulas.calculateDeposit(deposit(formulas), "2026-01-01");
    const capitalized = formulas.calculateDeposit(
        deposit(formulas, { capitalization: "monthly" }),
        "2026-01-01"
    );
    assert.equal(simple.interest, 1_000_000);
    assert.equal(capitalized.interest, 1_047_127);
    assert.ok(capitalized.interest > simple.interest);
    assert.ok(Number.isSafeInteger(capitalized.total));
});

test("deposit: zero rate and a date before opening have safe results", () => {
    const { formulas } = createHarness();
    assert.deepEqual(
        plain(formulas.calculateDeposit(deposit(formulas, { annualRate: 0 }), "2026-01-01")),
        { principal: 10_000_000, interest: 0, total: 10_000_000 }
    );
    assert.deepEqual(
        plain(formulas.calculateDeposit(deposit(formulas), "2024-12-31")),
        { principal: 0, interest: 0, total: 0 }
    );
});

test("deposit: annual rate is not applied as a full monthly rate", () => {
    const { formulas } = createHarness();
    const result = formulas.calculateDeposit(
        deposit(formulas, { annualRate: 12, capitalization: "none" }),
        "2025-02-01"
    );
    assert.equal(result.interest, 101_918);
    assert.ok(result.interest < 120_000);
});

test("deposit: interest stops accruing when the deposit term ends", () => {
    const { formulas } = createHarness();
    const goal = deposit(formulas, {
        deadline: "2026-01-01",
        capitalization: "none"
    });
    assert.deepEqual(
        plain(formulas.calculateDeposit(goal, "2030-01-01")),
        { principal: 10_000_000, interest: 1_000_000, total: 11_000_000 }
    );
});

test("deposit: a current balance does not earn interest retroactively from opening", () => {
    const harness = createHarness();
    harness.state.contributions.push({
        goalId: "deposit-1",
        amount: 50_000_000,
        date: "2025-01-01"
    });
    const goal = deposit(harness.formulas, {
        initialAmount: 180_796_598,
        annualRate: 12.45,
        openedAt: "2023-11-03",
        balanceAsOf: "2026-07-19",
        deadline: "2026-11-03",
        capitalization: "monthly"
    });

    assert.deepEqual(
        plain(harness.formulas.calculateDeposit(goal, "2026-07-19")),
        { principal: 180_796_598, interest: 0, total: 180_796_598 }
    );
    assert.deepEqual(
        plain(harness.formulas.calculateDeposit(goal, "2026-11-03")),
        { principal: 180_796_598, interest: 6_688_024, total: 187_484_622 }
    );
});

test("credit: annuity schedule repays principal exactly", () => {
    const { formulas } = createHarness();
    const schedule = formulas.calculateCreditSchedule(credit(formulas), "2025-01-15");
    assert.equal(schedule.rows.length, 12);
    assert.equal(schedule.rows[0].date, "2025-02-01");
    assert.equal(schedule.rows.at(-1).date, "2026-01-01");
    assert.equal(schedule.rows[0].interest, 1_000_000);
    assert.equal(schedule.rows.reduce((sum, row) => sum + row.principal, 0), 100_000_000);
    assert.equal(schedule.rows.at(-1).balance, 0);
    assert.equal(schedule.totalPayment, schedule.initialBalance + schedule.totalInterest);
});

test("credit: payment dates preserve the issue day at month ends", () => {
    const { formulas } = createHarness();
    const schedule = formulas.calculateCreditSchedule(credit(formulas, {
        openedAt: "2025-01-31",
        deadline: "2025-05-31"
    }), "2025-02-01");
    assert.deepEqual(
        plain(schedule.rows.map((row) => row.date)),
        ["2025-02-28", "2025-03-31", "2025-04-30", "2025-05-31"]
    );
});

test("credit: zero-rate schedule has no interest", () => {
    const { formulas } = createHarness();
    const schedule = formulas.calculateCreditSchedule(
        credit(formulas, { annualRate: 0 }),
        "2025-01-15"
    );
    assert.equal(schedule.totalInterest, 0);
    assert.equal(schedule.rows.reduce((sum, row) => sum + row.payment, 0), 100_000_000);
    assert.equal(schedule.rows.at(-1).balance, 0);
});

test("credit: actual repayments reduce only the scheduled principal", () => {
    const harness = createHarness();
    harness.state.contributions.push({
        goalId: "credit-1",
        amount: 25_000_000,
        date: "2025-01-10"
    });
    const schedule = harness.formulas.calculateCreditSchedule(
        credit(harness.formulas, { initialAmount: 10_000_000 }),
        "2025-01-15"
    );
    assert.equal(schedule.initialBalance, 65_000_000);
    assert.equal(schedule.rows.reduce((sum, row) => sum + row.principal, 0), 65_000_000);
    assert.equal(schedule.rows.at(-1).balance, 0);
});

test("credit: overpayment is capped and produces no future rows", () => {
    const harness = createHarness();
    harness.state.contributions.push({
        goalId: "credit-1",
        amount: 150_000_000,
        date: "2025-01-10"
    });
    const schedule = harness.formulas.calculateCreditSchedule(credit(harness.formulas), "2025-01-15");
    assert.equal(schedule.initialBalance, 0);
    assert.equal(schedule.totalInterest, 0);
    assert.deepEqual(plain(schedule.rows), []);
});

test("credit: an expired deadline produces no forecast", () => {
    const { formulas } = createHarness();
    const schedule = formulas.calculateCreditSchedule(
        credit(formulas, { deadline: "2025-01-01" }),
        "2025-01-15"
    );
    assert.deepEqual(plain(schedule.rows), []);
    assert.equal(schedule.monthlyPayment, 0);
});

test("account balance combines operations, transfers and goal payments", () => {
    const harness = createHarness();
    harness.state.accounts = [{ id: "account-1", openingBalance: 100_000 }];
    harness.state.transactions = [
        { accountId: "account-1", type: "income", amount: 50_000 },
        { accountId: "account-1", type: "expense", amount: 20_000 }
    ];
    harness.state.transfers = [
        { fromAccountId: "account-1", toAccountId: "account-2", amount: 10_000 },
        { fromAccountId: "account-2", toAccountId: "account-1", amount: 5_000 }
    ];
    harness.state.contributions = [{ accountId: "account-1", amount: 15_000 }];
    assert.equal(harness.formulas.getAccountBalance("account-1"), 110_000);
});

test("summary period includes only transactions inside its boundaries", () => {
    const harness = createHarness();
    harness.state.transactions = [
        { date: "2025-01-01", type: "income", amount: 100_000 },
        { date: "2025-01-31", type: "expense", amount: 30_000 },
        { date: "2025-02-01", type: "income", amount: 999_000 }
    ];
    const summary = harness.formulas.calculateSummary({ from: "2025-01-01", to: "2025-01-31" });
    assert.equal(summary.income, 100_000);
    assert.equal(summary.expense, 30_000);
    assert.equal(summary.balance, 70_000);
    assert.equal(summary.incomeCount, 1);
    assert.equal(summary.expenseCount, 1);
});
test("goal payment is a real account movement and editing refunds the old movement", () => {
    const harness = createHarness();
    harness.state.accounts = [{ id: "account-1", openingBalance: 100_000 }];
    harness.state.contributions = [{
        id: "payment-1",
        goalId: "deposit-1",
        accountId: "account-1",
        amount: 40_000,
        date: "2025-01-01"
    }];

    assert.equal(harness.formulas.getAccountBalance("account-1"), 60_000);
    assert.equal(
        harness.formulas.getAvailableAccountBalanceForContribution("account-1", "payment-1"),
        100_000
    );

    harness.state.contributions[0].amount = 70_000;
    assert.equal(harness.formulas.getAccountBalance("account-1"), 30_000);
    harness.state.contributions.length = 0;
    assert.equal(harness.formulas.getAccountBalance("account-1"), 100_000);
});

test("core helpers convert money, dates and Russian formatting", () => {
    const context = { Date, Intl };
    vm.createContext(context);
    ["constants.js", "money.js", "dates.js", "formatting.js"].forEach((file) => {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
    });
    vm.runInContext(`this.core = {
        STORAGE_KEY, CURRENT_SCHEMA_VERSION, GOAL_TYPE,
        rublesToMinor, minorToRubles, getLocalDateString,
        parseUtcDate, addUtcMonths, formatMoney, formatPercent, formatDate
    };`, context);

    assert.equal(context.core.rublesToMinor("1807965.98"), 180_796_598);
    assert.equal(context.core.minorToRubles(180_796_598), 1_807_965.98);
    assert.equal(context.core.getLocalDateString(new Date(2026, 6, 19)), "2026-07-19");
    assert.equal(context.core.parseUtcDate("2026-07-19").toISOString(), "2026-07-19T00:00:00.000Z");
    assert.equal(context.core.formatPercent(12.45), "12,45");
    assert.equal(context.core.formatDate("2026-07-19"), "19.07.2026");
    assert.equal(context.core.CURRENT_SCHEMA_VERSION, 2);
});

test("state helpers create independent defaults and replace the active state", () => {
    const context = {};
    vm.createContext(context);
    ["constants.js", "state.js"].forEach((file) => {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
    });
    vm.runInContext(`
        const first = createInitialState();
        first.accounts[0].name = "Changed";
        const second = createInitialState();
        replaceState({ ...second, transactions: [{ id: "tx-1" }] });
        this.stateContract = {
            firstName: first.accounts[0].name,
            secondName: second.accounts[0].name,
            transactionCount: state.transactions.length,
            schemaVersion: state.schemaVersion
        };
    `, context);

    assert.equal(context.stateContract.firstName, "Changed");
    assert.equal(context.stateContract.secondName, "Основной счёт");
    assert.equal(context.stateContract.transactionCount, 1);
    assert.equal(context.stateContract.schemaVersion, 2);
});

test("storage migrates and validates a version 1 backup", () => {
    const context = {
        console,
        Date,
        localStorage: { getItem() { return null; }, setItem() {} },
        showToast() {},
        renderAll() {}
    };
    vm.createContext(context);
    ["constants.js", "state.js", "money.js", "dates.js", "calculations.js", "storage.js"].forEach((file) => {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
    });
    vm.runInContext(`
        const backup = migrateImportedBackupMoney({
            version: 1,
            data: {
                accounts: [{ id: "account-1", name: "Основной", openingBalance: 100 }],
                transfers: [],
                transactions: [{
                    id: "transaction-1", accountId: "account-1", date: "2026-07-19",
                    type: "income", amount: 12.34, category: "Доход", member: "", comment: ""
                }],
                goals: [], contributions: []
            }
        });
        const validated = validateAccountsAndTransfers(backup, validateImportedBackup(backup));
        this.storageContract = { version: backup.version, validated };
    `, context);

    assert.equal(context.storageContract.version, 2);
    assert.equal(context.storageContract.validated.accounts[0].openingBalance, 10_000);
    assert.equal(context.storageContract.validated.transactions[0].amount, 1_234);
    assert.equal(context.storageContract.validated.transactions[0].accountId, "account-1");
});

test("transactions sort by date then createdAt without mutating state", () => {
    const context = createHarness();
    vm.runInContext(`
        this.sortApi = {
            sortTransactionsNewestFirst,
            compareTransactionsNewestFirst
        };
    `, context);

    const source = [
        {
            id: "legacy",
            date: "2026-08-08",
            amount: 50,
            category: "Старая"
        },
        {
            id: "a",
            date: "2026-08-08",
            amount: 100,
            category: "Продукты",
            createdAt: "2026-08-08T10:00:00.000Z"
        },
        {
            id: "b",
            date: "2026-08-08",
            amount: 200,
            category: "Продукты",
            createdAt: "2026-08-08T10:01:00.000Z"
        },
        {
            id: "c",
            date: "2026-08-08",
            amount: 300,
            category: "Продукты",
            createdAt: "2026-08-08T10:02:00.000Z"
        },
        {
            id: "older-day",
            date: "2026-08-07",
            amount: 999,
            category: "Вчера",
            createdAt: "2026-08-08T12:00:00.000Z"
        }
    ];
    const snapshot = JSON.stringify(source);

    const sorted = context.sortApi.sortTransactionsNewestFirst(source);

    assert.deepEqual(
        sorted.map((item) => item.amount),
        [300, 200, 100, 50, 999]
    );
    assert.equal(JSON.stringify(source), snapshot);
    assert.notEqual(sorted, source);

    // date wins over a later createdAt on an older calendar day
    assert.equal(sorted[0].date, "2026-08-08");
    assert.equal(sorted[sorted.length - 1].amount, 999);
    assert.equal(sorted[3].id, "legacy");
});

test("last used account follows createdAt, not financial date", () => {
    const context = createHarness();
    vm.runInContext(`
        this.accountApi = { getLastUsedTransactionAccountId };
    `, context);

    const knownAccounts = new Set(["card-a", "card-b", "card-c"]);
    const accountExists = (accountId) => knownAccounts.has(accountId);

    // Более поздняя финансовая дата у card-a, но card-b создана позже.
    const byCreatedAt = context.accountApi.getLastUsedTransactionAccountId(
        [
            {
                id: "1",
                date: "2026-08-09",
                accountId: "card-a",
                createdAt: "2026-08-08T10:00:00.000Z"
            },
            {
                id: "2",
                date: "2026-08-07",
                accountId: "card-b",
                createdAt: "2026-08-08T12:00:00.000Z"
            }
        ],
        accountExists
    );
    assert.equal(byCreatedAt, "card-b");

    // Legacy без createdAt: последний валидный в массиве.
    const byArrayOrder = context.accountApi.getLastUsedTransactionAccountId(
        [
            { id: "legacy-1", date: "2026-08-08", accountId: "card-a" },
            { id: "legacy-2", date: "2026-08-08", accountId: "card-c" }
        ],
        accountExists
    );
    assert.equal(byArrayOrder, "card-c");

    // Удалённый счёт пропускается.
    const skipsMissing = context.accountApi.getLastUsedTransactionAccountId(
        [
            {
                id: "gone",
                date: "2026-08-08",
                accountId: "deleted",
                createdAt: "2026-08-08T13:00:00.000Z"
            },
            {
                id: "ok",
                date: "2026-08-08",
                accountId: "card-a",
                createdAt: "2026-08-08T11:00:00.000Z"
            }
        ],
        accountExists
    );
    assert.equal(skipsMissing, "card-a");
});

test("groupTransactionsByDate keeps sorted order within day groups", () => {
    const context = createHarness();
    vm.runInContext(`
        this.groupApi = { groupTransactionsByDate };
    `, context);

    const source = [
        { id: "t1", date: "2026-08-08", amount: 300 },
        { id: "t2", date: "2026-08-08", amount: 200 },
        { id: "t3", date: "2026-08-07", amount: 100 }
    ];
    const snapshot = JSON.stringify(source);
    const groups = context.groupApi.groupTransactionsByDate(source);

    assert.equal(groups.length, 2);
    assert.equal(groups[0].date, "2026-08-08");
    assert.equal(groups[0].transactions.length, 2);
    assert.equal(groups[0].transactions[0].amount, 300);
    assert.equal(groups[0].transactions[1].amount, 200);
    assert.equal(groups[1].date, "2026-08-07");
    assert.equal(groups[1].transactions[0].amount, 100);
    assert.equal(JSON.stringify(source), snapshot);
});

test("contributions sort by date then createdAt without mutating state", () => {
    const context = createHarness();
    vm.runInContext(`
        this.sortApi = {
            sortContributionsNewestFirst,
            compareRecordsNewestFirst
        };
    `, context);

    const source = [
        {
            id: "legacy",
            date: "2026-08-08",
            amount: 50,
            goalId: "g1"
        },
        {
            id: "a",
            date: "2026-08-08",
            amount: 100,
            goalId: "g1",
            createdAt: "2026-08-08T10:00:00.000Z"
        },
        {
            id: "b",
            date: "2026-08-08",
            amount: 200,
            goalId: "g1",
            createdAt: "2026-08-08T10:01:00.000Z"
        },
        {
            id: "c",
            date: "2026-08-08",
            amount: 300,
            goalId: "g1",
            createdAt: "2026-08-08T10:02:00.000Z"
        },
        {
            id: "older-day",
            date: "2026-08-07",
            amount: 999,
            goalId: "g1",
            createdAt: "2026-08-08T12:00:00.000Z"
        }
    ];
    const snapshot = JSON.stringify(source);

    const sorted = context.sortApi.sortContributionsNewestFirst(source);

    assert.deepEqual(
        sorted.map((item) => item.amount),
        [300, 200, 100, 50, 999]
    );
    assert.equal(JSON.stringify(source), snapshot);
    assert.notEqual(sorted, source);
    assert.equal(sorted[3].id, "legacy");
});

test("transfers sort by date then createdAt without mutating state", () => {
    const context = createHarness();
    vm.runInContext(`
        this.sortApi = {
            sortTransfersNewestFirst,
            sortRecordsNewestFirst
        };
    `, context);

    const source = [
        {
            id: "legacy",
            date: "2026-08-08",
            amount: 50,
            fromAccountId: "a1",
            toAccountId: "a2"
        },
        {
            id: "a",
            date: "2026-08-08",
            amount: 100,
            fromAccountId: "a1",
            toAccountId: "a2",
            createdAt: "2026-08-08T10:00:00.000Z"
        },
        {
            id: "b",
            date: "2026-08-08",
            amount: 200,
            fromAccountId: "a1",
            toAccountId: "a2",
            createdAt: "2026-08-08T10:01:00.000Z"
        },
        {
            id: "c",
            date: "2026-08-08",
            amount: 300,
            fromAccountId: "a1",
            toAccountId: "a2",
            createdAt: "2026-08-08T10:02:00.000Z"
        },
        {
            id: "older-day",
            date: "2026-08-07",
            amount: 999,
            fromAccountId: "a1",
            toAccountId: "a2",
            createdAt: "2026-08-08T12:00:00.000Z"
        }
    ];
    const snapshot = JSON.stringify(source);

    const sorted = context.sortApi.sortTransfersNewestFirst(source);

    assert.deepEqual(
        sorted.map((item) => item.amount),
        [300, 200, 100, 50, 999]
    );
    assert.equal(JSON.stringify(source), snapshot);
    assert.notEqual(sorted, source);
    assert.deepEqual(
        context.sortApi.sortRecordsNewestFirst(source).map((item) => item.id),
        sorted.map((item) => item.id)
    );
});
