"use strict";

        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        function animateMoney(element, nextValue) {
            const endValue = Number(nextValue) || 0;
            const startValue = Number(element.dataset.numericValue);
            element.dataset.numericValue = String(endValue);

            if (!Number.isFinite(startValue) || startValue === endValue || prefersReducedMotion.matches) {
                element.textContent = formatMoney(endValue);
                return;
            }

            const startedAt = performance.now();
            const duration = 520;
            const difference = endValue - startValue;

            element.classList.remove("value-changed");
            void element.offsetWidth;
            element.classList.add("value-changed");

            function updateValue(now) {
                const progress = Math.min((now - startedAt) / duration, 1);
                const easedProgress = 1 - Math.pow(1 - progress, 3);
                element.textContent = formatMoney(startValue + difference * easedProgress);

                if (progress < 1) {
                    window.requestAnimationFrame(updateValue);
                } else {
                    element.textContent = formatMoney(endValue);
                }
            }

            window.requestAnimationFrame(updateValue);
        }
/* =========================================================
           1. НАСТРОЙКИ И ХРАНИЛИЩЕ

           Приложение не требует базы данных.
           Вся информация хранится в localStorage браузера.

           Ключ STORAGE_KEY можно изменить, если на одной странице
           используется несколько независимых калькуляторов.
           ========================================================= */

        /**
         * Основное состояние приложения.
         *
         * transactions — доходы и расходы.
         * goals — финансовые цели.
         * contributions — отдельные вклады в цели.
         */

        /* =========================================================
           2. ССЫЛКИ НА ЭЛЕМЕНТЫ СТРАНИЦЫ
           ========================================================= */

        const elements = {
            summaryPeriod: document.getElementById("summaryPeriod"),
            summaryCustomPeriod: document.getElementById("summaryCustomPeriod"),
            summaryDateFrom: document.getElementById("summaryDateFrom"),
            summaryDateTo: document.getElementById("summaryDateTo"),
            totalIncome: document.getElementById("totalIncome"),
            totalExpense: document.getElementById("totalExpense"),
            totalBalance: document.getElementById("totalBalance"),
            totalSavings: document.getElementById("totalSavings"),
            incomeCount: document.getElementById("incomeCount"),
            expenseCount: document.getElementById("expenseCount"),
            balanceStatus: document.getElementById("balanceStatus"),
            goalsCount: document.getElementById("goalsCount"),

            mobileDashboard: document.getElementById("mobileDashboard"),
            mobileAvailableBalance: document.getElementById("mobileAvailableBalance"),
            mobileAvailableNote: document.getElementById("mobileAvailableNote"),
            mobileIncome: document.getElementById("mobileIncome"),
            mobileExpense: document.getElementById("mobileExpense"),
            mobileSavings: document.getElementById("mobileSavings"),
            mobileGoalsActive: document.getElementById("mobileGoalsActive"),
            mobileRecentTransactions: document.getElementById("mobileRecentTransactions"),
            mobileViewAllTransactions: document.getElementById("mobileViewAllTransactions"),

            accountForm: document.getElementById("accountForm"),
            accountName: document.getElementById("accountName"),
            accountOpeningBalance: document.getElementById("accountOpeningBalance"),
            accountMessage: document.getElementById("accountMessage"),
            accountsGrid: document.getElementById("accountsGrid"),
            openMobileAccountForm: document.getElementById("openMobileAccountForm"),
            openMobileTransferForm: document.getElementById("openMobileTransferForm"),
            cancelMobileAccountForm: document.getElementById("cancelMobileAccountForm"),
            cancelMobileTransferForm: document.getElementById("cancelMobileTransferForm"),
            transferForm: document.getElementById("transferForm"),
            transferDate: document.getElementById("transferDate"),
            transferFrom: document.getElementById("transferFrom"),
            transferTo: document.getElementById("transferTo"),
            transferAmount: document.getElementById("transferAmount"),
            transferComment: document.getElementById("transferComment"),
            transferMessage: document.getElementById("transferMessage"),
            transfersTableBody: document.getElementById("transfersTableBody"),
            transfersEmptyState: document.getElementById("transfersEmptyState"),
            mobileTransfersFeed: document.getElementById("mobileTransfersFeed"),
            mobileTransfersList: document.getElementById("mobileTransfersList"),
            mobileTransfersEmpty: document.getElementById("mobileTransfersEmpty"),
            mobileTransfersEmptyTitle: document.getElementById("mobileTransfersEmptyTitle"),
            mobileTransfersEmptyText: document.getElementById("mobileTransfersEmptyText"),
            transactionForm: document.getElementById("transactionForm"),
            transactionFormTitle: document.getElementById("transactionFormTitle"),
            transactionId: document.getElementById("transactionId"),
            transactionDate: document.getElementById("transactionDate"),
            transactionType: document.getElementById("transactionType"),
            transactionAmount: document.getElementById("transactionAmount"),
            transactionAccount: document.getElementById("transactionAccount"),
            transactionCategory: document.getElementById("transactionCategory"),
            transactionMember: document.getElementById("transactionMember"),
            transactionComment: document.getElementById("transactionComment"),
            transactionMessage: document.getElementById("transactionMessage"),
            cancelTransactionEdit: document.getElementById("cancelTransactionEdit"),
            transactionsTableBody: document.getElementById("transactionsTableBody"),
            transactionsEmptyState: document.getElementById("transactionsEmptyState"),
            transactionSearch: document.getElementById("transactionSearch"),
            transactionTypeFilter: document.getElementById("transactionTypeFilter"),
            transactionMonthFilter: document.getElementById("transactionMonthFilter"),
            clearTransactionFilters: document.getElementById("clearTransactionFilters"),

            mobileTransactionsFeed: document.getElementById("mobileTransactionsFeed"),
            mobileTransactionsList: document.getElementById("mobileTransactionsList"),
            mobileTransactionsEmpty: document.getElementById("mobileTransactionsEmpty"),
            mobileTransactionsEmptyTitle: document.getElementById("mobileTransactionsEmptyTitle"),
            mobileTransactionsEmptyText: document.getElementById("mobileTransactionsEmptyText"),

            goalForm: document.getElementById("goalForm"),
            goalFormTitle: document.getElementById("goalFormTitle"),
            goalId: document.getElementById("goalId"),
            goalType: document.getElementById("goalType"),
            goalName: document.getElementById("goalName"),
            goalTarget: document.getElementById("goalTarget"),
            goalTargetLabel: document.getElementById("goalTargetLabel"),
            goalInitialAmount: document.getElementById("goalInitialAmount"),
            goalInitialAmountLabel: document.getElementById("goalInitialAmountLabel"),
            goalAnnualRate: document.getElementById("goalAnnualRate"),
            goalAnnualRateField: document.getElementById("goalAnnualRateField"),
            goalOpenedAt: document.getElementById("goalOpenedAt"),
            goalOpenedAtField: document.getElementById("goalOpenedAtField"),
            goalBalanceAsOf: document.getElementById("goalBalanceAsOf"),
            goalBalanceAsOfField: document.getElementById("goalBalanceAsOfField"),
            goalCapitalization: document.getElementById("goalCapitalization"),
            goalCapitalizationField: document.getElementById("goalCapitalizationField"),
            goalDeadline: document.getElementById("goalDeadline"),
            goalDeadlineLabel: document.getElementById("goalDeadlineLabel"),
            goalComment: document.getElementById("goalComment"),
            goalMessage: document.getElementById("goalMessage"),
            cancelGoalEdit: document.getElementById("cancelGoalEdit"),
            openMobileGoalForm: document.getElementById("openMobileGoalForm"),
            goalFormExtra: document.getElementById("goalFormExtra"),
            depositsGrid: document.getElementById("depositsGrid"),
            creditsGrid: document.getElementById("creditsGrid"),
            depositsEmptyState: document.getElementById("depositsEmptyState"),
            creditsEmptyState: document.getElementById("creditsEmptyState"),
            depositsCount: document.getElementById("depositsCount"),
            creditsCount: document.getElementById("creditsCount"),

            contributionForm: document.getElementById("contributionForm"),
            contributionFormTitle: document.getElementById("contributionFormTitle"),
            contributionId: document.getElementById("contributionId"),
            contributionGoal: document.getElementById("contributionGoal"),
            contributionAccount: document.getElementById("contributionAccount"),
            contributionDate: document.getElementById("contributionDate"),
            contributionAmount: document.getElementById("contributionAmount"),
            contributionSource: document.getElementById("contributionSource"),
            contributionComment: document.getElementById("contributionComment"),
            contributionMessage: document.getElementById("contributionMessage"),
            cancelContributionEdit: document.getElementById("cancelContributionEdit"),
            contributionsTableBody: document.getElementById("contributionsTableBody"),
            contributionsEmptyState: document.getElementById("contributionsEmptyState"),
            contributionSearch: document.getElementById("contributionSearch"),
            contributionGoalFilter: document.getElementById("contributionGoalFilter"),
            contributionMonthFilter: document.getElementById("contributionMonthFilter"),
            clearContributionFilters: document.getElementById("clearContributionFilters"),
            mobileContributionsFeed: document.getElementById("mobileContributionsFeed"),
            mobileContributionsList: document.getElementById("mobileContributionsList"),
            mobileContributionsEmpty: document.getElementById("mobileContributionsEmpty"),
            mobileContributionsEmptyTitle: document.getElementById("mobileContributionsEmptyTitle"),
            mobileContributionsEmptyText: document.getElementById("mobileContributionsEmptyText"),

            expenseAnalytics: document.getElementById("expenseAnalytics"),
            incomeAnalytics: document.getElementById("incomeAnalytics"),

            exportButton: document.getElementById("exportButton"),
            importButton: document.getElementById("importButton"),
            importFileInput: document.getElementById("importFileInput"),
            resetButton: document.getElementById("resetButton"),
            printButton: document.getElementById("printButton"),

            quickContributionModal: document.getElementById("quickContributionModal"),
            quickContributionForm: document.getElementById("quickContributionForm"),
            quickContributionGoalId: document.getElementById("quickContributionGoalId"),
            quickContributionGoalName: document.getElementById("quickContributionGoalName"),
            quickContributionDate: document.getElementById("quickContributionDate"),
            quickContributionAccount: document.getElementById("quickContributionAccount"),
            quickContributionAmount: document.getElementById("quickContributionAmount"),
            quickContributionSource: document.getElementById("quickContributionSource"),
            quickContributionComment: document.getElementById("quickContributionComment"),
            closeQuickContributionModal:
                document.getElementById("closeQuickContributionModal"),
            cancelQuickContribution:
                document.getElementById("cancelQuickContribution"),

            quickAddModal: document.getElementById("quickAddModal"),
            quickAddForm: document.getElementById("quickAddForm"),
            quickAddType: document.getElementById("quickAddType"),
            quickAddTypeToggle: document.getElementById("quickAddTypeToggle"),
            quickAddAmount: document.getElementById("quickAddAmount"),
            quickAddCategory: document.getElementById("quickAddCategory"),
            quickAddCategories: document.getElementById("quickAddCategories"),
            quickAddCategoriesDisclosure: document.getElementById(
                "quickAddCategoriesDisclosure"
            ),
            quickAddAccount: document.getElementById("quickAddAccount"),
            quickAddExtra: document.getElementById("quickAddExtra"),
            quickAddDate: document.getElementById("quickAddDate"),
            quickAddMember: document.getElementById("quickAddMember"),
            quickAddComment: document.getElementById("quickAddComment"),
            quickAddMessage: document.getElementById("quickAddMessage"),
            quickAddSubmit: document.getElementById("quickAddSubmit"),
            closeQuickAddModal: document.getElementById("closeQuickAddModal"),
            cancelQuickAdd: document.getElementById("cancelQuickAdd"),
            quickAddVoiceButton: document.getElementById("quickAddVoiceButton"),
            quickAddVoiceStatus: document.getElementById("quickAddVoiceStatus"),
            quickAddVoicePreview: document.getElementById("quickAddVoicePreview"),
            homeVoiceButton: document.getElementById("homeVoiceButton"),
            voiceHabitsList: document.getElementById("voiceHabitsList"),
            voiceHabitsEmpty: document.getElementById("voiceHabitsEmpty"),
            clearVoiceHabitsButton: document.getElementById(
                "clearVoiceHabitsButton"
            ),
            quickAddVoiceHabitPrompt: document.getElementById(
                "quickAddVoiceHabitPrompt"
            ),

            toastContainer: document.getElementById("toastContainer"),

            themeToggleButton: document.getElementById("themeToggleButton"),
            themeToggleIcon: document.getElementById("themeToggleIcon"),
            themeToggleLabel: document.getElementById("themeToggleLabel"),

            mobileNav: document.getElementById("mobileNav"),
            mobileExportButton: document.getElementById("mobileExportButton"),
            mobileImportButton: document.getElementById("mobileImportButton"),
            mobilePrintButton: document.getElementById("mobilePrintButton"),
            mobileResetButton: document.getElementById("mobileResetButton"),
            mobileThemeButton: document.getElementById("mobileThemeButton"),

            accessPanel: document.getElementById("accessPanel"),
            accessStatusText: document.getElementById("accessStatusText"),
            accessRemainingText: document.getElementById("accessRemainingText"),
            accessExpiredBanner: document.getElementById("accessExpiredBanner"),
            accessActivateScrollButton: document.getElementById(
                "accessActivateScrollButton"
            ),
            promoPanel: document.getElementById("promoPanel"),
            promoCodeInput: document.getElementById("promoCodeInput"),
            promoActivateButton: document.getElementById("promoActivateButton"),
            promoMessage: document.getElementById("promoMessage"),
            legalPanel: document.getElementById("legalPanel")
        };

        /** Активная вкладка мобильной оболочки (только runtime, не в state). */
        let activeMobileTab = "home";

        const MOBILE_TAB_IDS = ["home", "operations", "goals", "more"];

        /**
         * Обновляет визуальное и a11y-состояние нижней навигации.
         */
        function updateMobileNavActiveState(tab) {
            if (!elements.mobileNav) {
                return;
            }

            elements.mobileNav.querySelectorAll("[data-mobile-tab]").forEach((button) => {
                const buttonTab = button.dataset.mobileTab;
                const isActive = buttonTab === tab;

                button.classList.toggle("mobile-nav__item--active", isActive);

                if (isActive) {
                    button.setAttribute("aria-current", "page");
                } else {
                    button.removeAttribute("aria-current");
                }
            });
        }

        /**
         * Переключает мобильный экран без изменения финансовой схемы state.
         */
        function setMobileTab(tab, options = {}) {
            const nextTab = MOBILE_TAB_IDS.includes(tab) ? tab : "home";
            const { scrollToTop = true } = options;

            if (typeof closeMobileTransientForms === "function") {
                closeMobileTransientForms();
            }

            if (typeof abortVoiceRecognition === "function") {
                abortVoiceRecognition();
            }

            if (typeof isQuickAddOpen === "function" && isQuickAddOpen()) {
                closeQuickAddSheet({ restoreFocus: false });
            }

            activeMobileTab = nextTab;
            document.body.dataset.mobileTab = nextTab;
            updateMobileNavActiveState(nextTab);

            if (scrollToTop) {
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        }

        /**
         * Закрывает временные mobile-формы при смене вкладки.
         * Не меняет финансовый state — только UI.
         */
        function closeMobileTransientForms() {
            if (typeof resetGoalForm === "function") {
                resetGoalForm();
            }

            if (typeof resetContributionForm === "function") {
                resetContributionForm();
            }

            if (elements.accountForm) {
                elements.accountForm.reset();

                if (elements.accountOpeningBalance) {
                    elements.accountOpeningBalance.value = "0";
                }

                if (elements.accountMessage) {
                    showFormMessage(elements.accountMessage, "");
                }
            }

            if (typeof closeMobileAccountForm === "function") {
                closeMobileAccountForm();
            }

            if (elements.transferForm) {
                elements.transferForm.reset();

                if (elements.transferDate && typeof getToday === "function") {
                    elements.transferDate.value = getToday();
                }

                if (elements.transferMessage) {
                    showFormMessage(elements.transferMessage, "");
                }
            }

            if (typeof closeMobileTransferForm === "function") {
                closeMobileTransferForm();
            }

            if (elements.goalFormExtra) {
                elements.goalFormExtra.open = false;
            }

            closeMobileActionMenus();
        }

        /**
         * Центральная кнопка «+»: открывает Quick Add bottom sheet.
         */
        function openMobileQuickAdd() {
            if (
                typeof requireFinancialWriteAccess === "function" &&
                !requireFinancialWriteAccess()
            ) {
                return;
            }

            openQuickAddSheet({ focusAmount: false });
        }

        /**
         * Обработчик нижней мобильной навигации.
         */
        function handleMobileNavClick(event) {
            const button = event.target.closest("[data-mobile-tab]");

            if (!button || !elements.mobileNav.contains(button)) {
                return;
            }

            const tab = button.dataset.mobileTab;

            if (tab === "add") {
                openMobileQuickAdd();
                return;
            }

            setMobileTab(tab);
        }

        const MOBILE_ACTION_MENU_HOST_SELECTOR =
            ".goal-card, .mobile-tx-card, .account-card";

        function getMobileActionMenuRoot(fromElement) {
            return fromElement?.closest(
                ".mobile-action-menu, .mobile-tx-card__menu"
            );
        }

        function getMobileActionMenuPanel(toggle) {
            return getMobileActionMenuRoot(toggle)?.querySelector(
                ".mobile-action-menu__panel, .mobile-tx-card__menu-panel"
            );
        }

        function getMobileActionMenuHost(panel) {
            return panel?.closest(MOBILE_ACTION_MENU_HOST_SELECTOR) || null;
        }

        /**
         * Открывает меню вверх при нехватке места снизу и
         * горизонтально удерживает panel внутри viewport.
         */
        function resetMobileActionMenuShift(panel) {
            if (!panel) {
                return;
            }

            panel.style.setProperty("--mobile-menu-shift-x", "0px");
        }

        function clampMobileActionMenuHorizontally(panel) {
            if (!panel) {
                return;
            }

            resetMobileActionMenuShift(panel);

            const padding = 12;
            const rect = panel.getBoundingClientRect();
            let shiftX = 0;

            if (rect.left < padding) {
                shiftX = padding - rect.left;
            } else if (rect.right > window.innerWidth - padding) {
                shiftX = window.innerWidth - padding - rect.right;
            }

            panel.style.setProperty("--mobile-menu-shift-x", `${shiftX}px`);
        }

        function positionMobileActionMenu(panel, toggle) {
            const menu = getMobileActionMenuRoot(panel);

            if (!menu || !toggle) {
                return;
            }

            menu.classList.remove("mobile-action-menu--open-up");
            resetMobileActionMenuShift(panel);

            const toggleRect = toggle.getBoundingClientRect();
            const panelHeight = Math.max(panel.getBoundingClientRect().height, 96);
            const mobileNav = document.querySelector(".mobile-nav");
            const navVisible =
                mobileNav &&
                window.getComputedStyle(mobileNav).display !== "none";
            const navHeight = navVisible
                ? mobileNav.getBoundingClientRect().height
                : 0;
            const spaceBelow =
                window.innerHeight - toggleRect.bottom - navHeight - 8;
            const spaceAbove = toggleRect.top - 8;

            if (spaceBelow < panelHeight && spaceAbove > spaceBelow) {
                menu.classList.add("mobile-action-menu--open-up");
            }

            // После вертикального выбора измеряем снова и клампим по X.
            window.requestAnimationFrame(() => {
                clampMobileActionMenuHorizontally(panel);
            });
        }

        /**
         * Единый toggle для всех mobile ⋯ меню.
         * Поднимает карточку-хозяина и выбирает направление открытия.
         */
        function toggleMobileActionMenu(toggle) {
            const panel = getMobileActionMenuPanel(toggle);

            if (!panel) {
                return false;
            }

            const willOpen = panel.classList.contains("hidden");
            closeMobileActionMenus(null, willOpen ? panel : null);

            if (!willOpen) {
                panel.classList.add("hidden");
                toggle.setAttribute("aria-expanded", "false");
                return true;
            }

            panel.classList.remove("hidden");
            toggle.setAttribute("aria-expanded", "true");

            const host = getMobileActionMenuHost(panel);

            if (host) {
                host.classList.add("has-open-menu");
            }

            positionMobileActionMenu(panel, toggle);
            return true;
        }

        /**
         * Закрывает мобильные action-меню (цели, вклады, переводы, операции).
         */
        function closeMobileActionMenus(rootOrNull = null, exceptPanel = null) {
            const root = rootOrNull || document;
            const exceptHost = exceptPanel
                ? getMobileActionMenuHost(exceptPanel)
                : null;
            const exceptMenu = exceptPanel
                ? getMobileActionMenuRoot(exceptPanel)
                : null;

            root
                .querySelectorAll(
                    ".mobile-action-menu__panel, .mobile-tx-card__menu-panel"
                )
                .forEach((panel) => {
                    if (panel === exceptPanel) {
                        return;
                    }

                    panel.classList.add("hidden");
                    resetMobileActionMenuShift(panel);
                    const toggle = panel
                        .closest(".mobile-action-menu, .mobile-tx-card__menu")
                        ?.querySelector(
                            ".mobile-action-menu__toggle, .mobile-tx-card__menu-toggle, [data-action='toggle-mobile-menu'], [data-action='toggle-tx-menu']"
                        );

                    if (toggle) {
                        toggle.setAttribute("aria-expanded", "false");
                    }
                });

            root.querySelectorAll(".has-open-menu").forEach((host) => {
                if (host !== exceptHost) {
                    host.classList.remove("has-open-menu");
                }
            });

            root
                .querySelectorAll(".mobile-action-menu--open-up")
                .forEach((menu) => {
                    if (menu !== exceptMenu) {
                        menu.classList.remove("mobile-action-menu--open-up");
                    }
                });
        }

        /**
         * Подпись кнопки темы в разделе «Ещё».
         */
        function updateMobileThemeButton() {
            if (!elements.mobileThemeButton) {
                return;
            }

            const isDarkTheme = getCurrentTheme() === "dark";
            elements.mobileThemeButton.textContent = isDarkTheme
                ? "Включить светлую тему"
                : "Включить тёмную тему";
            elements.mobileThemeButton.setAttribute(
                "aria-label",
                isDarkTheme
                    ? "Включить светлую тему"
                    : "Включить тёмную тему"
            );
        }

        /* =========================================================
           3. ТЕМА ОФОРМЛЕНИЯ
           ========================================================= */

        /**
         * Возвращает текущую тему страницы.
         */
        function getCurrentTheme() {
            return document.documentElement.getAttribute("data-theme") === "light"
                ? "light"
                : "dark";
        }

        /**
         * Обновляет подпись и иконку на кнопке переключения темы.
         * На кнопке показываем тему, на которую можно переключиться.
         */
        function updateThemeToggleButton() {
            const isDarkTheme = getCurrentTheme() === "dark";

            elements.themeToggleIcon.textContent = isDarkTheme ? "🌙" : "☀️";
            elements.themeToggleLabel.textContent = isDarkTheme ? "Тёмная" : "Светлая";
            if (!prefersReducedMotion.matches) {
                elements.themeToggleIcon.classList.remove("theme-toggle__icon--spin");
                void elements.themeToggleIcon.offsetWidth;
                elements.themeToggleIcon.classList.add("theme-toggle__icon--spin");
            }

            elements.themeToggleButton.setAttribute(
                "aria-label",
                isDarkTheme
                    ? "Включить светлую тему"
                    : "Включить тёмную тему"
            );

            updateMobileThemeButton();
        }

        /**
         * Применяет выбранную тему и сохраняет выбор в localStorage.
         */
        function applyTheme(theme) {
            const nextTheme = theme === "light" ? "light" : "dark";

            document.documentElement.setAttribute("data-theme", nextTheme);
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
            updateThemeToggleButton();

            if (typeof syncPwaThemeColor === "function") {
                syncPwaThemeColor(nextTheme);
            }
        }

        /**
         * Переключает тему между светлой и тёмной.
         */
        function toggleTheme() {
            applyTheme(getCurrentTheme() === "dark" ? "light" : "dark");
        }

        /* =========================================================
           4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
           ========================================================= */

        /**
         * Создаёт уникальный ID.
         * Используется для операций, целей и вкладов.
         */
        function createId() {
            if (window.crypto && typeof window.crypto.randomUUID === "function") {
                return window.crypto.randomUUID();
            }

            return (
                Date.now().toString(36) +
                Math.random().toString(36).slice(2, 10)
            );
        }

        /**
         * Возвращает сегодняшнюю дату в формате YYYY-MM-DD.
         * Такой формат нужен для полей input type="date".
         */
        /**
         * Защищает страницу от вставки HTML-кода через поля формы.
         */
        function escapeHTML(value) {
            return String(value ?? "")
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#039;");
        }

        /**
         * Приводит значение к положительному числу.
         */


        /**
         * Считает количество месяцев между текущей датой
         * и указанным сроком цели.
         */


        /**
         * Отображает временное уведомление в правом нижнем углу.
         */
        function showToast(message, type = "success") {
            const toast = document.createElement("div");

            toast.className = `toast toast--${type}`;
            toast.textContent = message;

            elements.toastContainer.appendChild(toast);

            window.setTimeout(() => {
                toast.remove();
            }, 3500);
        }

        /**
         * Выводит сообщение под формой.
         */
        function showFormMessage(element, message, type = "") {
            element.textContent = message;
            element.className = "form-message";

            if (type) {
                element.classList.add(`form-message--${type}`);
            }

            if (type === "error" && !prefersReducedMotion.matches) {
                element.classList.remove("form-message--shake");
                void element.offsetWidth;
                element.classList.add("form-message--shake");
            }
        }

        /* =========================================================
           4. СОХРАНЕНИЕ И ЗАГРУЗКА
           ========================================================= */

        /**
         * Сохраняет текущее состояние в localStorage.
         */


        /**
         * Загружает данные из localStorage.
         */


        /**
         * Сохраняет данные и перерисовывает весь интерфейс.
         */


        /* =========================================================
           5. РАСЧЁТЫ
           ========================================================= */

        /**
         * Возвращает тип цели. Старые записи без type считаются вкладами.
         */


        /**
         * Приводит цель к актуальной структуре после загрузки из хранилища.
         */


        /**
         * Возвращает сумму всех вкладов для конкретной цели.
         */


        /**
         * Возвращает полную накопленную сумму по цели:
         * стартовая сумма + все добавленные вклады.
         */


        /**
         * Считает ожидаемый годовой доход по вкладу.
         */


        /**
         * Возвращает цель по её ID.
         */


        /**
         * Формирует общий финансовый итог.
         */


        /* =========================================================
           6. ОТРИСОВКА СВОДКИ
           ========================================================= */
