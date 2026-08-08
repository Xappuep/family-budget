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

            showFormMessage(elements.transactionMessage, "");

            elements.transactionForm.scrollIntoView({
                behavior: "smooth",
                block: "center"
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
            showFormMessage(elements.transactionMessage, "");
        }

        /**
         * Счёт для Quick Add: последняя операция → default → первый доступный.
         */
        function getPreferredTransactionAccountId() {
            const newestTransaction = sortTransactionsNewestFirst(
                state.transactions
            )[0];

            if (
                newestTransaction &&
                getAccountById(newestTransaction.accountId)
            ) {
                return newestTransaction.accountId;
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
            elements.quickAddSubmit.textContent = isIncome
                ? "Добавить доход"
                : "Добавить расход";
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

            showFormMessage(elements.quickAddMessage, "");
            quickAddSubmitLocked = false;

            if (elements.quickAddSubmit) {
                elements.quickAddSubmit.disabled = false;
            }
        }

        function isQuickAddOpen() {
            return Boolean(
                elements.quickAddModal &&
                !elements.quickAddModal.classList.contains("hidden")
            );
        }

        /**
         * Открывает мобильный Quick Add (bottom sheet).
         */
        function openQuickAddSheet() {
            if (!elements.quickAddModal) {
                return;
            }

            renderAccountSelects();
            resetQuickAddForm();
            elements.quickAddModal.classList.remove("hidden");
            document.body.style.overflow = "hidden";

            window.requestAnimationFrame(() => {
                if (elements.quickAddAmount) {
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

        /**
         * Отрисовывает таблицу доходов и расходов.
         */
        function renderTransactions() {
            const transactions = getFilteredTransactions();
            const existingTransactionIds = new Set(
                [...elements.transactionsTableBody.querySelectorAll("tr[data-record-id]")]
                    .map((row) => row.dataset.recordId)
            );

            elements.transactionsTableBody.innerHTML = "";

            elements.transactionsEmptyState.classList.toggle(
                "hidden",
                transactions.length > 0
            );

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

        /* =========================================================
           8. ФИНАНСОВЫЕ ЦЕЛИ
           ========================================================= */
