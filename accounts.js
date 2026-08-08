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

function renderAccountsAndTransfers() {
    renderAccountSelects();
    elements.accountsGrid.innerHTML = "";
    state.accounts.forEach((account) => {
        const card = document.createElement("article");
        card.className = "card account-card";
        card.innerHTML = `<div><span>${escapeHTML(account.name)}</span><strong>${escapeHTML(formatMoney(getAccountBalance(account.id)))}</strong></div><button class="icon-button icon-button--danger" type="button" data-delete-account="${escapeHTML(account.id)}" aria-label="Удалить счёт">×</button>`;
        elements.accountsGrid.appendChild(card);
    });

    elements.transfersTableBody.innerHTML = "";
    elements.transfersEmptyState.classList.toggle("hidden", state.transfers.length > 0);
    [...state.transfers].sort((a, b) => b.date.localeCompare(a.date)).forEach((transfer) => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${escapeHTML(formatDate(transfer.date))}</td><td>${escapeHTML(getAccountById(transfer.fromAccountId)?.name || "—")}</td><td>${escapeHTML(getAccountById(transfer.toAccountId)?.name || "—")}</td><td class="amount">${escapeHTML(formatMoney(transfer.amount))}</td><td>${escapeHTML(transfer.comment || "—")}</td><td><button class="icon-button icon-button--danger" type="button" data-delete-transfer="${escapeHTML(transfer.id)}" aria-label="Удалить перевод">×</button></td>`;
        elements.transfersTableBody.appendChild(row);
    });
}
