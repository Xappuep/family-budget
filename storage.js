"use strict";

        function migrateStateMoneyToMinor(rawState) {
            const copy = JSON.parse(JSON.stringify(rawState));
            if (copy.schemaVersion === CURRENT_SCHEMA_VERSION) return copy;

            const convert = (value) => Math.round((Number(value) || 0) * 100);
            (copy.accounts || []).forEach((account) => { account.openingBalance = convert(account.openingBalance); });
            (copy.transfers || []).forEach((transfer) => { transfer.amount = convert(transfer.amount); });
            (copy.transactions || []).forEach((transaction) => { transaction.amount = convert(transaction.amount); });
            (copy.goals || []).forEach((goal) => {
                goal.target = convert(goal.target);
                goal.initialAmount = convert(goal.initialAmount);
            });
            (copy.contributions || []).forEach((contribution) => { contribution.amount = convert(contribution.amount); });
            copy.schemaVersion = CURRENT_SCHEMA_VERSION;
            return copy;
        }

        function migrateImportedBackupMoney(parsed) {
            if (!isRecord(parsed)) return parsed;
            const wrapper = JSON.parse(JSON.stringify(parsed));
            const data = wrapper.data !== undefined ? wrapper.data : wrapper;
            const version = wrapper.version ?? data.schemaVersion ?? 1;
            if (version === CURRENT_SCHEMA_VERSION) return wrapper;
            const migratedData = migrateStateMoneyToMinor(data);
            if (wrapper.data !== undefined) wrapper.data = migratedData;
            wrapper.version = CURRENT_SCHEMA_VERSION;
            return wrapper;
        }
        class ImportValidationError extends Error {
            constructor(message) {
                super(message);
                this.name = "ImportValidationError";
            }
        }

        function importError(message) {
            throw new ImportValidationError(message);
        }

        function isRecord(value) {
            return value !== null && typeof value === "object" && !Array.isArray(value);
        }

        function isValidImportId(value) {
            return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
        }

        function isValidImportText(value, maxLength, required = false) {
            return (
                typeof value === "string" &&
                value.length <= maxLength &&
                (!required || value.trim().length > 0)
            );
        }

        function isValidImportDate(value, allowEmpty = false) {
            if (allowEmpty && value === "") {
                return true;
            }

            if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                return false;
            }

            const [year, month, day] = value.split("-").map(Number);
            const date = new Date(Date.UTC(year, month - 1, day));

            return (
                date.getUTCFullYear() === year &&
                date.getUTCMonth() === month - 1 &&
                date.getUTCDate() === day
            );
        }

        function isValidCreatedAt(value) {
            return (
                value === undefined ||
                (typeof value === "string" && !Number.isNaN(Date.parse(value)))
            );
        }

        function validateUniqueIds(items, sectionName, allIds) {
            const localIds = new Set();

            items.forEach((item, index) => {
                if (!isValidImportId(item.id)) {
                    importError(`${sectionName}: invalid ID in record ${index + 1}.`);
                }

                if (localIds.has(item.id) || allIds.has(item.id)) {
                    importError(`${sectionName}: duplicate ID ${item.id}.`);
                }

                localIds.add(item.id);
                allIds.add(item.id);
            });
        }

        function validateImportedBackup(parsed) {
            if (!isRecord(parsed)) {
                importError("The backup root must be an object.");
            }

            if (parsed.version !== undefined && ![1, CURRENT_SCHEMA_VERSION].includes(parsed.version)) {
                importError("This backup version is not supported.");
            }

            const data = parsed.data !== undefined ? parsed.data : parsed;

            if (!isRecord(data)) {
                importError("The backup data section must be an object.");
            }

            if (
                !Array.isArray(data.transactions) ||
                !Array.isArray(data.goals) ||
                !Array.isArray(data.contributions)
            ) {
                importError("The backup must contain transactions, goals and contributions arrays.");
            }

            const allIds = new Set();
            validateUniqueIds(data.transactions, "Transactions", allIds);
            validateUniqueIds(data.goals, "Goals", allIds);
            validateUniqueIds(data.contributions, "Contributions", allIds);

            const transactions = data.transactions.map((transaction, index) => {
                if (!isRecord(transaction)) {
                    importError(`Transactions: record ${index + 1} must be an object.`);
                }
                if (!isValidImportDate(transaction.date)) {
                    importError(`Transactions: invalid date in record ${index + 1}.`);
                }
                if (!['income', 'expense'].includes(transaction.type)) {
                    importError(`Transactions: invalid type in record ${index + 1}.`);
                }
                if (!Number.isSafeInteger(transaction.amount) || transaction.amount <= 0) {
                    importError(`Transactions: invalid amount in record ${index + 1}.`);
                }
                if (!isValidImportText(transaction.category, 200, true)) {
                    importError(`Transactions: invalid category in record ${index + 1}.`);
                }
                if (!isValidImportText(transaction.member, 200)) {
                    importError(`Transactions: invalid family member in record ${index + 1}.`);
                }
                if (!isValidImportText(transaction.comment, 2000)) {
                    importError(`Transactions: invalid comment in record ${index + 1}.`);
                }
                if (!isValidCreatedAt(transaction.createdAt)) {
                    importError(`Transactions: invalid creation date in record ${index + 1}.`);
                }

                return {
                    id: transaction.id,
                    date: transaction.date,
                    type: transaction.type,
                    amount: transaction.amount,
                    category: transaction.category.trim(),
                    member: transaction.member.trim(),
                    comment: transaction.comment.trim(),
                    ...(transaction.createdAt ? { createdAt: transaction.createdAt } : {})
                };
            });

            const goals = data.goals.map((goal, index) => {
                if (!isRecord(goal)) {
                    importError(`Goals: record ${index + 1} must be an object.`);
                }
                if (![GOAL_TYPE.DEPOSIT, GOAL_TYPE.CREDIT].includes(goal.type)) {
                    importError(`Goals: invalid type in record ${index + 1}.`);
                }
                if (!isValidImportText(goal.name, 200, true)) {
                    importError(`Goals: invalid name in record ${index + 1}.`);
                }
                if (!Number.isSafeInteger(goal.target) || goal.target <= 0) {
                    importError(`Goals: invalid target amount in record ${index + 1}.`);
                }
                if (!Number.isSafeInteger(goal.initialAmount) || goal.initialAmount < 0) {
                    importError(`Goals: invalid initial amount in record ${index + 1}.`);
                }
                if (
                    !Number.isFinite(goal.annualRate) ||
                    goal.annualRate < 0 ||
                    goal.annualRate > 100
                ) {
                    importError(`Goals: invalid annual rate in record ${index + 1}.`);
                }
                if (goal.openedAt !== undefined && goal.openedAt !== "" && !isValidImportDate(goal.openedAt, false)) {
                    importError(`Goals: invalid opening date in record ${index + 1}.`);
                }
                if (goal.balanceAsOf !== undefined && goal.balanceAsOf !== "" && !isValidImportDate(goal.balanceAsOf, false)) {
                    importError(`Goals: invalid balance date in record ${index + 1}.`);
                }
                if (goal.capitalization !== undefined && !["monthly", "none"].includes(goal.capitalization)) {
                    importError(`Goals: invalid capitalization in record ${index + 1}.`);
                }
                if (!isValidImportDate(goal.deadline, true)) {
                    importError(`Goals: invalid deadline in record ${index + 1}.`);
                }
                if (!isValidImportText(goal.comment, 2000)) {
                    importError(`Goals: invalid comment in record ${index + 1}.`);
                }
                if (!isValidCreatedAt(goal.createdAt)) {
                    importError(`Goals: invalid creation date in record ${index + 1}.`);
                }

                return normalizeGoal({
                    id: goal.id,
                    type: goal.type,
                    name: goal.name.trim(),
                    target: goal.target,
                    initialAmount: goal.initialAmount,
                    annualRate: goal.annualRate,
                    openedAt: goal.openedAt,
                    balanceAsOf: goal.balanceAsOf,
                    capitalization: goal.capitalization,
                    deadline: goal.deadline,
                    comment: goal.comment.trim(),
                    ...(goal.createdAt ? { createdAt: goal.createdAt } : {})
                });
            });

            const goalIds = new Set(goals.map((goal) => goal.id));
            const contributions = data.contributions.map((contribution, index) => {
                if (!isRecord(contribution)) {
                    importError(`Contributions: record ${index + 1} must be an object.`);
                }
                if (!isValidImportId(contribution.goalId) || !goalIds.has(contribution.goalId)) {
                    importError(`Contributions: missing goal in record ${index + 1}.`);
                }
                if (!isValidImportDate(contribution.date)) {
                    importError(`Contributions: invalid date in record ${index + 1}.`);
                }
                if (!Number.isSafeInteger(contribution.amount) || contribution.amount <= 0) {
                    importError(`Contributions: invalid amount in record ${index + 1}.`);
                }
                if (!isValidImportText(contribution.source, 200)) {
                    importError(`Contributions: invalid source in record ${index + 1}.`);
                }
                if (!isValidImportText(contribution.comment, 2000)) {
                    importError(`Contributions: invalid comment in record ${index + 1}.`);
                }
                if (!isValidCreatedAt(contribution.createdAt)) {
                    importError(`Contributions: invalid creation date in record ${index + 1}.`);
                }

                return {
                    id: contribution.id,
                    goalId: contribution.goalId,
                    date: contribution.date,
                    amount: contribution.amount,
                    source: contribution.source.trim(),
                    comment: contribution.comment.trim(),
                    ...(contribution.createdAt ? { createdAt: contribution.createdAt } : {})
                };
            });

            return { transactions, goals, contributions };
        }

        function validateAccountsAndTransfers(parsed, validatedState) {
            const rawData = parsed.data !== undefined ? parsed.data : parsed;
            const rawAccounts = rawData.accounts;
            const accounts = rawAccounts === undefined
                ? [{ id: DEFAULT_ACCOUNT_ID, name: "Основной счет", openingBalance: 0 }]
                : rawAccounts;

            if (!Array.isArray(accounts) || accounts.length === 0) {
                importError("Accounts: at least one account is required.");
            }

            const allIds = new Set([
                ...validatedState.transactions.map((item) => item.id),
                ...validatedState.goals.map((item) => item.id),
                ...validatedState.contributions.map((item) => item.id)
            ]);
            validateUniqueIds(accounts, "Accounts", allIds);

            const cleanAccounts = accounts.map((account, index) => {
                if (!isRecord(account) || !isValidImportText(account.name, 80, true)) {
                    importError(`Accounts: invalid name in record ${index + 1}.`);
                }
                if (!Number.isSafeInteger(account.openingBalance)) {
                    importError(`Accounts: invalid opening balance in record ${index + 1}.`);
                }
                if (!isValidCreatedAt(account.createdAt)) {
                    importError(`Accounts: invalid creation date in record ${index + 1}.`);
                }
                return {
                    id: account.id,
                    name: account.name.trim(),
                    openingBalance: account.openingBalance,
                    ...(account.createdAt ? { createdAt: account.createdAt } : {})
                };
            });

            const accountIds = new Set(cleanAccounts.map((account) => account.id));
            const fallbackAccountId = cleanAccounts[0].id;
            const transactions = validatedState.transactions.map((transaction, index) => {
                const rawAccountId = rawData.transactions[index].accountId;
                const accountId = rawAccountId || fallbackAccountId;
                if (!accountIds.has(accountId)) {
                    importError(`Transactions: missing account in record ${index + 1}.`);
                }
                return { ...transaction, accountId };
            });

            const contributions = validatedState.contributions.map((contribution, index) => {
                const rawAccountId = rawData.contributions[index].accountId;
                const accountId = rawAccountId || fallbackAccountId;
                if (!accountIds.has(accountId)) {
                    importError(`Contributions: missing account in record ${index + 1}.`);
                }
                return { ...contribution, accountId };
            });
            const rawTransfers = rawData.transfers === undefined ? [] : rawData.transfers;
            if (!Array.isArray(rawTransfers)) {
                importError("Transfers must be an array.");
            }
            validateUniqueIds(rawTransfers, "Transfers", allIds);
            const transfers = rawTransfers.map((transfer, index) => {
                if (!isRecord(transfer)) importError(`Transfers: record ${index + 1} must be an object.`);
                if (!accountIds.has(transfer.fromAccountId) || !accountIds.has(transfer.toAccountId) || transfer.fromAccountId === transfer.toAccountId) {
                    importError(`Transfers: invalid accounts in record ${index + 1}.`);
                }
                if (!isValidImportDate(transfer.date)) importError(`Transfers: invalid date in record ${index + 1}.`);
                if (!Number.isSafeInteger(transfer.amount) || transfer.amount <= 0) importError(`Transfers: invalid amount in record ${index + 1}.`);
                if (!isValidImportText(transfer.comment, 300)) importError(`Transfers: invalid comment in record ${index + 1}.`);
                if (!isValidCreatedAt(transfer.createdAt)) importError(`Transfers: invalid creation date in record ${index + 1}.`);
                return { id: transfer.id, date: transfer.date, fromAccountId: transfer.fromAccountId, toAccountId: transfer.toAccountId, amount: transfer.amount, comment: transfer.comment.trim(), ...(transfer.createdAt ? { createdAt: transfer.createdAt } : {}) };
            });

            return { ...validatedState, accounts: cleanAccounts, transfers, transactions, contributions };
        }
        function saveState() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch (error) {
                console.error("Ошибка сохранения:", error);
                showToast("Не удалось сохранить данные в браузере.", "error");
            }
        }

        function loadState() {
            try {
                const savedData = localStorage.getItem(STORAGE_KEY);

                if (!savedData) {
                    return;
                }

                const parsedData = migrateStateMoneyToMinor(JSON.parse(savedData));

                const accounts = Array.isArray(parsedData.accounts) && parsedData.accounts.length
                    ? parsedData.accounts
                    : [createDefaultAccount()];
                const fallbackAccountId = accounts[0].id;

                replaceState({
                    schemaVersion: CURRENT_SCHEMA_VERSION,
                    accounts,
                    transfers: Array.isArray(parsedData.transfers) ? parsedData.transfers : [],
                    transactions: Array.isArray(parsedData.transactions)
                        ? parsedData.transactions.map((transaction) => ({
                            ...transaction,
                            accountId: transaction.accountId || fallbackAccountId
                        }))
                        : [],
                    goals: Array.isArray(parsedData.goals)
                        ? parsedData.goals.map(normalizeGoal)
                        : [],
                    contributions: Array.isArray(parsedData.contributions)
                        ? parsedData.contributions.map((contribution) => ({
                            ...contribution,
                            accountId: contribution.accountId || fallbackAccountId
                        }))
                        : []
                });
            } catch (error) {
                console.error("Ошибка загрузки:", error);
                showToast("Сохранённые данные повреждены.", "error");
            }
        }

        function commitChanges() {
            saveState();
            renderAll();
        }
