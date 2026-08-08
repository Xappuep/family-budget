"use strict";

const goalAmountSnapshot = new Map();

        function handleGoalSubmit(event) {
            event.preventDefault();

            const type = elements.goalType.value === GOAL_TYPE.CREDIT
                ? GOAL_TYPE.CREDIT
                : GOAL_TYPE.DEPOSIT;
            const isDeposit = type === GOAL_TYPE.DEPOSIT;
            const name = elements.goalName.value.trim();
            const target = rublesToMinor(elements.goalTarget.value);
            const initialAmount = rublesToMinor(elements.goalInitialAmount.value);
            const annualRate = Number(elements.goalAnnualRate.value);
            const openedAt = elements.goalOpenedAt.value;
            const balanceAsOf = elements.goalBalanceAsOf.value;

            if (!name) {
                showFormMessage(
                    elements.goalMessage,
                    "Введите название цели.",
                    "error"
                );
                return;
            }

            if (!Number.isFinite(target) || target <= 0) {
                showFormMessage(
                    elements.goalMessage,
                    isDeposit
                        ? "Нужная сумма должна быть больше нуля."
                        : "Сумма кредита должна быть больше нуля.",
                    "error"
                );
                return;
            }

            if (!Number.isFinite(initialAmount) || initialAmount < 0) {
                showFormMessage(
                    elements.goalMessage,
                    isDeposit
                        ? "Начальная сумма не может быть отрицательной."
                        : "Сумма погашения не может быть отрицательной.",
                    "error"
                );
                return;
            }

            if (
                elements.goalAnnualRate.value !== "" &&
                (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100)
            ) {
                revealGoalFormExtra();
                showFormMessage(
                    elements.goalMessage,
                    "Годовая ставка должна быть от 0 до 100%.",
                    "error"
                );
                return;
            }

            if (!openedAt) {
                revealGoalFormExtra();
                showFormMessage(elements.goalMessage, isDeposit ? "Укажите дату открытия вклада." : "Укажите дату выдачи кредита.", "error");
                return;
            }

            if (openedAt > getToday()) {
                revealGoalFormExtra();
                showFormMessage(elements.goalMessage, isDeposit ? "Дата открытия не может быть в будущем." : "Дата выдачи не может быть в будущем.", "error");
                return;
            }

            if (isDeposit && (!balanceAsOf || balanceAsOf < openedAt || balanceAsOf > getToday())) {
                revealGoalFormExtra();
                showFormMessage(
                    elements.goalMessage,
                    "Дата актуальности суммы должна быть между датой открытия и сегодняшним днем.",
                    "error"
                );
                return;
            }

            if (isDeposit && elements.goalDeadline.value && balanceAsOf > elements.goalDeadline.value) {
                revealGoalFormExtra();
                showFormMessage(
                    elements.goalMessage,
                    "Дата актуальности суммы не может быть позже окончания вклада.",
                    "error"
                );
                return;
            }

            if (elements.goalDeadline.value && openedAt > elements.goalDeadline.value) {
                revealGoalFormExtra();
                showFormMessage(elements.goalMessage, isDeposit ? "Дата открытия должна быть раньше срока вклада." : "Дата выдачи должна быть раньше даты закрытия.", "error");
                return;
            }

            const goalData = {
                type,
                name,
                target,
                initialAmount,
                deadline: elements.goalDeadline.value,
                comment: elements.goalComment.value.trim(),
                openedAt,
                balanceAsOf: isDeposit ? balanceAsOf : openedAt,
                capitalization: isDeposit ? elements.goalCapitalization.value : "monthly",
                annualRate: Number.isFinite(annualRate) ? annualRate : 0
            };

            const editingId = elements.goalId.value;

            if (editingId) {
                const index = state.goals.findIndex(
                    (goal) => goal.id === editingId
                );

                if (index !== -1) {
                    state.goals[index] = normalizeGoal({
                        ...state.goals[index],
                        ...goalData
                    });
                }

                showToast(isDeposit ? "Вклад обновлён." : "Кредит обновлён.");
            } else {
                state.goals.push(
                    normalizeGoal({
                        id: createId(),
                        createdAt: new Date().toISOString(),
                        ...goalData
                    })
                );

                showToast(isDeposit ? "Вклад добавлен." : "Кредит добавлен.");
            }

            resetGoalForm();
            commitChanges();
        }

        /**
         * На mobile раскрывает блок «Дополнительно», если ошибка в скрытых полях.
         */
        function revealGoalFormExtra() {
            if (
                elements.goalFormExtra &&
                typeof window.matchMedia === "function" &&
                window.matchMedia("(max-width: 620px)").matches
            ) {
                elements.goalFormExtra.open = true;
            }
        }

        /**
         * Меняет подписи формы и показывает поле доходности только для вкладов.
         */
        function updateGoalFormByType() {
            const isDeposit = elements.goalType.value === GOAL_TYPE.DEPOSIT;

            elements.goalAnnualRateField.classList.remove("hidden");
            elements.goalOpenedAtField.classList.remove("hidden");
            elements.goalCapitalizationField.classList.toggle("hidden", !isDeposit);
            elements.goalBalanceAsOfField.classList.toggle("hidden", !isDeposit);
            // Не ставим HTML required: на mobile поле в «Дополнительно»,
            // а default и JS-валидация уже обеспечивают корректный UX.
            elements.goalBalanceAsOf.required = false;
            elements.goalAnnualRateField.querySelector("label").textContent = isDeposit
                ? "Годовой доход, %"
                : "Годовая ставка, %";
            elements.goalOpenedAtField.querySelector("label").textContent = isDeposit
                ? "Дата открытия"
                : "Дата выдачи";

            elements.goalTargetLabel.textContent = isDeposit
                ? "Нужная сумма, ₽"
                : "Сумма кредита, ₽";

            elements.goalInitialAmountLabel.textContent = isDeposit
                ? "Уже накоплено, ₽"
                : "Уже погашено, ₽";

            elements.goalDeadlineLabel.textContent = isDeposit
                ? "Желаемый срок"
                : "Плановая дата закрытия";

            elements.goalName.placeholder = isDeposit
                ? "Например, семейный отпуск"
                : "Например, ипотека";

            elements.goalComment.placeholder = isDeposit
                ? "Банк, условия вклада, важные детали"
                : "Банк, ставка, график платежей";
        }

        function editGoal(goalId) {
            const goal = getGoalById(goalId);

            if (!goal) {
                return;
            }

            elements.goalId.value = goal.id;
            elements.goalType.value = getGoalType(goal);
            elements.goalName.value = goal.name;
            elements.goalTarget.value = minorToRubles(goal.target);
            elements.goalInitialAmount.value = minorToRubles(goal.initialAmount);
            elements.goalDeadline.value = goal.deadline || "";
            elements.goalOpenedAt.value = goal.openedAt || getToday();
            elements.goalBalanceAsOf.value = goal.balanceAsOf || getToday();
            elements.goalCapitalization.value = goal.capitalization === "none" ? "none" : "monthly";
            elements.goalComment.value = goal.comment || "";
            elements.goalAnnualRate.value =
                goal.annualRate ? goal.annualRate : "";

            updateGoalFormByType();

            elements.goalFormTitle.textContent =
                getGoalType(goal) === GOAL_TYPE.DEPOSIT
                    ? "Редактировать вклад"
                    : "Редактировать кредит";

            elements.cancelGoalEdit.classList.remove("hidden");
            elements.cancelGoalEdit.textContent = "Отменить редактирование";
            showFormMessage(elements.goalMessage, "");

            if (elements.goalFormExtra) {
                elements.goalFormExtra.open = false;
            }

            elements.goalForm.classList.add("is-mobile-open");
            elements.goalForm.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }

        function deleteGoal(goalId) {
            const goal = getGoalById(goalId);

            if (!goal) {
                return;
            }

            const contributionsCount = state.contributions.filter(
                (contribution) => contribution.goalId === goalId
            ).length;

            const paymentLabel =
                getGoalType(goal) === GOAL_TYPE.CREDIT ? "платежи" : "вклады";

            const warning =
                contributionsCount > 0
                    ? ` Вместе с записью будут удалены связанные ${paymentLabel}: ${contributionsCount}.`
                    : "";

            const confirmed = window.confirm(
                `Удалить ${getGoalType(goal) === GOAL_TYPE.CREDIT ? "кредит" : "вклад"} «${goal.name}»?${warning}`
            );

            if (!confirmed) {
                return;
            }

            state.goals = state.goals.filter((item) => item.id !== goalId);

            state.contributions = state.contributions.filter(
                (contribution) => contribution.goalId !== goalId
            );

            if (elements.goalId.value === goalId) {
                resetGoalForm();
            }

            showToast(
                getGoalType(goal) === GOAL_TYPE.CREDIT
                    ? "Кредит удалён."
                    : "Вклад удалён."
            );
            commitChanges();
        }

        function resetGoalForm() {
            elements.goalForm.reset();
            elements.goalId.value = "";
            elements.goalType.value = GOAL_TYPE.DEPOSIT;
            elements.goalInitialAmount.value = "0";
            elements.goalAnnualRate.value = "";
            elements.goalOpenedAt.value = getToday();
            elements.goalBalanceAsOf.value = getToday();
            elements.goalCapitalization.value = "monthly";
            elements.goalFormTitle.textContent = "Добавить финансовую цель";
            elements.cancelGoalEdit.classList.add("hidden");
            elements.cancelGoalEdit.textContent = "Отменить редактирование";
            elements.goalForm.classList.remove("is-mobile-open");

            if (elements.goalFormExtra) {
                elements.goalFormExtra.open = false;
            }

            updateGoalFormByType();
            showFormMessage(elements.goalMessage, "");
        }

        function openMobileGoalForm() {
            resetGoalForm();
            elements.goalForm.classList.add("is-mobile-open");
            elements.cancelGoalEdit.classList.remove("hidden");
            elements.cancelGoalEdit.textContent = "Отмена";

            if (!elements.goalOpenedAt.value) {
                elements.goalOpenedAt.value = getToday();
            }

            if (!elements.goalBalanceAsOf.value) {
                elements.goalBalanceAsOf.value = getToday();
            }

            elements.goalForm.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            window.setTimeout(() => {
                elements.goalName.focus();
            }, 50);
        }

        function sortGoals(goals) {
            return [...goals].sort((first, second) => {
                if (!first.deadline && !second.deadline) {
                    return first.name.localeCompare(second.name, "ru");
                }

                if (!first.deadline) {
                    return 1;
                }

                if (!second.deadline) {
                    return -1;
                }

                return first.deadline.localeCompare(second.deadline);
            });
        }

        function createGoalCard(goal, isNew = false) {
            const type = getGoalType(goal);
            const isDeposit = type === GOAL_TYPE.DEPOSIT;
            const currentAmount = getGoalCurrentAmount(goal);
            const remainingAmount = Math.max(
                toPositiveNumber(goal.target) - currentAmount,
                0
            );

            const percentage = goal.target > 0
                ? Math.min((currentAmount / goal.target) * 100, 100)
                : 0;

            const monthsUntil = getMonthsUntil(goal.deadline);

            let monthlyRecommendation = "Срок не указан";

            if (monthsUntil === 0) {
                monthlyRecommendation =
                    remainingAmount > 0
                        ? (isDeposit ? "Срок уже наступил" : "Срок погашения наступил")
                        : (isDeposit ? "Цель достигнута" : "Кредит погашен");
            } else if (monthsUntil !== null) {
                monthlyRecommendation =
                    remainingAmount > 0
                        ? formatMoney(remainingAmount / monthsUntil)
                        : (isDeposit ? "Цель достигнута" : "Кредит погашен");
            }

            const depositCalculation = isDeposit ? calculateDeposit(goal) : null;
            const deadlineCalculation = isDeposit && goal.deadline && goal.deadline >= getToday()
                ? calculateDeposit(goal, goal.deadline)
                : null;
            const creditSchedule = !isDeposit ? calculateCreditSchedule(goal) : null;
            const futureDepositInterest = deadlineCalculation
                ? Math.max(deadlineCalculation.interest - depositCalculation.interest, 0)
                : null;
            const creditMonthlyHint =
                !isDeposit && creditSchedule?.rows?.length
                    ? creditSchedule.monthlyPayment
                    : null;

            const card = document.createElement("article");
            card.className = `card goal-card ${isDeposit ? "goal-card--deposit" : "goal-card--credit"}`;
            card.dataset.goalId = goal.id;

            const previousAmount = goalAmountSnapshot.get(goal.id);
            if (isNew) {
                card.classList.add("goal-card--enter");
            } else if (previousAmount !== undefined && previousAmount !== currentAmount) {
                card.classList.add("goal-card--updated");
            }
            goalAmountSnapshot.set(goal.id, currentAmount);

            card.innerHTML = `
                <div class="goal-card__summary">
                    <div class="goal-card__header">
                        <div>
                            <h3>${escapeHTML(goal.name)}</h3>
                            ${
                                goal.deadline
                                    ? `<div class="goal-card__deadline">${
                                          isDeposit ? "Срок" : "Закрытие"
                                      }: ${escapeHTML(formatDate(goal.deadline))}</div>`
                                    : ""
                            }
                        </div>

                        <span class="badge ${isDeposit ? "badge--goal" : "badge--credit"}">
                            ${percentage.toFixed(0)}%
                        </span>
                    </div>

                    <div class="goal-card__numbers">
                        ${
                            isDeposit
                                ? `
                            <div>
                                <span>Накоплено</span><br>
                                <strong>${escapeHTML(formatMoney(currentAmount))}</strong>
                            </div>
                            <div style="text-align: right;">
                                <span>Цель</span><br>
                                <strong>${escapeHTML(formatMoney(goal.target))}</strong>
                            </div>
                        `
                                : `
                            <div>
                                <span>Погашено</span><br>
                                <strong>${escapeHTML(formatMoney(currentAmount))}</strong>
                            </div>
                            <div style="text-align: right;">
                                <span>Остаток</span><br>
                                <strong>${escapeHTML(formatMoney(remainingAmount))}</strong>
                            </div>
                        `
                        }
                    </div>

                    <div
                        class="progress"
                        role="progressbar"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow="${percentage.toFixed(0)}"
                    >
                        <div
                            class="progress__bar"
                            style="width: ${percentage}%"
                        ></div>
                    </div>

                    ${
                        creditMonthlyHint !== null
                            ? `<div class="goal-card__hint">Платёж: ${escapeHTML(
                                  formatMoney(creditMonthlyHint)
                              )}/мес</div>`
                            : ""
                    }
                </div>

                <div class="goal-card__details">
                    <div class="goal-card__indicators">
                        <section class="goal-card__indicator-group goal-card__indicator-group--actual">
                            <h4><span class="indicator-label indicator-label--actual">Факт</span> На сегодня</h4>
                            <div class="goal-card__meta">
                                ${isDeposit ? `
                                    <div class="goal-card__meta-item">
                                        <span>Внесено своих средств</span>
                                        <strong>${escapeHTML(formatMoney(depositCalculation.principal))}</strong>
                                    </div>
                                    <div class="goal-card__meta-item">
                                        <span>Остаток актуален на</span>
                                        <strong>${escapeHTML(formatDate(goal.balanceAsOf))}</strong>
                                    </div>
                                    <div class="goal-card__meta-item">
                                        <span>Начислено процентов</span>
                                        <strong>${escapeHTML(formatMoney(depositCalculation.interest))}</strong>
                                    </div>
                                    <div class="goal-card__meta-item">
                                        <span>Фактическая сумма</span>
                                        <strong>${escapeHTML(formatMoney(depositCalculation.total))}</strong>
                                    </div>
                                ` : `
                                    <div class="goal-card__meta-item">
                                        <span>Фактически погашено</span>
                                        <strong>${escapeHTML(formatMoney(currentAmount))}</strong>
                                    </div>
                                    <div class="goal-card__meta-item">
                                        <span>Текущий основной долг</span>
                                        <strong>${escapeHTML(formatMoney(remainingAmount))}</strong>
                                    </div>
                                    <div class="goal-card__meta-item">
                                        <span>Погашено от суммы кредита</span>
                                        <strong>${percentage.toFixed(1)}%</strong>
                                    </div>
                                `}
                            </div>
                        </section>

                        <section class="goal-card__indicator-group goal-card__indicator-group--forecast">
                            <h4><span class="indicator-label indicator-label--forecast">Прогноз</span> До срока</h4>
                            <div class="goal-card__meta">
                                ${isDeposit ? `
                                    <div class="goal-card__meta-item">
                                        <span>Осталось до цели</span>
                                        <strong>${escapeHTML(formatMoney(remainingAmount))}</strong>
                                    </div>
                                    <div class="goal-card__meta-item">
                                        <span>Рекомендуемый вклад в месяц</span>
                                        <strong>${escapeHTML(monthlyRecommendation)}</strong>
                                    </div>
                                    <div class="goal-card__meta-item">
                                        <span>Будущие проценты</span>
                                        <strong>${futureDepositInterest === null ? "—" : escapeHTML(formatMoney(futureDepositInterest))}</strong>
                                    </div>
                                    <div class="goal-card__meta-item">
                                        <span>Расчетная сумма к сроку</span>
                                        <strong>${deadlineCalculation ? escapeHTML(formatMoney(deadlineCalculation.total)) : "—"}</strong>
                                    </div>
                                    <div class="goal-card__meta-item">
                                        <span>Условия расчета</span>
                                        <strong>${escapeHTML(formatPercent(goal.annualRate))}% · ${goal.capitalization === "none" ? "без капитализации" : "ежемесячно"}</strong>
                                    </div>
                                ` : `
                                    <div class="goal-card__meta-item">
                                        <span>Аннуитетный платеж</span>
                                        <strong>${creditSchedule.rows.length ? escapeHTML(formatMoney(creditSchedule.monthlyPayment)) : "—"}</strong>
                                    </div>
                                    <div class="goal-card__meta-item">
                                        <span>Будущие проценты</span>
                                        <strong>${creditSchedule.rows.length ? escapeHTML(formatMoney(creditSchedule.totalInterest)) : "—"}</strong>
                                    </div>
                                    <div class="goal-card__meta-item">
                                        <span>Всего будущих платежей</span>
                                        <strong>${creditSchedule.rows.length ? escapeHTML(formatMoney(creditSchedule.totalPayment)) : "—"}</strong>
                                    </div>
                                    <div class="goal-card__meta-item">
                                        <span>Ставка для прогноза</span>
                                        <strong>${escapeHTML(formatPercent(goal.annualRate))}%</strong>
                                    </div>
                                `}
                            </div>
                        </section>
                    </div>

                    ${!isDeposit ? `
                    <details class="credit-schedule">
                        <summary>Прогнозный график платежей (${creditSchedule.rows.length})</summary>
                        ${creditSchedule.rows.length ? `
                        <div class="credit-schedule__table-wrap">
                            <table class="credit-schedule__table">
                                <thead><tr><th>№</th><th>Дата</th><th>Платеж</th><th>Проценты</th><th>Основной долг</th><th>Остаток</th></tr></thead>
                                <tbody>${creditSchedule.rows.map((row) => `
                                    <tr>
                                        <td>${row.number}</td>
                                        <td>${escapeHTML(formatDate(row.date))}</td>
                                        <td>${escapeHTML(formatMoney(row.payment))}</td>
                                        <td>${escapeHTML(formatMoney(row.interest))}</td>
                                        <td>${escapeHTML(formatMoney(row.principal))}</td>
                                        <td>${escapeHTML(formatMoney(row.balance))}</td>
                                    </tr>`).join("")}
                                </tbody>
                            </table>
                        </div>` : `<p class="credit-schedule__empty">Укажите будущую дату закрытия и остаток долга.</p>`}
                    </details>` : ""}

                    <div class="goal-card__comment">
                        ${escapeHTML(goal.comment || "Комментарий не добавлен.")}
                    </div>

                    <button
                        class="button button--secondary button--small mobile-only goal-card__collapse"
                        type="button"
                        data-action="collapse-goal-details"
                    >
                        Свернуть
                    </button>
                </div>

                <div class="goal-card__actions">
                    <button
                        class="button button--primary button--small"
                        type="button"
                        data-action="quick-contribution"
                        data-id="${escapeHTML(goal.id)}"
                    >
                        ${isDeposit ? "+ Вклад" : "+ Платёж"}
                    </button>

                    <div class="mobile-action-menu mobile-only">
                        <button
                            class="mobile-action-menu__toggle"
                            type="button"
                            data-action="toggle-mobile-menu"
                            aria-label="Действия с целью"
                            aria-haspopup="true"
                            aria-expanded="false"
                        >
                            ⋯
                        </button>
                        <div class="mobile-action-menu__panel hidden" role="menu">
                            <button
                                class="mobile-action-menu__item"
                                type="button"
                                role="menuitem"
                                data-action="edit-goal"
                                data-id="${escapeHTML(goal.id)}"
                            >
                                Редактировать
                            </button>
                            <button
                                class="mobile-action-menu__item mobile-action-menu__item--danger"
                                type="button"
                                role="menuitem"
                                data-action="delete-goal"
                                data-id="${escapeHTML(goal.id)}"
                            >
                                Удалить
                            </button>
                        </div>
                    </div>

                    <button
                        class="button button--secondary button--small desktop-only-action"
                        type="button"
                        data-action="edit-goal"
                        data-id="${escapeHTML(goal.id)}"
                    >
                        Редактировать
                    </button>

                    <button
                        class="button button--danger button--small desktop-only-action"
                        type="button"
                        data-action="delete-goal"
                        data-id="${escapeHTML(goal.id)}"
                    >
                        Удалить
                    </button>

                    <button
                        class="button button--secondary button--small mobile-only"
                        type="button"
                        data-action="toggle-goal-details"
                    >
                        Подробнее
                    </button>
                </div>
            `;

            const progressBar = card.querySelector(".progress__bar");
            progressBar.style.width = "0";
            window.requestAnimationFrame(() => {
                progressBar.style.width = `${percentage}%`;
            });

            return card;
        }

        function renderGoals() {
            const existingGoalIds = new Set(
                [...document.querySelectorAll(".goal-card[data-goal-id]")]
                    .map((card) => card.dataset.goalId)
            );

            elements.depositsGrid.innerHTML = "";
            elements.creditsGrid.innerHTML = "";

            const depositGoals = sortGoals(
                state.goals.filter((goal) => getGoalType(goal) === GOAL_TYPE.DEPOSIT)
            );
            const creditGoals = sortGoals(
                state.goals.filter((goal) => getGoalType(goal) === GOAL_TYPE.CREDIT)
            );

            elements.depositsEmptyState.classList.toggle(
                "hidden",
                depositGoals.length > 0
            );
            elements.creditsEmptyState.classList.toggle(
                "hidden",
                creditGoals.length > 0
            );

            elements.depositsCount.textContent = formatGoalsCount(
                depositGoals.length,
                "вклад",
                "вклада",
                "вкладов"
            );
            elements.creditsCount.textContent = formatGoalsCount(
                creditGoals.length,
                "кредит",
                "кредита",
                "кредитов"
            );

            depositGoals.forEach((goal) => {
                elements.depositsGrid.appendChild(createGoalCard(goal, !existingGoalIds.has(goal.id)));
            });

            creditGoals.forEach((goal) => {
                elements.creditsGrid.appendChild(createGoalCard(goal, !existingGoalIds.has(goal.id)));
            });
        }

        function formatGoalsCount(count, one, few, many) {
            const remainder10 = count % 10;
            const remainder100 = count % 100;
            let word = many;

            if (remainder100 >= 11 && remainder100 <= 14) {
                word = many;
            } else if (remainder10 === 1) {
                word = one;
            } else if (remainder10 >= 2 && remainder10 <= 4) {
                word = few;
            }

            return `${count} ${word}`;
        }

        /* =========================================================
           9. ВКЛАДЫ
           ========================================================= */
