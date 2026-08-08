"use strict";

        function getGoalType(goal) {
            return goal.type === GOAL_TYPE.CREDIT
                ? GOAL_TYPE.CREDIT
                : GOAL_TYPE.DEPOSIT;
        }

        function normalizeGoal(goal) {
            const type = getGoalType(goal);
            const createdDate = typeof goal.createdAt === "string"
                ? goal.createdAt.slice(0, 10)
                : "";

            const openedAt = goal.openedAt || createdDate || getLocalDateString();
            const currentDate = getLocalDateString();
            const defaultBalanceDate = goal.deadline && goal.deadline < currentDate
                ? goal.deadline
                : currentDate;
            return {
                ...goal,
                type,
                annualRate: toPositiveNumber(goal.annualRate),
                openedAt,
                balanceAsOf: type === GOAL_TYPE.DEPOSIT
                    ? (goal.balanceAsOf || defaultBalanceDate)
                    : openedAt,
                capitalization: type === GOAL_TYPE.DEPOSIT && goal.capitalization === "none"
                    ? "none"
                    : "monthly"
            };
        }

        function getGoalContributionsTotal(goalId) {
            return state.contributions
                .filter((contribution) => contribution.goalId === goalId)
                .reduce((sum, contribution) => {
                    return sum + toPositiveNumber(contribution.amount);
                }, 0);
        }

        function calculateDeposit(goal, asOfDate = getLocalDateString()) {
            const openedAt = goal.openedAt || getLocalDateString();
            const balanceAsOf = goal.balanceAsOf || openedAt;
            const accrualStart = balanceAsOf > openedAt ? balanceAsOf : openedAt;
            const calculationDate = goal.deadline && goal.deadline < asOfDate
                ? goal.deadline
                : asOfDate;
            const start = parseUtcDate(accrualStart);
            const end = parseUtcDate(calculationDate);
            if (!start || !end || end < start) {
                return { principal: 0, interest: 0, total: 0 };
            }

            const contributionsByDate = new Map();
            state.contributions
                .filter((contribution) => contribution.goalId === goal.id)
                .filter((contribution) => !contribution.date || contribution.date >= accrualStart)
                .forEach((contribution) => {
                    const effectiveDate = contribution.date && contribution.date > accrualStart
                        ? contribution.date
                        : accrualStart;
                    if (effectiveDate <= calculationDate) {
                        contributionsByDate.set(
                            effectiveDate,
                            (contributionsByDate.get(effectiveDate) || 0) + toPositiveNumber(contribution.amount)
                        );
                    }
                });

            let principal = toPositiveNumber(goal.initialAmount);
            let balance = principal;
            let accrued = 0;
            let current = new Date(start.getTime());
            const annualRate = toPositiveNumber(goal.annualRate) / 100;
            const capitalization = goal.capitalization === "none" ? "none" : "monthly";

            while (current <= end) {
                const dateString = current.toISOString().slice(0, 10);
                const contribution = contributionsByDate.get(dateString) || 0;
                principal += contribution;
                balance += contribution;

                if (current < end && annualRate > 0) {
                    const year = current.getUTCFullYear();
                    const daysInYear = Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1);
                    accrued += balance * annualRate / (daysInYear / 86400000);

                    const tomorrow = new Date(current.getTime() + 86400000);
                    const isMonthEnd = tomorrow.getUTCMonth() !== current.getUTCMonth();
                    if (capitalization === "monthly" && isMonthEnd) {
                        const capitalized = Math.round(accrued);
                        balance += capitalized;
                        accrued -= capitalized;
                    }
                }
                current = new Date(current.getTime() + 86400000);
            }

            const interest = Math.round(balance - principal + accrued);
            return { principal, interest, total: principal + interest };
        }

        function getCreditPaymentDates(goal, asOfDate) {
            const asOf = parseUtcDate(asOfDate);
            const deadline = parseUtcDate(goal.deadline);
            const openedAt = parseUtcDate(goal.openedAt);
            if (!asOf || !deadline || !openedAt || deadline <= asOf) return [];

            const paymentDay = openedAt.getUTCDate();
            let candidate = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
            candidate.setUTCDate(Math.min(
                paymentDay,
                new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0)).getUTCDate()
            ));
            if (candidate <= asOf) candidate = addUtcMonths(candidate, 1, paymentDay);

            const dates = [];
            while (candidate <= deadline) {
                dates.push(candidate.toISOString().slice(0, 10));
                candidate = addUtcMonths(candidate, 1, paymentDay);
            }
            if (dates.length === 0 || dates[dates.length - 1] !== goal.deadline) {
                dates.push(goal.deadline);
            }
            return [...new Set(dates)];
        }

        function calculateCreditSchedule(goal, asOfDate = getLocalDateString()) {
            const paidPrincipal = Math.min(
                toPositiveNumber(goal.target),
                toPositiveNumber(goal.initialAmount) + getGoalContributionsTotal(goal.id)
            );
            const initialBalance = Math.max(toPositiveNumber(goal.target) - paidPrincipal, 0);
            const paymentDates = getCreditPaymentDates(goal, asOfDate);
            const monthlyRate = toPositiveNumber(goal.annualRate) / 1200;

            if (initialBalance === 0 || paymentDates.length === 0) {
                return { initialBalance, monthlyPayment: 0, totalInterest: 0, totalPayment: 0, rows: [] };
            }

            const periods = paymentDates.length;
            const exactPayment = monthlyRate > 0
                ? initialBalance * monthlyRate / (1 - Math.pow(1 + monthlyRate, -periods))
                : initialBalance / periods;
            const monthlyPayment = Math.round(exactPayment);
            let balance = initialBalance;
            let totalInterest = 0;

            const rows = paymentDates.map((date, index) => {
                const interest = Math.round(balance * monthlyRate);
                const principal = index === periods - 1
                    ? balance
                    : Math.min(balance, Math.max(monthlyPayment - interest, 0));
                const payment = principal + interest;
                balance -= principal;
                totalInterest += interest;
                return { number: index + 1, date, payment, principal, interest, balance };
            });

            return {
                initialBalance,
                monthlyPayment: rows[0]?.payment || 0,
                totalInterest,
                totalPayment: initialBalance + totalInterest,
                rows
            };
        }

        function getGoalCurrentAmount(goal) {
            if (getGoalType(goal) === GOAL_TYPE.DEPOSIT) {
                return calculateDeposit(goal).total;
            }
            return toPositiveNumber(goal.initialAmount) + getGoalContributionsTotal(goal.id);
        }

        function getGoalById(goalId) {
            return state.goals.find((goal) => goal.id === goalId);
        }


        function getAccountById(accountId) {
            return state.accounts.find((account) => account.id === accountId);
        }

        function getAccountBalance(accountId) {
            const account = getAccountById(accountId);
            if (!account) return 0;

            const transactionChange = state.transactions.reduce((sum, transaction) => {
                if (transaction.accountId !== accountId) return sum;
                const amount = toPositiveNumber(transaction.amount);
                return sum + (transaction.type === "income" ? amount : -amount);
            }, 0);
            const transferChange = state.transfers.reduce((sum, transfer) => {
                const amount = toPositiveNumber(transfer.amount);
                if (transfer.fromAccountId === accountId) sum -= amount;
                if (transfer.toAccountId === accountId) sum += amount;
                return sum;
            }, 0);

            const contributionChange = state.contributions.reduce((sum, contribution) => {
                return contribution.accountId === accountId
                    ? sum - toPositiveNumber(contribution.amount)
                    : sum;
            }, 0);

            return Number(account.openingBalance || 0) + transactionChange + transferChange + contributionChange;
        }
        function getAvailableAccountBalanceForContribution(accountId, contributionId = "") {
            const existingContribution = contributionId
                ? state.contributions.find((contribution) => contribution.id === contributionId)
                : null;
            const refundableAmount = existingContribution?.accountId === accountId
                ? toPositiveNumber(existingContribution.amount)
                : 0;
            return getAccountBalance(accountId) + refundableAmount;
        }

        function isTransactionInDateRange(transaction, dateRange) {
            if (!dateRange) return true;
            if (dateRange.from && transaction.date < dateRange.from) return false;
            if (dateRange.to && transaction.date > dateRange.to) return false;
            return true;
        }

        /**
         * Корректный createdAt операции или пустая строка для legacy-записей.
         */
        function getTransactionCreatedAtValue(transaction) {
            return typeof transaction?.createdAt === "string" && transaction.createdAt
                ? transaction.createdAt
                : "";
        }

        /**
         * Единый comparator: сначала date ↓, затем createdAt ↓, иначе индекс в массиве ↓.
         * Элементы: { transaction, index }. Не мутирует state.
         */
        function compareTransactionsNewestFirst(first, second) {
            const firstDate = String(first.transaction?.date || "");
            const secondDate = String(second.transaction?.date || "");
            const byDate = secondDate.localeCompare(firstDate);

            if (byDate !== 0) {
                return byDate;
            }

            const firstCreated = getTransactionCreatedAtValue(first.transaction);
            const secondCreated = getTransactionCreatedAtValue(second.transaction);

            if (firstCreated && secondCreated) {
                const byCreated = secondCreated.localeCompare(firstCreated);

                if (byCreated !== 0) {
                    return byCreated;
                }
            }

            return second.index - first.index;
        }

        /**
         * Копия списка операций, отсортированная newest-first.
         * Индексы берутся из исходного массива (важно для legacy без createdAt).
         */
        function sortTransactionsNewestFirst(transactions) {
            return transactions
                .map((transaction, index) => ({ transaction, index }))
                .sort(compareTransactionsNewestFirst)
                .map(({ transaction }) => transaction);
        }

        /**
         * Последний использованный счёт по времени создания операции (createdAt),
         * а не по финансовой дате. Не использует sortTransactionsNewestFirst.
         *
         * @param {Array} transactions
         * @param {(accountId: string) => boolean} accountExists
         * @returns {string} accountId или ""
         */
        function getLastUsedTransactionAccountId(transactions, accountExists) {
            const exists =
                typeof accountExists === "function"
                    ? accountExists
                    : () => true;

            const candidates = [];

            (transactions || []).forEach((transaction, index) => {
                const accountId = transaction?.accountId;

                if (!accountId || !exists(accountId)) {
                    return;
                }

                candidates.push({ transaction, index });
            });

            if (!candidates.length) {
                return "";
            }

            const withCreatedAt = candidates.filter((item) =>
                getTransactionCreatedAtValue(item.transaction)
            );

            if (withCreatedAt.length) {
                let newest = withCreatedAt[0];

                for (let index = 1; index < withCreatedAt.length; index += 1) {
                    const candidate = withCreatedAt[index];
                    const byCreated = getTransactionCreatedAtValue(
                        candidate.transaction
                    ).localeCompare(
                        getTransactionCreatedAtValue(newest.transaction)
                    );

                    if (
                        byCreated > 0 ||
                        (byCreated === 0 && candidate.index > newest.index)
                    ) {
                        newest = candidate;
                    }
                }

                return newest.transaction.accountId;
            }

            // Legacy без createdAt: последний по порядку массива.
            return candidates.reduce((newest, candidate) =>
                candidate.index > newest.index ? candidate : newest
            ).transaction.accountId;
        }

        function calculateSummary(dateRange = null) {
            const incomeTransactions = state.transactions.filter(
                (transaction) => transaction.type === "income" && isTransactionInDateRange(transaction, dateRange)
            );

            const expenseTransactions = state.transactions.filter(
                (transaction) => transaction.type === "expense" && isTransactionInDateRange(transaction, dateRange)
            );

            const income = incomeTransactions.reduce(
                (sum, transaction) => sum + toPositiveNumber(transaction.amount),
                0
            );

            const expense = expenseTransactions.reduce(
                (sum, transaction) => sum + toPositiveNumber(transaction.amount),
                0
            );

            const savings = state.goals
                .filter((goal) => getGoalType(goal) === GOAL_TYPE.DEPOSIT)
                .reduce(
                    (sum, goal) => sum + getGoalCurrentAmount(goal),
                    0
                );

            return {
                income,
                expense,
                balance: income - expense,
                savings,
                incomeCount: incomeTransactions.length,
                expenseCount: expenseTransactions.length
            };
        }


        function calculateCategoryTotals(type, dateRange = null) {
            const totals = {};

            state.transactions
                .filter((transaction) => transaction.type === type && isTransactionInDateRange(transaction, dateRange))
                .forEach((transaction) => {
                    const category = transaction.category || "Без категории";

                    totals[category] =
                        (totals[category] || 0) +
                        toPositiveNumber(transaction.amount);
                });

            return Object.entries(totals)
                .map(([name, amount]) => ({ name, amount }))
                .sort((first, second) => second.amount - first.amount);
        }
