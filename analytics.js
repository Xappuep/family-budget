"use strict";

        function getSummaryDateRange() {
            const period = elements.summaryPeriod.value;
            const today = getToday();
            const year = today.slice(0, 4);
            const month = today.slice(0, 7);

            if (period === "month") return { from: `${month}-01`, to: `${month}-31` };
            if (period === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
            if (period === "custom") {
                const from = elements.summaryDateFrom.value || null;
                const to = elements.summaryDateTo.value || null;
                return { from, to };
            }
            return null;
        }

        function updateSummaryPeriod() {
            const isCustom = elements.summaryPeriod.value === "custom";
            elements.summaryCustomPeriod.classList.toggle("hidden", !isCustom);
            renderSummary();
            renderAnalytics();
        }

        /**
         * Подпись количества активных целей для Mobile Dashboard.
         * Использует уже существующий список state.goals (без нового расчёта).
         */
        function formatActiveGoalsLabel(count) {
            const absoluteCount = Math.abs(Number(count) || 0);
            const mod10 = absoluteCount % 10;
            const mod100 = absoluteCount % 100;

            if (mod10 === 1 && mod100 !== 11) {
                return `${absoluteCount} активная`;
            }

            if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
                return `${absoluteCount} активные`;
            }

            return `${absoluteCount} активных`;
        }

        /**
         * Дата в preview последней операции: «Сегодня» или formatDate().
         */
        function formatRecentTransactionDate(dateString) {
            if (dateString && dateString === getToday()) {
                return "Сегодня";
            }

            return formatDate(dateString);
        }

        /**
         * Последние операции для Mobile Dashboard.
         * Тот же comparator, что и у вкладки «Операции» (без мутации state).
         */
        function getRecentTransactions(limit = 5) {
            return sortTransactionsNewestFirst(state.transactions).slice(0, limit);
        }

        /**
         * Компактный preview последних операций на мобильной Главной.
         */
        function renderMobileRecentTransactions() {
            if (!elements.mobileRecentTransactions) {
                return;
            }

            const recentTransactions = getRecentTransactions(5);
            elements.mobileRecentTransactions.innerHTML = "";

            if (!recentTransactions.length) {
                elements.mobileRecentTransactions.innerHTML = `
                    <div class="mobile-dashboard__empty">
                        <div class="mobile-dashboard__empty-icon" aria-hidden="true">◇</div>
                        <p class="mobile-dashboard__empty-title">Операций пока нет.</p>
                        <p class="mobile-dashboard__empty-text">
                            Добавьте первый доход или расход через кнопку «+».
                        </p>
                    </div>
                `;
                return;
            }

            recentTransactions.forEach((transaction) => {
                const isIncome = transaction.type === "income";
                const amountPrefix = isIncome ? "+" : "−";
                const accountName =
                    getAccountById(transaction.accountId)?.name || "—";
                const comment = String(transaction.comment || "").trim();
                const secondaryParts = [
                    comment || formatRecentTransactionDate(transaction.date),
                    accountName
                ].filter(Boolean);

                const item = document.createElement("article");
                item.className = "mobile-dashboard__tx";
                item.innerHTML = `
                    <div class="mobile-dashboard__tx-main">
                        <div class="mobile-dashboard__tx-category">
                            ${escapeHTML(transaction.category || "Без категории")}
                        </div>
                        <div class="mobile-dashboard__tx-amount ${
                            isIncome ? "positive" : "negative"
                        }">
                            ${amountPrefix}${escapeHTML(formatMoney(transaction.amount))}
                        </div>
                    </div>
                    <div class="mobile-dashboard__tx-meta">
                        ${escapeHTML(secondaryParts.join(" · "))}
                    </div>
                `;

                elements.mobileRecentTransactions.appendChild(item);
            });
        }

        /**
         * Обновляет Mobile Dashboard теми же данными, что и desktop-сводка.
         */
        function renderMobileDashboard(summary, mainAccountBalance, balanceNote, activeGoalsCount) {
            if (!elements.mobileAvailableBalance) {
                return;
            }

            animateMoney(elements.mobileAvailableBalance, mainAccountBalance);
            animateMoney(elements.mobileIncome, summary.income);
            animateMoney(elements.mobileExpense, summary.expense);
            animateMoney(elements.mobileSavings, summary.savings);

            elements.mobileAvailableBalance.classList.remove("positive", "negative");

            if (mainAccountBalance > 0) {
                elements.mobileAvailableBalance.classList.add("positive");
            } else if (mainAccountBalance < 0) {
                elements.mobileAvailableBalance.classList.add("negative");
            }

            if (elements.mobileAvailableNote) {
                elements.mobileAvailableNote.textContent = balanceNote;
            }

            if (elements.mobileGoalsActive) {
                elements.mobileGoalsActive.textContent =
                    formatActiveGoalsLabel(activeGoalsCount);
            }

            renderMobileRecentTransactions();
        }

        function renderSummary() {
            const summary = calculateSummary(getSummaryDateRange());
            const mainAccount = state.accounts.find((account) => account.id === DEFAULT_ACCOUNT_ID)
                || state.accounts[0];
            const mainAccountBalance = mainAccount ? getAccountBalance(mainAccount.id) : 0;
            const depositCount = state.goals.filter(
                (goal) => getGoalType(goal) === GOAL_TYPE.DEPOSIT
            ).length;
            const creditCount = state.goals.filter(
                (goal) => getGoalType(goal) === GOAL_TYPE.CREDIT
            ).length;
            const activeGoalsCount = depositCount + creditCount;

            animateMoney(elements.totalIncome, summary.income);
            animateMoney(elements.totalExpense, summary.expense);
            animateMoney(elements.totalBalance, mainAccountBalance);
            animateMoney(elements.totalSavings, summary.savings);

            elements.incomeCount.textContent =
                `Операций: ${summary.incomeCount}`;

            elements.expenseCount.textContent =
                `Операций: ${summary.expenseCount}`;

            elements.goalsCount.textContent =
                `Вкладов: ${depositCount} · Кредитов: ${creditCount}`;

            elements.totalBalance.classList.remove("positive", "negative");

            let balanceNote;

            if (mainAccountBalance > 0) {
                elements.totalBalance.classList.add("positive");
                balanceNote = "Текущий доступный остаток";
            } else if (mainAccountBalance < 0) {
                elements.totalBalance.classList.add("negative");
                balanceNote = "Отрицательный остаток";
            } else {
                balanceNote = mainAccount
                    ? "На счёте нет доступных средств"
                    : "Добавьте основной счёт";
            }

            elements.balanceStatus.textContent = balanceNote;

            renderMobileDashboard(
                summary,
                mainAccountBalance,
                balanceNote,
                activeGoalsCount
            );
        }

        /* =========================================================
           7. ДОХОДЫ И РАСХОДЫ
           ========================================================= */

        /**
         * Добавляет новую операцию или сохраняет изменения.
         */
        function renderCategoryAnalytics(container, type) {
            const categories = calculateCategoryTotals(type, getSummaryDateRange());
            container.innerHTML = "";

            if (!categories.length) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state__icon">📊</div>
                        <strong>Недостаточно данных</strong>
                        Добавьте операции, чтобы увидеть распределение.
                    </div>
                `;
                return;
            }

            const maximumAmount = Math.max(
                ...categories.map((category) => category.amount)
            );

            categories.forEach((category) => {
                const percentage =
                    maximumAmount > 0
                        ? (category.amount / maximumAmount) * 100
                        : 0;

                const row = document.createElement("div");
                row.className = "category-row";

                row.innerHTML = `
                    <div class="category-row__header">
                        <span class="category-row__name">
                            ${escapeHTML(category.name)}
                        </span>

                        <span class="category-row__value">
                            ${escapeHTML(formatMoney(category.amount))}
                        </span>
                    </div>

                    <div class="category-bar">
                        <div
                            class="category-bar__fill"
                            style="width: ${percentage}%"
                        ></div>
                    </div>
                `;

                container.appendChild(row);
            });
        }

        function renderAnalytics() {
            renderCategoryAnalytics(elements.expenseAnalytics, "expense");
            renderCategoryAnalytics(elements.incomeAnalytics, "income");
        }

        /* =========================================================
           12. ЭКСПОРТ, ИМПОРТ И ОЧИСТКА
           ========================================================= */

        /**
         * Создаёт JSON-файл с резервной копией.
         */
