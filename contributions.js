"use strict";

        function handleContributionSubmit(event) {
            event.preventDefault();

            const goalId = elements.contributionGoal.value;
            const accountId = elements.contributionAccount.value;
            const amount = rublesToMinor(elements.contributionAmount.value);

            if (!getGoalById(goalId)) {
                showFormMessage(
                    elements.contributionMessage,
                    "Выберите существующую финансовую цель.",
                    "error"
                );
                return;
            }

            if (!getAccountById(accountId)) {
                showFormMessage(elements.contributionMessage, "Выберите существующий счет списания.", "error");
                return;
            }

            if (!Number.isFinite(amount) || amount <= 0) {
                const goal = getGoalById(goalId);
                const isCredit =
                    goal && getGoalType(goal) === GOAL_TYPE.CREDIT;

                showFormMessage(
                    elements.contributionMessage,
                    isCredit
                        ? "Сумма платежа должна быть больше нуля."
                        : "Сумма вклада должна быть больше нуля.",
                    "error"
                );
                return;
            }

            const editingId = elements.contributionId.value;
            const availableBalance = getAvailableAccountBalanceForContribution(accountId, editingId);
            if (amount > availableBalance) {
                showFormMessage(
                    elements.contributionMessage,
                    `На выбранном счете доступно ${formatMoney(availableBalance)}.`,
                    "error"
                );
                return;
            }

            const contributionData = {
                goalId,
                accountId,
                date: elements.contributionDate.value,
                amount,
                source: elements.contributionSource.value.trim(),
                comment: elements.contributionComment.value.trim()
            };

            const goal = getGoalById(goalId);
            const isCredit =
                goal && getGoalType(goal) === GOAL_TYPE.CREDIT;

            if (editingId) {
                const index = state.contributions.findIndex(
                    (contribution) => contribution.id === editingId
                );

                if (index !== -1) {
                    state.contributions[index] = {
                        ...state.contributions[index],
                        ...contributionData
                    };
                }

                showToast(isCredit ? "Платёж обновлён." : "Вклад обновлён.");
            } else {
                state.contributions.push({
                    id: createId(),
                    createdAt: new Date().toISOString(),
                    ...contributionData
                });

                showToast(isCredit ? "Платёж добавлен." : "Вклад добавлен.");
            }

            resetContributionForm();
            commitChanges();
        }

        function editContribution(contributionId) {
            const contribution = state.contributions.find(
                (item) => item.id === contributionId
            );

            if (!contribution) {
                return;
            }

            elements.contributionId.value = contribution.id;
            elements.contributionGoal.value = contribution.goalId;
            elements.contributionAccount.value = contribution.accountId;
            elements.contributionDate.value = contribution.date;
            elements.contributionAmount.value = minorToRubles(contribution.amount);
            elements.contributionSource.value = contribution.source || "";
            elements.contributionComment.value = contribution.comment || "";

            elements.contributionFormTitle.textContent =
                "Редактировать вклад";

            elements.cancelContributionEdit.classList.remove("hidden");
            showFormMessage(elements.contributionMessage, "");

            elements.contributionForm.classList.add("is-mobile-open");
            elements.contributionForm.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }

        function deleteContribution(contributionId) {
            const contribution = state.contributions.find(
                (item) => item.id === contributionId
            );

            if (!contribution) {
                return;
            }

            const goal = getGoalById(contribution.goalId);
            const isCredit =
                goal && getGoalType(goal) === GOAL_TYPE.CREDIT;
            const recordLabel = isCredit ? "платёж" : "вклад";

            const confirmed = window.confirm(
                `Удалить ${recordLabel} ${formatMoney(contribution.amount)}` +
                `${goal ? ` в цель «${goal.name}»` : ""}?`
            );

            if (!confirmed) {
                return;
            }

            state.contributions = state.contributions.filter(
                (item) => item.id !== contributionId
            );

            if (elements.contributionId.value === contributionId) {
                resetContributionForm();
            }

            showToast(isCredit ? "Платёж удалён." : "Вклад удалён.");
            commitChanges();
        }

        function resetContributionForm() {
            elements.contributionForm.reset();
            elements.contributionId.value = "";
            elements.contributionDate.value = getToday();
            elements.contributionFormTitle.textContent = "Добавить вклад";
            elements.cancelContributionEdit.classList.add("hidden");
            elements.contributionForm.classList.remove("is-mobile-open");
            showFormMessage(elements.contributionMessage, "");
        }

        /**
         * Обновляет списки финансовых целей в формах и фильтрах.
         */
        function renderGoalSelects() {
            const selectedFormGoal = elements.contributionGoal.value;
            const selectedFilterGoal = elements.contributionGoalFilter.value;

            elements.contributionGoal.innerHTML =
                '<option value="">Выберите цель</option>';

            elements.contributionGoalFilter.innerHTML =
                '<option value="all">Все цели</option>';

            [...state.goals]
                .sort((first, second) =>
                    first.name.localeCompare(second.name, "ru")
                )
                .forEach((goal) => {
                    const typeLabel =
                        getGoalType(goal) === GOAL_TYPE.CREDIT
                            ? "Кредит"
                            : "Вклад";
                    const optionText = `[${typeLabel}] ${goal.name}`;

                    const formOption = document.createElement("option");
                    formOption.value = goal.id;
                    formOption.textContent = optionText;

                    const filterOption = document.createElement("option");
                    filterOption.value = goal.id;
                    filterOption.textContent = optionText;

                    elements.contributionGoal.appendChild(formOption);
                    elements.contributionGoalFilter.appendChild(filterOption);
                });

            if (getGoalById(selectedFormGoal)) {
                elements.contributionGoal.value = selectedFormGoal;
            }

            if (
                selectedFilterGoal === "all" ||
                getGoalById(selectedFilterGoal)
            ) {
                elements.contributionGoalFilter.value = selectedFilterGoal;
            }
        }

        function getFilteredContributions() {
            const search = elements.contributionSearch.value
                .trim()
                .toLowerCase();

            const selectedGoal = elements.contributionGoalFilter.value;
            const selectedMonth = elements.contributionMonthFilter.value;

            return state.contributions
                .map((contribution, index) => ({ record: contribution, index }))
                .filter(({ record: contribution }) => {
                    const goal = getGoalById(contribution.goalId);

                    const searchableText = [
                        goal?.name,
                        contribution.source,
                        contribution.comment
                    ]
                        .join(" ")
                        .toLowerCase();

                    const matchesSearch =
                        !search || searchableText.includes(search);

                    const matchesGoal =
                        selectedGoal === "all" ||
                        contribution.goalId === selectedGoal;

                    const matchesMonth =
                        !selectedMonth ||
                        contribution.date.startsWith(selectedMonth);

                    return matchesSearch && matchesGoal && matchesMonth;
                })
                .sort(compareRecordsNewestFirst)
                .map(({ record }) => record);
        }

        function getContributionsEmptyCopy(hasResults) {
            if (hasResults) {
                return null;
            }

            if (state.contributions.length === 0) {
                return {
                    title: "Вкладов и платежей пока нет.",
                    text: "Сначала создайте финансовую цель, затем добавьте вклад или платёж."
                };
            }

            return {
                title: "По заданным фильтрам ничего не найдено.",
                text: "Измените поиск или сбросьте фильтры."
            };
        }

        function buildMobileContributionCard(contribution) {
            const goal = getGoalById(contribution.goalId);
            const isCredit =
                goal && getGoalType(goal) === GOAL_TYPE.CREDIT;
            const accountName =
                getAccountById(contribution.accountId)?.name || "";
            const source = String(contribution.source || "").trim();
            const comment = String(contribution.comment || "").trim();
            const metaParts = [accountName, source].filter(Boolean);
            const actionLabel = isCredit
                ? "Действия с платежом"
                : "Действия со вкладом";

            const card = document.createElement("article");
            card.className = "mobile-tx-card";
            card.dataset.recordId = contribution.id;

            card.innerHTML = `
                <div class="mobile-tx-card__row">
                    <div class="mobile-tx-card__body">
                        <div class="mobile-tx-card__category">
                            ${escapeHTML(goal?.name || "Удалённая цель")}
                        </div>
                        ${
                            comment
                                ? `<div class="mobile-tx-card__comment">${escapeHTML(comment)}</div>`
                                : ""
                        }
                        ${
                            metaParts.length
                                ? `<div class="mobile-tx-card__meta">${escapeHTML(metaParts.join(" · "))}</div>`
                                : ""
                        }
                    </div>
                    <div class="mobile-tx-card__aside">
                        <div class="mobile-tx-card__amount positive">
                            +${escapeHTML(formatMoney(contribution.amount))}
                        </div>
                        <div class="mobile-action-menu mobile-tx-card__menu">
                            <button
                                class="mobile-action-menu__toggle mobile-tx-card__menu-toggle"
                                type="button"
                                data-action="toggle-mobile-menu"
                                aria-label="${escapeHTML(actionLabel)}"
                                aria-haspopup="true"
                                aria-expanded="false"
                            >
                                ⋯
                            </button>
                            <div class="mobile-action-menu__panel mobile-tx-card__menu-panel hidden" role="menu">
                                <button
                                    class="mobile-action-menu__item mobile-tx-card__menu-item"
                                    type="button"
                                    role="menuitem"
                                    data-action="edit-contribution"
                                    data-id="${escapeHTML(contribution.id)}"
                                >
                                    Редактировать
                                </button>
                                <button
                                    class="mobile-action-menu__item mobile-action-menu__item--danger mobile-tx-card__menu-item mobile-tx-card__menu-item--danger"
                                    type="button"
                                    role="menuitem"
                                    data-action="delete-contribution"
                                    data-id="${escapeHTML(contribution.id)}"
                                >
                                    Удалить
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            return card;
        }

        function renderMobileContributionsFeed(contributions) {
            if (!elements.mobileContributionsList || !elements.mobileContributionsEmpty) {
                return;
            }

            elements.mobileContributionsList.innerHTML = "";

            const emptyCopy = getContributionsEmptyCopy(contributions.length > 0);
            elements.mobileContributionsEmpty.classList.toggle(
                "hidden",
                !emptyCopy
            );

            if (emptyCopy) {
                if (elements.mobileContributionsEmptyTitle) {
                    elements.mobileContributionsEmptyTitle.textContent =
                        emptyCopy.title;
                }

                if (elements.mobileContributionsEmptyText) {
                    elements.mobileContributionsEmptyText.textContent =
                        emptyCopy.text;
                }

                return;
            }

            groupRecordsByDate(contributions).forEach((group) => {
                const section = document.createElement("section");
                section.className = "mobile-tx-group";
                section.setAttribute(
                    "aria-label",
                    formatTransactionDayLabel(group.date)
                );

                const heading = document.createElement("h3");
                heading.className = "mobile-tx-group__title";
                heading.textContent = formatTransactionDayLabel(group.date);
                section.appendChild(heading);

                group.records.forEach((contribution) => {
                    section.appendChild(buildMobileContributionCard(contribution));
                });

                elements.mobileContributionsList.appendChild(section);
            });
        }

        function renderDesktopContributionsTable(contributions) {
            const existingContributionIds = new Set(
                [...elements.contributionsTableBody.querySelectorAll("tr[data-record-id]")]
                    .map((row) => row.dataset.recordId)
            );

            elements.contributionsTableBody.innerHTML = "";

            const emptyCopy = getContributionsEmptyCopy(contributions.length > 0);
            elements.contributionsEmptyState.classList.toggle(
                "hidden",
                !emptyCopy
            );

            if (emptyCopy) {
                const title = document.getElementById("contributionsEmptyTitle");
                const text = document.getElementById("contributionsEmptyText");

                if (title) {
                    title.textContent = emptyCopy.title.replace(/\.$/, "");
                }

                if (text) {
                    text.textContent = emptyCopy.text;
                }
            }

            contributions.forEach((contribution) => {
                const goal = getGoalById(contribution.goalId);
                const row = document.createElement("tr");
                row.dataset.recordId = contribution.id;

                if (!existingContributionIds.has(contribution.id)) {
                    row.classList.add("record-enter");
                }

                row.innerHTML = `
                    <td>${escapeHTML(formatDate(contribution.date))}</td>

                    <td>
                        <strong>
                            ${escapeHTML(goal?.name || "Удалённая цель")}
                        </strong>
                    </td>

                    <td>${escapeHTML(getAccountById(contribution.accountId)?.name || "—")}</td>

                    <td>
                        ${escapeHTML(contribution.source || "—")}
                    </td>

                    <td class="table-comment">
                        ${escapeHTML(contribution.comment || "—")}
                    </td>

                    <td class="amount positive">
                        +${escapeHTML(formatMoney(contribution.amount))}
                    </td>

                    <td>
                        <div class="table-actions">
                            <button
                                class="icon-button"
                                type="button"
                                title="Редактировать"
                                data-action="edit-contribution"
                                data-id="${escapeHTML(contribution.id)}"
                            >
                                ✎
                            </button>

                            <button
                                class="icon-button icon-button--danger"
                                type="button"
                                title="Удалить"
                                data-action="delete-contribution"
                                data-id="${escapeHTML(contribution.id)}"
                            >
                                🗑
                            </button>
                        </div>
                    </td>
                `;

                elements.contributionsTableBody.appendChild(row);
            });
        }

        function renderContributions() {
            const contributions = getFilteredContributions();
            renderDesktopContributionsTable(contributions);
            renderMobileContributionsFeed(contributions);
        }

        function handleMobileContributionsClick(event) {
            const button = event.target.closest("[data-action]");

            if (
                !button ||
                !elements.mobileContributionsList ||
                !elements.mobileContributionsList.contains(button)
            ) {
                return;
            }

            const { action, id } = button.dataset;

            if (action === "toggle-mobile-menu") {
                toggleMobileActionMenu(button);
                return;
            }

            if (action === "edit-contribution") {
                closeMobileActionMenus();
                editContribution(id);
                return;
            }

            if (action === "delete-contribution") {
                closeMobileActionMenus();
                deleteContribution(id);
            }
        }

        /* =========================================================
           10. БЫСТРЫЙ ВКЛАД ИЗ КАРТОЧКИ ЦЕЛИ
           ========================================================= */

        function openQuickContributionModal(goalId) {
            const goal = getGoalById(goalId);

            if (!goal) {
                return;
            }

            const isDeposit = getGoalType(goal) === GOAL_TYPE.DEPOSIT;

            elements.quickContributionForm.reset();
            elements.quickContributionGoalId.value = goal.id;
            elements.quickContributionGoalName.textContent =
                `${isDeposit ? "Вклад" : "Кредит"}: ${goal.name}`;
            elements.quickContributionDate.value = getToday();
            document.getElementById("quickContributionTitle").textContent =
                isDeposit ? "Добавить вклад" : "Добавить платёж";

            elements.quickContributionModal.classList.remove("hidden");
            document.body.style.overflow = "hidden";

            window.setTimeout(() => {
                elements.quickContributionAmount.focus();
            }, 50);
        }

        function closeQuickContributionModal() {
            elements.quickContributionModal.classList.add("hidden");
            document.body.style.overflow = "";
            elements.quickContributionForm.reset();
        }

        function handleQuickContributionSubmit(event) {
            event.preventDefault();

            const goalId = elements.quickContributionGoalId.value;
            const accountId = elements.quickContributionAccount.value;
            const amount = rublesToMinor(elements.quickContributionAmount.value);

            if (!getGoalById(goalId)) {
                showToast("Финансовая цель не найдена.", "error");
                closeQuickContributionModal();
                return;
            }

            if (!getAccountById(accountId)) {
                showToast("Выберите существующий счет списания.", "error");
                return;
            }

            if (!Number.isFinite(amount) || amount <= 0) {
                showToast(
                    getGoalType(getGoalById(goalId)) === GOAL_TYPE.CREDIT
                        ? "Введите сумму платежа больше нуля."
                        : "Введите сумму вклада больше нуля.",
                    "error"
                );
                return;
            }

            const availableBalance = getAvailableAccountBalanceForContribution(accountId);
            if (amount > availableBalance) {
                showToast(`На выбранном счете доступно ${formatMoney(availableBalance)}.`, "error");
                return;
            }

            state.contributions.push({
                id: createId(),
                goalId,
                accountId,
                date: elements.quickContributionDate.value,
                amount,
                source: elements.quickContributionSource.value.trim(),
                comment: elements.quickContributionComment.value.trim(),
                createdAt: new Date().toISOString()
            });

            closeQuickContributionModal();
            showToast(
                getGoalType(getGoalById(goalId)) === GOAL_TYPE.CREDIT
                    ? "Платёж добавлен."
                    : "Вклад добавлен."
            );
            commitChanges();
        }

        /* =========================================================
           11. АНАЛИТИКА ПО КАТЕГОРИЯМ
           ========================================================= */
