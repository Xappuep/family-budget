"use strict";

        function handleTransactionSubmit(event) {
            event.preventDefault();

            const amount = rublesToMinor(elements.transactionAmount.value);
            const category = elements.transactionCategory.value.trim();

            if (!Number.isFinite(amount) || amount <= 0) {
                showFormMessage(
                    elements.transactionMessage,
                    "Введите сумму больше нуля.",
                    "error"
                );
                return;
            }

            if (!category) {
                showFormMessage(
                    elements.transactionMessage,
                    "Укажите категорию операции.",
                    "error"
                );
                return;
            }

            if (!getAccountById(elements.transactionAccount.value)) {
                showFormMessage(elements.transactionMessage, "Выберите существующий счет.", "error");
                return;
            }

            const transactionData = {
                date: elements.transactionDate.value,
                type: elements.transactionType.value,
                amount,
                accountId: elements.transactionAccount.value,
                category,
                member: elements.transactionMember.value.trim(),
                comment: elements.transactionComment.value.trim()
            };

            const editingId = elements.transactionId.value;

            if (editingId) {
                const index = state.transactions.findIndex(
                    (transaction) => transaction.id === editingId
                );

                if (index !== -1) {
                    state.transactions[index] = {
                        ...state.transactions[index],
                        ...transactionData
                    };
                }

                showToast("Операция обновлена.");
            } else {
                state.transactions.push({
                    id: createId(),
                    createdAt: new Date().toISOString(),
                    ...transactionData
                });

                showToast("Операция добавлена.");
            }

            resetTransactionForm();
            commitChanges();
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
