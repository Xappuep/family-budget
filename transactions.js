"use strict";

        /** Блокировка повторного submit Quick Add. */
        let quickAddSubmitLocked = false;

        /**
         * Общая валидация полей операции (полная форма и Quick Add).
         */
        function validateTransactionFields({ amountValue, category, accountId }) {
            const amount = rublesToMinor(amountValue);
            const normalizedCategory = String(category || "").trim();

            if (!Number.isFinite(amount) || amount <= 0) {
                return {
                    ok: false,
                    message: "Введите сумму больше нуля."
                };
            }

            if (!normalizedCategory) {
                return {
                    ok: false,
                    message: "Укажите категорию операции."
                };
            }

            if (!getAccountById(accountId)) {
                return {
                    ok: false,
                    message: "Выберите существующий счет."
                };
            }

            return {
                ok: true,
                amount,
                category: normalizedCategory,
                accountId
            };
        }

        /**
         * Собирает данные операции из уже провалидированных полей.
         */
        function buildTransactionPayload({
            date,
            type,
            amount,
            accountId,
            category,
            member = "",
            comment = ""
        }) {
            return {
                date,
                type,
                amount,
                accountId,
                category,
                member: String(member || "").trim(),
                comment: String(comment || "").trim()
            };
        }

        /**
         * Создаёт новую операцию с id и createdAt (без мутации state).
         */
        function createTransactionRecord(payload) {
            return {
                id: createId(),
                createdAt: new Date().toISOString(),
                ...payload
            };
        }

        /**
         * Добавляет новую операцию в state и сохраняет изменения.
         */
        function addTransaction(payload) {
            state.transactions.push(createTransactionRecord(payload));
            showToast("Операция добавлена.");
            commitChanges();
        }

        /**
         * Обновляет существующую операцию без изменения createdAt.
         */
        function updateTransaction(editingId, payload) {
            const index = state.transactions.findIndex(
                (transaction) => transaction.id === editingId
            );

            if (index !== -1) {
                state.transactions[index] = {
                    ...state.transactions[index],
                    ...payload
                };
            }

            showToast("Операция обновлена.");
            commitChanges();
        }

        function handleTransactionSubmit(event) {
            event.preventDefault();

            const validated = validateTransactionFields({
                amountValue: elements.transactionAmount.value,
                category: elements.transactionCategory.value,
                accountId: elements.transactionAccount.value
            });

            if (!validated.ok) {
                showFormMessage(
                    elements.transactionMessage,
                    validated.message,
                    "error"
                );
                return;
            }

            const payload = buildTransactionPayload({
                date: elements.transactionDate.value,
                type: elements.transactionType.value,
                amount: validated.amount,
                accountId: validated.accountId,
                category: validated.category,
                member: elements.transactionMember.value,
                comment: elements.transactionComment.value
            });

            const editingId = elements.transactionId.value;

            if (editingId) {
                updateTransaction(editingId, payload);
            } else {
                addTransaction(payload);
            }

            resetTransactionForm();
        }

        /**
         * Заполняет форму данными выбранной операции.
         */
        function editTransaction(transactionId) {
            const transaction = state.transactions.find(
                (item) => item.id === transactionId
            );

            if (!transaction) {
                return;
            }

            closeMobileTransactionMenus();

            elements.transactionId.value = transaction.id;
            elements.transactionDate.value = transaction.date;
            elements.transactionType.value = transaction.type;
            elements.transactionAmount.value = minorToRubles(transaction.amount);
            elements.transactionAccount.value = transaction.accountId;
            elements.transactionCategory.value = transaction.category;
            elements.transactionMember.value = transaction.member || "";
            elements.transactionComment.value = transaction.comment || "";

            elements.transactionFormTitle.textContent =
                "Редактировать операцию";

            elements.cancelTransactionEdit.classList.remove("hidden");
            elements.transactionForm.classList.add("is-editing");

            showFormMessage(elements.transactionMessage, "");

            elements.transactionForm.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }

        /**
         * Удаляет операцию после подтверждения.
         */
        function deleteTransaction(transactionId) {
            const transaction = state.transactions.find(
                (item) => item.id === transactionId
            );

            if (!transaction) {
                return;
            }

            const confirmed = window.confirm(
                `Удалить операцию «${transaction.category}» на сумму ` +
                `${formatMoney(transaction.amount)}?`
            );

            if (!confirmed) {
                return;
            }

            state.transactions = state.transactions.filter(
                (item) => item.id !== transactionId
            );

            if (elements.transactionId.value === transactionId) {
                resetTransactionForm();
            }

            showToast("Операция удалена.");
            commitChanges();
        }

        /**
         * Возвращает форму добавления операции в исходное состояние.
         */
        function resetTransactionForm() {
            elements.transactionForm.reset();
            elements.transactionId.value = "";
            elements.transactionDate.value = getToday();
            elements.transactionType.value = "expense";
            elements.transactionFormTitle.textContent = "Добавить операцию";
            elements.cancelTransactionEdit.classList.add("hidden");
            elements.transactionForm.classList.remove("is-editing");
            showFormMessage(elements.transactionMessage, "");
        }

        /**
         * Счёт для Quick Add: последний по createdAt (не по финансовой дате)
         * → default → первый доступный.
         */
        function getPreferredTransactionAccountId() {
            const lastUsedAccountId = getLastUsedTransactionAccountId(
                state.transactions,
                (accountId) => Boolean(getAccountById(accountId))
            );

            if (lastUsedAccountId) {
                return lastUsedAccountId;
            }

            if (getAccountById(DEFAULT_ACCOUNT_ID)) {
                return DEFAULT_ACCOUNT_ID;
            }

            return state.accounts[0]?.id || "";
        }

        function updateQuickAddSubmitLabel() {
            if (!elements.quickAddSubmit) {
                return;
            }

            const isIncome = elements.quickAddType.value === "income";
            const confirmMode =
                typeof isVoiceDraftActive === "function" && isVoiceDraftActive();

            if (confirmMode) {
                elements.quickAddSubmit.textContent = isIncome
                    ? "Подтвердить доход"
                    : "Подтвердить расход";
                return;
            }

            elements.quickAddSubmit.textContent = isIncome
                ? "Добавить доход"
                : "Добавить расход";
        }

        /**
         * Явные кнопки категорий вместо datalist (на Android datalist
         * уходит в подсказки клавиатуры и не даёт нормальный список).
         * Не зависит от userAgent / touch / DevTools — только от DOM.
         */
        function renderQuickAddCategories() {
            const container =
                elements.quickAddCategories ||
                document.getElementById("quickAddCategories");

            if (!container) {
                return;
            }

            if (!elements.quickAddCategories) {
                elements.quickAddCategories = container;
            }

            if (typeof QUICK_ADD_CATEGORIES === "undefined") {
                return;
            }

            const type =
                elements.quickAddType?.value === "income" ? "income" : "expense";
            const categories =
                QUICK_ADD_CATEGORIES[type] || QUICK_ADD_CATEGORIES.expense || [];
            const selected = String(elements.quickAddCategory?.value || "").trim();

            container.innerHTML = "";

            categories.forEach((category) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "quick-add-category";
                button.setAttribute("role", "option");
                button.dataset.category = category;
                button.textContent = category;

                const isSelected =
                    selected.localeCompare(category, "ru", {
                        sensitivity: "accent"
                    }) === 0;

                button.classList.toggle("quick-add-category--selected", isSelected);
                button.setAttribute(
                    "aria-selected",
                    isSelected ? "true" : "false"
                );

                container.appendChild(button);
            });
        }

        function syncQuickAddCategorySelection() {
            if (!elements.quickAddCategories) {
                return;
            }

            const selected = String(elements.quickAddCategory?.value || "").trim();

            elements.quickAddCategories
                .querySelectorAll(".quick-add-category")
                .forEach((button) => {
                    const isSelected =
                        selected.localeCompare(button.dataset.category || "", "ru", {
                            sensitivity: "accent"
                        }) === 0;

                    button.classList.toggle(
                        "quick-add-category--selected",
                        isSelected
                    );
                    button.setAttribute(
                        "aria-selected",
                        isSelected ? "true" : "false"
                    );
                });
        }

        function selectQuickAddCategory(category) {
            if (!elements.quickAddCategory) {
                return;
            }

            elements.quickAddCategory.value = category;
            syncQuickAddCategorySelection();
            showFormMessage(elements.quickAddMessage, "");

            if (elements.quickAddCategoriesDisclosure) {
                elements.quickAddCategoriesDisclosure.open = false;
            }

            if (typeof evaluateVoiceHabitPrompt === "function") {
                evaluateVoiceHabitPrompt();
            }
        }

        function handleQuickAddCategoriesClick(event) {
            const button = event.target.closest(".quick-add-category");

            if (
                !button ||
                !elements.quickAddCategories ||
                !elements.quickAddCategories.contains(button)
            ) {
                return;
            }

            selectQuickAddCategory(button.dataset.category || "");
        }

        function setQuickAddType(type) {
            const nextType = type === "income" ? "income" : "expense";
            elements.quickAddType.value = nextType;

            if (elements.quickAddTypeToggle) {
                elements.quickAddTypeToggle
                    .querySelectorAll("[data-quick-type]")
                    .forEach((button) => {
                        const isActive = button.dataset.quickType === nextType;
                        button.classList.toggle(
                            "quick-add-type__button--active",
                            isActive
                        );
                        button.setAttribute(
                            "aria-pressed",
                            isActive ? "true" : "false"
                        );
                    });
            }

            updateQuickAddSubmitLabel();
            renderQuickAddCategories();
        }

        function resetQuickAddForm() {
            if (!elements.quickAddForm) {
                return;
            }

            elements.quickAddForm.reset();
            setQuickAddType("expense");
            elements.quickAddAmount.value = "";
            elements.quickAddCategory.value = "";
            elements.quickAddMember.value = "";
            elements.quickAddComment.value = "";
            elements.quickAddDate.value = getToday();
            elements.quickAddAccount.value = getPreferredTransactionAccountId();

            if (elements.quickAddExtra) {
                elements.quickAddExtra.open = false;
            }

            if (elements.quickAddCategoriesDisclosure) {
                elements.quickAddCategoriesDisclosure.open = false;
            }

            showFormMessage(elements.quickAddMessage, "");
            quickAddSubmitLocked = false;

            if (elements.quickAddSubmit) {
                elements.quickAddSubmit.disabled = false;
            }

            if (typeof clearVoiceUi === "function") {
                clearVoiceUi({ keepUnsupported: true });
            }

            renderQuickAddCategories();
        }

        function isQuickAddOpen() {
            return Boolean(
                elements.quickAddModal &&
                !elements.quickAddModal.classList.contains("hidden")
            );
        }

        /**
         * Открывает мобильный Quick Add (bottom sheet).
         * @param {{ focusAmount?: boolean }} [options]
         */
        function openQuickAddSheet(options = {}) {
            const { focusAmount = false } = options;

            if (!elements.quickAddModal) {
                return;
            }

            renderAccountSelects();
            resetQuickAddForm();
            elements.quickAddModal.classList.remove("hidden");
            document.body.style.overflow = "hidden";

            const sheetDialog = elements.quickAddModal.querySelector(
                ".quick-add-sheet__dialog"
            );

            if (sheetDialog) {
                sheetDialog.scrollTop = 0;
            }

            // Fail-safe: контейнер уже в DOM; гарантируем кнопки после открытия sheet.
            renderQuickAddCategories();

            window.requestAnimationFrame(() => {
                renderQuickAddCategories();

                if (focusAmount && elements.quickAddAmount) {
                    elements.quickAddAmount.focus();
                }
            });
        }

        /**
         * Закрывает Quick Add без создания операции.
         */
        function closeQuickAddSheet(options = {}) {
            const { restoreFocus = true } = options;

            if (!elements.quickAddModal) {
                return;
            }

            if (typeof abortVoiceRecognition === "function") {
                abortVoiceRecognition();
            }

            elements.quickAddModal.classList.add("hidden");
            document.body.style.overflow = "";
            resetQuickAddForm();

            if (
                restoreFocus &&
                elements.mobileNav
            ) {
                const addButton = elements.mobileNav.querySelector(
                    '[data-mobile-tab="add"]'
                );

                if (addButton) {
                    addButton.focus();
                }
            }
        }

        function handleQuickAddTypeClick(event) {
            const button = event.target.closest("[data-quick-type]");

            if (
                !button ||
                !elements.quickAddTypeToggle ||
                !elements.quickAddTypeToggle.contains(button)
            ) {
                return;
            }

            setQuickAddType(button.dataset.quickType);
        }

        function handleQuickAddSubmit(event) {
            event.preventDefault();

            if (quickAddSubmitLocked) {
                return;
            }

            quickAddSubmitLocked = true;

            if (elements.quickAddSubmit) {
                elements.quickAddSubmit.disabled = true;
            }

            const validated = validateTransactionFields({
                amountValue: elements.quickAddAmount.value,
                category: elements.quickAddCategory.value,
                accountId: elements.quickAddAccount.value
            });

            if (!validated.ok) {
                showFormMessage(
                    elements.quickAddMessage,
                    validated.message,
                    "error"
                );
                quickAddSubmitLocked = false;

                if (elements.quickAddSubmit) {
                    elements.quickAddSubmit.disabled = false;
                }

                return;
            }

            const payload = buildTransactionPayload({
                date: elements.quickAddDate.value || getToday(),
                type: elements.quickAddType.value === "income"
                    ? "income"
                    : "expense",
                amount: validated.amount,
                accountId: validated.accountId,
                category: validated.category,
                member: elements.quickAddMember.value,
                comment: elements.quickAddComment.value
            });

            addTransaction(payload);

            if (typeof commitPendingVoiceHabit === "function") {
                commitPendingVoiceHabit();
            }

            closeQuickAddSheet();
        }

        /**
         * Применяет фильтры к списку операций.
         */
        function getFilteredTransactions() {
            const search = elements.transactionSearch.value
                .trim()
                .toLowerCase();

            const type = elements.transactionTypeFilter.value;
            const month = elements.transactionMonthFilter.value;

            return state.transactions
                .map((transaction, index) => ({ transaction, index }))
                .filter(({ transaction }) => {
                    const searchableText = [
                        getAccountById(transaction.accountId)?.name,
                        transaction.category,
                        transaction.member,
                        transaction.comment
                    ]
                        .join(" ")
                        .toLowerCase();

                    const matchesSearch =
                        !search || searchableText.includes(search);

                    const matchesType =
                        type === "all" || transaction.type === type;

                    const matchesMonth =
                        !month || transaction.date.startsWith(month);

                    return matchesSearch && matchesType && matchesMonth;
                })
                .sort(compareTransactionsNewestFirst)
                .map(({ transaction }) => transaction);
        }

        function getTransactionsEmptyCopy(hasResults) {
            if (hasResults) {
                return null;
            }

            if (state.transactions.length === 0) {
                return {
                    title: "Операций пока нет.",
                    text: "Добавьте доход или расход через кнопку +."
                };
            }

            return {
                title: "По заданным фильтрам операций нет.",
                text: "Измените поиск или сбросьте фильтры."
            };
        }

        function closeMobileTransactionMenus(exceptPanel = null) {
            closeMobileActionMenus(
                elements.mobileTransactionsList || document,
                exceptPanel
            );
        }

        function buildMobileTransactionCard(transaction) {
            const isIncome = transaction.type === "income";
            const amountPrefix = isIncome ? "+" : "−";
            const accountName =
                getAccountById(transaction.accountId)?.name || "";
            const member = String(transaction.member || "").trim();
            const comment = String(transaction.comment || "").trim();
            const metaParts = [accountName, member].filter(Boolean);

            const card = document.createElement("article");
            card.className = "mobile-tx-card";
            card.dataset.recordId = transaction.id;

            card.innerHTML = `
                <div class="mobile-tx-card__row">
                    <div class="mobile-tx-card__body">
                        <div class="mobile-tx-card__category">
                            ${escapeHTML(transaction.category || "Без категории")}
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
                        <div class="mobile-tx-card__amount ${
                            isIncome ? "positive" : "negative"
                        }">
                            ${amountPrefix}${escapeHTML(formatMoney(transaction.amount))}
                        </div>
                        <div class="mobile-tx-card__menu mobile-action-menu">
                            <button
                                class="mobile-tx-card__menu-toggle mobile-action-menu__toggle"
                                type="button"
                                data-action="toggle-tx-menu"
                                aria-label="Действия с операцией"
                                aria-haspopup="true"
                                aria-expanded="false"
                            >
                                ⋯
                            </button>
                            <div class="mobile-tx-card__menu-panel mobile-action-menu__panel hidden" role="menu">
                                <button
                                    class="mobile-tx-card__menu-item mobile-action-menu__item"
                                    type="button"
                                    role="menuitem"
                                    data-action="edit-transaction"
                                    data-id="${escapeHTML(transaction.id)}"
                                >
                                    Редактировать
                                </button>
                                <button
                                    class="mobile-tx-card__menu-item mobile-tx-card__menu-item--danger mobile-action-menu__item mobile-action-menu__item--danger"
                                    type="button"
                                    role="menuitem"
                                    data-action="delete-transaction"
                                    data-id="${escapeHTML(transaction.id)}"
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

        /**
         * Мобильная лента операций (те же отфильтрованные данные, что и таблица).
         */
        function renderMobileTransactions(transactions) {
            if (!elements.mobileTransactionsList || !elements.mobileTransactionsEmpty) {
                return;
            }

            elements.mobileTransactionsList.innerHTML = "";

            const emptyCopy = getTransactionsEmptyCopy(transactions.length > 0);
            elements.mobileTransactionsEmpty.classList.toggle(
                "hidden",
                !emptyCopy
            );

            if (emptyCopy) {
                if (elements.mobileTransactionsEmptyTitle) {
                    elements.mobileTransactionsEmptyTitle.textContent =
                        emptyCopy.title;
                }

                if (elements.mobileTransactionsEmptyText) {
                    elements.mobileTransactionsEmptyText.textContent =
                        emptyCopy.text;
                }

                return;
            }

            groupTransactionsByDate(transactions).forEach((group) => {
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

                group.transactions.forEach((transaction) => {
                    section.appendChild(buildMobileTransactionCard(transaction));
                });

                elements.mobileTransactionsList.appendChild(section);
            });
        }

        function renderDesktopTransactionsTable(transactions) {
            const existingTransactionIds = new Set(
                [...elements.transactionsTableBody.querySelectorAll("tr[data-record-id]")]
                    .map((row) => row.dataset.recordId)
            );

            elements.transactionsTableBody.innerHTML = "";

            const emptyCopy = getTransactionsEmptyCopy(transactions.length > 0);
            elements.transactionsEmptyState.classList.toggle(
                "hidden",
                !emptyCopy
            );

            if (emptyCopy) {
                const title = document.getElementById("transactionsEmptyTitle");
                const text = document.getElementById("transactionsEmptyText");

                if (title) {
                    title.textContent = emptyCopy.title.replace(/\.$/, "");
                }

                if (text) {
                    text.textContent = emptyCopy.text;
                }
            }

            transactions.forEach((transaction) => {
                const row = document.createElement("tr");
                row.dataset.recordId = transaction.id;

                if (!existingTransactionIds.has(transaction.id)) {
                    row.classList.add("record-enter");
                }

                const isIncome = transaction.type === "income";
                const amountPrefix = isIncome ? "+" : "−";

                row.innerHTML = `
                    <td>${escapeHTML(formatDate(transaction.date))}</td>

                    <td>
                        <span class="badge ${
                            isIncome ? "badge--income" : "badge--expense"
                        }">
                            ${isIncome ? "Доход" : "Расход"}
                        </span>
                    </td>

                    <td>${escapeHTML(getAccountById(transaction.accountId)?.name || "—")}</td>

                    <td>
                        <strong>${escapeHTML(transaction.category)}</strong>
                    </td>

                    <td>
                        ${escapeHTML(transaction.member || "—")}
                    </td>

                    <td class="table-comment">
                        ${escapeHTML(transaction.comment || "—")}
                    </td>

                    <td class="amount ${
                        isIncome ? "positive" : "negative"
                    }">
                        ${amountPrefix}${escapeHTML(formatMoney(transaction.amount))}
                    </td>

                    <td>
                        <div class="table-actions">
                            <button
                                class="icon-button"
                                type="button"
                                title="Редактировать"
                                data-action="edit-transaction"
                                data-id="${escapeHTML(transaction.id)}"
                            >
                                ✎
                            </button>

                            <button
                                class="icon-button icon-button--danger"
                                type="button"
                                title="Удалить"
                                data-action="delete-transaction"
                                data-id="${escapeHTML(transaction.id)}"
                            >
                                🗑
                            </button>
                        </div>
                    </td>
                `;

                elements.transactionsTableBody.appendChild(row);
            });
        }

        /**
         * Отрисовывает desktop-таблицу и mobile feed из одного списка.
         */
        function renderTransactions() {
            const transactions = getFilteredTransactions();
            renderDesktopTransactionsTable(transactions);
            renderMobileTransactions(transactions);
        }

        function handleMobileTransactionsClick(event) {
            const button = event.target.closest("[data-action]");

            if (
                !button ||
                !elements.mobileTransactionsList ||
                !elements.mobileTransactionsList.contains(button)
            ) {
                return;
            }

            const { action, id } = button.dataset;

            if (action === "toggle-tx-menu") {
                toggleMobileActionMenu(button);
                return;
            }

            if (action === "edit-transaction") {
                editTransaction(id);
                return;
            }

            if (action === "delete-transaction") {
                deleteTransaction(id);
            }
        }

        /* =========================================================
           8. ФИНАНСОВЫЕ ЦЕЛИ
           ========================================================= */
