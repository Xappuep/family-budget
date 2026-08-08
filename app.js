"use strict";

        function resetAllForms() {
            resetTransactionForm();
            resetGoalForm();
            resetContributionForm();
            closeQuickContributionModal();
        }

        /* =========================================================
           13. ОБЩАЯ ОТРИСОВКА
           ========================================================= */

        function renderAll() {
            renderAccountsAndTransfers();
            renderSummary();
            renderGoalSelects();
            renderTransactions();
            renderGoals();
            renderContributions();
            renderAnalytics();
        }

        /* =========================================================
           14. ОБРАБОТЧИКИ СОБЫТИЙ
           ========================================================= */

        elements.summaryPeriod.addEventListener("change", updateSummaryPeriod);
        [elements.summaryDateFrom, elements.summaryDateTo].forEach((input) => {
            input.addEventListener("change", () => {
                if (elements.summaryPeriod.value === "custom") updateSummaryPeriod();
            });
        });
        elements.accountForm.addEventListener("submit", handleAccountSubmit);
        elements.transferForm.addEventListener("submit", handleTransferSubmit);
        elements.accountsGrid.addEventListener("click", (event) => { const button = event.target.closest("[data-delete-account]"); if (button) deleteAccount(button.dataset.deleteAccount); });
        elements.transfersTableBody.addEventListener("click", (event) => { const button = event.target.closest("[data-delete-transfer]"); if (button) deleteTransfer(button.dataset.deleteTransfer); });

        elements.transactionForm.addEventListener(
            "submit",
            handleTransactionSubmit
        );

        elements.goalForm.addEventListener(
            "submit",
            handleGoalSubmit
        );

        elements.goalType.addEventListener("change", updateGoalFormByType);

        elements.contributionForm.addEventListener(
            "submit",
            handleContributionSubmit
        );

        elements.quickContributionForm.addEventListener(
            "submit",
            handleQuickContributionSubmit
        );

        elements.cancelTransactionEdit.addEventListener(
            "click",
            resetTransactionForm
        );

        elements.cancelGoalEdit.addEventListener(
            "click",
            resetGoalForm
        );

        elements.cancelContributionEdit.addEventListener(
            "click",
            resetContributionForm
        );

        elements.closeQuickContributionModal.addEventListener(
            "click",
            closeQuickContributionModal
        );

        elements.cancelQuickContribution.addEventListener(
            "click",
            closeQuickContributionModal
        );

        elements.quickContributionModal.addEventListener("click", (event) => {
            if (event.target === elements.quickContributionModal) {
                closeQuickContributionModal();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (
                event.key === "Escape" &&
                !elements.quickContributionModal.classList.contains("hidden")
            ) {
                closeQuickContributionModal();
            }
        });

        /**
         * Делегирование событий для таблицы операций.
         * Один обработчик обслуживает все кнопки внутри таблицы.
         */
        elements.transactionsTableBody.addEventListener("click", (event) => {
            const button = event.target.closest("[data-action]");

            if (!button) {
                return;
            }

            const { action, id } = button.dataset;

            if (action === "edit-transaction") {
                editTransaction(id);
            }

            if (action === "delete-transaction") {
                deleteTransaction(id);
            }
        });

        /**
         * Делегирование событий для карточек вкладов и кредитов.
         */
        function handleGoalCardClick(event) {
            const button = event.target.closest("[data-action]");

            if (!button) {
                return;
            }

            const { action, id } = button.dataset;

            if (action === "quick-contribution") {
                openQuickContributionModal(id);
            }

            if (action === "edit-goal") {
                editGoal(id);
            }

            if (action === "delete-goal") {
                deleteGoal(id);
            }
        }

        elements.depositsGrid.addEventListener("click", handleGoalCardClick);
        elements.creditsGrid.addEventListener("click", handleGoalCardClick);

        /**
         * Делегирование событий для таблицы вкладов.
         */
        elements.contributionsTableBody.addEventListener("click", (event) => {
            const button = event.target.closest("[data-action]");

            if (!button) {
                return;
            }

            const { action, id } = button.dataset;

            if (action === "edit-contribution") {
                editContribution(id);
            }

            if (action === "delete-contribution") {
                deleteContribution(id);
            }
        });

        /**
         * Фильтры операций обновляют таблицу сразу после изменения.
         */
        [
            elements.transactionSearch,
            elements.transactionTypeFilter,
            elements.transactionMonthFilter
        ].forEach((element) => {
            element.addEventListener("input", renderTransactions);
            element.addEventListener("change", renderTransactions);
        });

        elements.clearTransactionFilters.addEventListener("click", () => {
            elements.transactionSearch.value = "";
            elements.transactionTypeFilter.value = "all";
            elements.transactionMonthFilter.value = "";
            renderTransactions();
        });

        /**
         * Фильтры вкладов.
         */
        [
            elements.contributionSearch,
            elements.contributionGoalFilter,
            elements.contributionMonthFilter
        ].forEach((element) => {
            element.addEventListener("input", renderContributions);
            element.addEventListener("change", renderContributions);
        });

        elements.clearContributionFilters.addEventListener("click", () => {
            elements.contributionSearch.value = "";
            elements.contributionGoalFilter.value = "all";
            elements.contributionMonthFilter.value = "";
            renderContributions();
        });

        elements.exportButton.addEventListener("click", exportData);

        elements.importButton.addEventListener("click", () => {
            elements.importFileInput.click();
        });

        elements.importFileInput.addEventListener("change", importData);

        elements.resetButton.addEventListener("click", resetAllData);

        elements.printButton.addEventListener("click", () => {
            window.print();
        });

        elements.themeToggleButton.addEventListener("click", toggleTheme);

        if (elements.mobileNav) {
            elements.mobileNav.addEventListener("click", handleMobileNavClick);
        }

        if (elements.mobileExportButton) {
            elements.mobileExportButton.addEventListener("click", () => {
                elements.exportButton.click();
            });
        }

        if (elements.mobileImportButton) {
            elements.mobileImportButton.addEventListener("click", () => {
                elements.importButton.click();
            });
        }

        if (elements.mobilePrintButton) {
            elements.mobilePrintButton.addEventListener("click", () => {
                elements.printButton.click();
            });
        }

        if (elements.mobileResetButton) {
            elements.mobileResetButton.addEventListener("click", () => {
                elements.resetButton.click();
            });
        }

        if (elements.mobileThemeButton) {
            elements.mobileThemeButton.addEventListener("click", toggleTheme);
        }

        if (elements.mobileViewAllTransactions) {
            elements.mobileViewAllTransactions.addEventListener("click", () => {
                setMobileTab("operations");
            });
        }

        /* =========================================================
           15. ЗАПУСК ПРИЛОЖЕНИЯ
           ========================================================= */

        function initializeApplication() {
            setMobileTab("home", { scrollToTop: false });
            updateThemeToggleButton();
            loadState();

            resetTransactionForm();
            resetGoalForm();
            resetContributionForm();

            renderAll();
        }

        initializeApplication();
