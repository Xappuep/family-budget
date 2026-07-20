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
        function renderSummary() {
            const summary = calculateSummary(getSummaryDateRange());
            const mainAccount = state.accounts.find((account) => account.id === DEFAULT_ACCOUNT_ID)
                || state.accounts[0];
            const mainAccountBalance = mainAccount ? getAccountBalance(mainAccount.id) : 0;

            animateMoney(elements.totalIncome, summary.income);
            animateMoney(elements.totalExpense, summary.expense);
            animateMoney(elements.totalBalance, mainAccountBalance);
            animateMoney(elements.totalSavings, summary.savings);

            elements.incomeCount.textContent =
                `Операций: ${summary.incomeCount}`;

            elements.expenseCount.textContent =
                `Операций: ${summary.expenseCount}`;

            elements.goalsCount.textContent =
                `Вкладов: ${state.goals.filter((goal) => getGoalType(goal) === GOAL_TYPE.DEPOSIT).length} · Кредитов: ${state.goals.filter((goal) => getGoalType(goal) === GOAL_TYPE.CREDIT).length}`;

            elements.totalBalance.classList.remove("positive", "negative");

            if (mainAccountBalance > 0) {
                elements.totalBalance.classList.add("positive");
                elements.balanceStatus.textContent =
                    "Текущий доступный остаток";
            } else if (mainAccountBalance < 0) {
                elements.totalBalance.classList.add("negative");
                elements.balanceStatus.textContent =
                    "Отрицательный остаток";
            } else {
                elements.balanceStatus.textContent =
                    mainAccount ? "На счёте нет доступных средств" : "Добавьте основной счёт";
            }
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
