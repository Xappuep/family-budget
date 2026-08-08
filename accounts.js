"use strict";

function renderAccountSelects() {
    if (!elements.transferDate.value) elements.transferDate.value = getToday();
    const selectedTransaction = elements.transactionAccount.value;
    const selectedContributionAccount = elements.contributionAccount.value;
    const selectedQuickAccount = elements.quickContributionAccount.value;
    const selectedQuickAddAccount = elements.quickAddAccount?.value;
    const selectedFrom = elements.transferFrom.value;
    const selectedTo = elements.transferTo.value;

    [elements.transactionAccount, elements.transferFrom, elements.transferTo].forEach((select) => {
        select.innerHTML = "";
        state.accounts.forEach((account) => {
            const option = document.createElement("option");
            option.value = account.id;
            option.textContent = account.name;
            select.appendChild(option);
        });
    });
    elements.transactionAccount.value = getAccountById(selectedTransaction)
        ? selectedTransaction
        : state.accounts[0]?.id || "";

    [elements.contributionAccount, elements.quickContributionAccount].forEach((select) => {
        select.innerHTML = "";
        state.accounts.forEach((account) => {
            const option = document.createElement("option");
            option.value = account.id;
            option.textContent = `${account.name} · ${formatMoney(getAccountBalance(account.id))}`;
            select.appendChild(option);
        });
    });
    elements.contributionAccount.value = getAccountById(selectedContributionAccount)
        ? selectedContributionAccount
        : state.accounts[0]?.id || "";
    elements.quickContributionAccount.value = getAccountById(selectedQuickAccount)
        ? selectedQuickAccount
        : state.accounts[0]?.id || "";

    if (elements.quickAddAccount) {
        elements.quickAddAccount.innerHTML = "";
        state.accounts.forEach((account) => {
            const option = document.createElement("option");
            option.value = account.id;
            option.textContent = account.name;
            elements.quickAddAccount.appendChild(option);
        });
        const preferredQuickAdd =
            getAccountById(selectedQuickAddAccount)
                ? selectedQuickAddAccount
                : getPreferredTransactionAccountId();
        elements.quickAddAccount.value = preferredQuickAdd;
    }

    elements.transferFrom.value = getAccountById(selectedFrom)
        ? selectedFrom
        : state.accounts[0]?.id || "";
    elements.transferTo.value = getAccountById(selectedTo)
        ? selectedTo
        : state.accounts[1]?.id || state.accounts[0]?.id || "";
    elements.transferForm.querySelector('button[type="submit"]').disabled = state.accounts.length < 2;
    updateMobileTransferButtonState();
}

function updateMobileTransferButtonState() {
    if (!elements.openMobileTransferForm) {
        return;
    }

    elements.openMobileTransferForm.disabled = state.accounts.length < 2;
}

function openMobileAccountForm() {
    elements.accountForm.reset();
    elements.accountOpeningBalance.value = "0";
    showFormMessage(elements.accountMessage, "");
    elements.accountForm.classList.add("is-mobile-open");
    elements.transferForm.classList.remove("is-mobile-open");
    elements.accountForm.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    window.setTimeout(() => {
        elements.accountName.focus();
    }, 50);
}

function closeMobileAccountForm() {
    elements.accountForm.classList.remove("is-mobile-open");
}

function openMobileTransferForm() {
    if (state.accounts.length < 2) {
        showToast("Для перевода нужно минимум два счёта.", "error");
        return;
    }

    elements.transferForm.reset();
    elements.transferDate.value = getToday();
    renderAccountSelects();
    showFormMessage(elements.transferMessage, "");
    elements.transferForm.classList.add("is-mobile-open");
    elements.accountForm.classList.remove("is-mobile-open");
    elements.transferForm.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    window.setTimeout(() => {
        elements.transferAmount.focus();
    }, 50);
}

function closeMobileTransferForm() {
    elements.transferForm.classList.remove("is-mobile-open");
}

