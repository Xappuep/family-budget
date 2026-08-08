"use strict";

        function resetAllForms() {
            resetTransactionForm();
            resetGoalForm();
            resetContributionForm();
            closeQuickContributionModal();
            closeQuickAddSheet({ restoreFocus: false });
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
        elements.accountsGrid.addEventListener("click", (event) => {
            const menuToggle = event.target.closest("[data-action='toggle-mobile-menu']");

            if (menuToggle && elements.accountsGrid.contains(menuToggle)) {
                toggleMobileActionMenu(menuToggle);
                return;
            }

            const button = event.target.closest("[data-delete-account]");
            if (button) {
                closeMobileActionMenus();
                deleteAccount(button.dataset.deleteAccount);
            }
        });
        elements.transfersTableBody.addEventListener("click", (event) => {
            const button = event.target.closest("[data-delete-transfer]");
            if (button) deleteTransfer(button.dataset.deleteTransfer);
        });

        if (elements.mobileTransfersList) {
            elements.mobileTransfersList.addEventListener(
                "click",
                handleMobileTransfersClick
            );
        }

        if (elements.openMobileAccountForm) {
            elements.openMobileAccountForm.addEventListener(
                "click",
                openMobileAccountForm
            );
        }

        if (elements.openMobileTransferForm) {
            elements.openMobileTransferForm.addEventListener(
                "click",
                openMobileTransferForm
            );
        }

        if (elements.cancelMobileAccountForm) {
            elements.cancelMobileAccountForm.addEventListener(
                "click",
                cancelMobileAccountForm
            );
        }

        if (elements.cancelMobileTransferForm) {
            elements.cancelMobileTransferForm.addEventListener(
                "click",
                cancelMobileTransferForm
            );
        }

        if (elements.openMobileGoalForm) {
            elements.openMobileGoalForm.addEventListener(
                "click",
                openMobileGoalForm
            );
        }
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

        if (elements.quickAddForm) {
            elements.quickAddForm.addEventListener("submit", handleQuickAddSubmit);
        }

        if (elements.quickAddTypeToggle) {
            elements.quickAddTypeToggle.addEventListener(
                "click",
                handleQuickAddTypeClick
            );
        }

        if (elements.quickAddCategories) {
            elements.quickAddCategories.addEventListener(
                "click",
                handleQuickAddCategoriesClick
            );
        }

        if (elements.quickAddCategory) {
            elements.quickAddCategory.addEventListener("input", () => {
                syncQuickAddCategorySelection();

                if (typeof evaluateVoiceHabitPrompt === "function") {
                    evaluateVoiceHabitPrompt();
                }
            });
        }

        if (elements.quickAddVoiceButton) {
            elements.quickAddVoiceButton.addEventListener(
                "click",
                handleQuickAddVoiceButtonClick
            );
        }

        if (elements.homeVoiceButton) {
            elements.homeVoiceButton.addEventListener(
                "click",
                handleHomeVoiceButtonClick
            );
        }

        if (elements.quickAddVoicePreview) {
            elements.quickAddVoicePreview.addEventListener(
                "click",
                handleQuickAddVoicePreviewClick
            );
        }

        if (elements.quickAddVoiceHabitPrompt) {
            elements.quickAddVoiceHabitPrompt.addEventListener(
                "click",
                handleVoiceHabitPromptClick
            );
        }

        if (elements.voiceHabitsList) {
            elements.voiceHabitsList.addEventListener(
                "click",
                handleVoiceHabitsPanelClick
            );
        }

        if (elements.clearVoiceHabitsButton) {
            elements.clearVoiceHabitsButton.addEventListener(
                "click",
                handleClearVoiceHabitsClick
            );
        }

        if (elements.closeQuickAddModal) {
            elements.closeQuickAddModal.addEventListener("click", () => {
                closeQuickAddSheet();
            });
        }

        if (elements.cancelQuickAdd) {
            elements.cancelQuickAdd.addEventListener("click", () => {
                closeQuickAddSheet();
            });
        }

        if (elements.quickAddModal) {
            elements.quickAddModal.addEventListener("click", (event) => {
                if (event.target === elements.quickAddModal) {
                    closeQuickAddSheet();
                }
            });
        }

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") {
                return;
            }

            if (isQuickAddOpen()) {
                closeQuickAddSheet();
                return;
            }

            closeMobileActionMenus();

            if (
                elements.quickContributionModal &&
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

        if (elements.mobileTransactionsList) {
            elements.mobileTransactionsList.addEventListener(
                "click",
                handleMobileTransactionsClick
            );
        }

        if (elements.mobileContributionsList) {
            elements.mobileContributionsList.addEventListener(
                "click",
                handleMobileContributionsClick
            );
        }

        document.addEventListener("click", (event) => {
            if (
                !event.target.closest(
                    ".mobile-action-menu, .mobile-tx-card__menu"
                )
            ) {
                closeMobileActionMenus();
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

            if (action === "toggle-mobile-menu") {
                toggleMobileActionMenu(button);
                return;
            }

            if (action === "toggle-goal-details" || action === "collapse-goal-details") {
                const card = button.closest(".goal-card");

                if (!card) {
                    return;
                }

                const willExpand =
                    action === "collapse-goal-details"
                        ? false
                        : !card.classList.contains("is-expanded");

                card.classList.toggle("is-expanded", willExpand);

                card
                    .querySelectorAll("[data-action='toggle-goal-details']")
                    .forEach((toggleButton) => {
                        toggleButton.textContent = willExpand
                            ? "Свернуть"
                            : "Подробнее";
                    });

                if (!willExpand) {
                    card.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }

                return;
            }

            if (action === "quick-contribution") {
                closeMobileActionMenus();
                openQuickContributionModal(id);
            }

            if (action === "edit-goal") {
                closeMobileActionMenus();
                editGoal(id);
            }

            if (action === "delete-goal") {
                closeMobileActionMenus();
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

        async function initializeApplication() {
            setMobileTab("home", { scrollToTop: false });
            updateThemeToggleButton();

            try {
                await loadState();
            } catch (error) {
                console.error("Ошибка инициализации хранилища:", error);
                if (typeof showToast === "function") {
                    showToast(
                        "Не удалось загрузить данные. Перезапустите приложение.",
                        "error"
                    );
                }
            }

            if (typeof initializeInstallationIdentity === "function") {
                try {
                    await initializeInstallationIdentity();
                } catch (error) {
                    console.error("Ошибка инициализации ID установки:", error);
                }
            }

            if (typeof initializeAccessControl === "function") {
                try {
                    await initializeAccessControl();
                } catch (error) {
                    console.error("Ошибка инициализации доступа:", error);
                }
            }

            resetTransactionForm();
            resetGoalForm();
            resetContributionForm();

            if (typeof initVoiceInput === "function") {
                initVoiceInput();
            }

            if (typeof initPwa === "function") {
                initPwa();
            }

            if (typeof initAccessUi === "function") {
                initAccessUi();
            }

            renderAll();
            if (typeof renderAccessStatus === "function") {
                renderAccessStatus();
            }
            if (typeof applyAccessModeToUi === "function") {
                applyAccessModeToUi();
            }

            if (typeof markApplicationReady === "function") {
                markApplicationReady();
            } else {
                document.body.classList.remove("app-booting");
                document.body.classList.add("app-ready");
            }
        }

        initializeApplication();