function handleAccountSubmit(event) {
    event.preventDefault();
    const name = elements.accountName.value.trim();
    const openingBalance = rublesToMinor(elements.accountOpeningBalance.value);
    if (!name || !Number.isFinite(openingBalance)) {
        showFormMessage(elements.accountMessage, "Проверьте название и начальный остаток.", "error");
        return;
    }
    state.accounts.push({ id: createId(), name, openingBalance, createdAt: new Date().toISOString() });
    elements.accountForm.reset();
    elements.accountOpeningBalance.value = "0";
    closeMobileAccountForm();
    showFormMessage(elements.accountMessage, "");
    commitChanges();
    showToast("Счёт добавлен.");
}

function handleTransferSubmit(event) {
    event.preventDefault();
    const fromAccountId = elements.transferFrom.value;
    const toAccountId = elements.transferTo.value;
    const amount = rublesToMinor(elements.transferAmount.value);
    if (fromAccountId === toAccountId) {
        showFormMessage(elements.transferMessage, "Выберите разные счета.", "error");
        return;
    }
    if (!getAccountById(fromAccountId) || !getAccountById(toAccountId) || !Number.isFinite(amount) || amount <= 0) {
        showFormMessage(elements.transferMessage, "Проверьте счета и сумму перевода.", "error");
        return;
    }
    state.transfers.push({
        id: createId(),
        date: elements.transferDate.value,
        fromAccountId,
        toAccountId,
        amount,
        comment: elements.transferComment.value.trim(),
        createdAt: new Date().toISOString()
    });
    elements.transferForm.reset();
    elements.transferDate.value = getToday();
    closeMobileTransferForm();
    showFormMessage(elements.transferMessage, "");
    commitChanges();
    showToast("Перевод выполнен.");
}

function deleteAccount(accountId) {
    const used = state.transactions.some((item) => item.accountId === accountId)
        || state.transfers.some((item) => item.fromAccountId === accountId || item.toAccountId === accountId)
        || state.contributions.some((item) => item.accountId === accountId);
    if (used) {
        showToast("Счёт используется в операциях или переводах.", "error");
        return;
    }
    if (state.accounts.length === 1) {
        showToast("Нельзя удалить единственный счёт.", "error");
        return;
    }
    if (!window.confirm("Удалить счёт?")) return;
    state.accounts = state.accounts.filter((account) => account.id !== accountId);
    commitChanges();
}

function deleteTransfer(transferId) {
    if (!window.confirm("Удалить перевод?")) return;
    state.transfers = state.transfers.filter((transfer) => transfer.id !== transferId);
    commitChanges();
}

function getTransfersEmptyCopy(hasResults) {
    if (hasResults) {
        return null;
    }

    return {
        title: "Переводов пока нет.",
        text: "Переведите деньги между счетами."
    };
}

function buildMobileTransferCard(transfer) {
    const fromName = getAccountById(transfer.fromAccountId)?.name || "—";
    const toName = getAccountById(transfer.toAccountId)?.name || "—";
    const comment = String(transfer.comment || "").trim();

    const card = document.createElement("article");
    card.className = "mobile-tx-card";
    card.dataset.recordId = transfer.id;

    card.innerHTML = `
        <div class="mobile-tx-card__row">
            <div class="mobile-tx-card__body">
                <div class="mobile-tx-card__category">
                    ${escapeHTML(fromName)} → ${escapeHTML(toName)}
                </div>
                ${
                    comment
                        ? `<div class="mobile-tx-card__comment">${escapeHTML(comment)}</div>`
                        : ""
                }
            </div>
            <div class="mobile-tx-card__aside">
                <div class="mobile-tx-card__amount">
                    ${escapeHTML(formatMoney(transfer.amount))}
                </div>
                <div class="mobile-action-menu mobile-tx-card__menu">
                    <button
                        class="mobile-action-menu__toggle mobile-tx-card__menu-toggle"
                        type="button"
                        data-action="toggle-mobile-menu"
                        aria-label="Действия с переводом"
                        aria-haspopup="true"
                        aria-expanded="false"
                    >
                        ⋯
                    </button>
                    <div class="mobile-action-menu__panel mobile-tx-card__menu-panel hidden" role="menu">
                        <button
                            class="mobile-action-menu__item mobile-action-menu__item--danger mobile-tx-card__menu-item mobile-tx-card__menu-item--danger"
                            type="button"
                            role="menuitem"
                            data-action="delete-transfer"
                            data-id="${escapeHTML(transfer.id)}"
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

function renderMobileTransfersFeed(transfers) {
    if (!elements.mobileTransfersList || !elements.mobileTransfersEmpty) {
        return;
    }

    elements.mobileTransfersList.innerHTML = "";

    const emptyCopy = getTransfersEmptyCopy(transfers.length > 0);
    elements.mobileTransfersEmpty.classList.toggle("hidden", !emptyCopy);

    if (emptyCopy) {
        if (elements.mobileTransfersEmptyTitle) {
            elements.mobileTransfersEmptyTitle.textContent = emptyCopy.title;
        }

        if (elements.mobileTransfersEmptyText) {
            elements.mobileTransfersEmptyText.textContent = emptyCopy.text;
        }

        return;
    }

    groupRecordsByDate(transfers).forEach((group) => {
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

        group.records.forEach((transfer) => {
            section.appendChild(buildMobileTransferCard(transfer));
        });

        elements.mobileTransfersList.appendChild(section);
    });
}

function handleMobileTransfersClick(event) {
    const button = event.target.closest("[data-action]");

    if (
        !button ||
        !elements.mobileTransfersList ||
        !elements.mobileTransfersList.contains(button)
    ) {
        return;
    }

    const { action, id } = button.dataset;

    if (action === "toggle-mobile-menu") {
        const panel = button
            .closest(".mobile-action-menu, .mobile-tx-card__menu")
            ?.querySelector(".mobile-action-menu__panel, .mobile-tx-card__menu-panel");

        if (!panel) {
            return;
        }

        const willOpen = panel.classList.contains("hidden");
        closeMobileActionMenus(null, willOpen ? panel : null);
        panel.classList.toggle("hidden", !willOpen);
        button.setAttribute("aria-expanded", willOpen ? "true" : "false");
        return;
    }

    if (action === "delete-transfer") {
        closeMobileActionMenus();
        deleteTransfer(id);
    }
}

function renderAccountsAndTransfers() {
    renderAccountSelects();
    elements.accountsGrid.innerHTML = "";
    state.accounts.forEach((account) => {
        const card = document.createElement("article");
        card.className = "card account-card";
        card.innerHTML = `
            <div>
                <span>${escapeHTML(account.name)}</span>
                <strong>${escapeHTML(formatMoney(getAccountBalance(account.id)))}</strong>
            </div>
            <button
                class="icon-button icon-button--danger account-card__delete-desktop"
                type="button"
                data-delete-account="${escapeHTML(account.id)}"
                aria-label="Удалить счёт"
            >×</button>
            <div class="mobile-action-menu account-card__menu mobile-only">
                <button
                    class="mobile-action-menu__toggle"
                    type="button"
                    data-action="toggle-mobile-menu"
                    aria-label="Действия со счётом"
                    aria-haspopup="true"
                    aria-expanded="false"
                >
                    ⋯
                </button>
                <div class="mobile-action-menu__panel hidden" role="menu">
                    <button
                        class="mobile-action-menu__item mobile-action-menu__item--danger"
                        type="button"
                        role="menuitem"
                        data-delete-account="${escapeHTML(account.id)}"
                    >
                        Удалить
                    </button>
                </div>
            </div>
        `;
        elements.accountsGrid.appendChild(card);
    });

    const transfers = sortTransfersNewestFirst(state.transfers);

    elements.transfersTableBody.innerHTML = "";
    elements.transfersEmptyState.classList.toggle("hidden", transfers.length > 0);
    transfers.forEach((transfer) => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${escapeHTML(formatDate(transfer.date))}</td><td>${escapeHTML(getAccountById(transfer.fromAccountId)?.name || "—")}</td><td>${escapeHTML(getAccountById(transfer.toAccountId)?.name || "—")}</td><td class="amount">${escapeHTML(formatMoney(transfer.amount))}</td><td>${escapeHTML(transfer.comment || "—")}</td><td><button class="icon-button icon-button--danger" type="button" data-delete-transfer="${escapeHTML(transfer.id)}" aria-label="Удалить перевод">×</button></td>`;
        elements.transfersTableBody.appendChild(row);
    });

    renderMobileTransfersFeed(transfers);
}
