"use strict";

/* =========================================================
   Access UI — Version 8.1
   Renders trial/license status and applies read-only mode.
   ========================================================= */

function getAccessWriteControlElements() {
    const list = [
        elements.importButton,
        elements.mobileImportButton,
        elements.quickAddSubmit,
        elements.quickAddVoiceButton,
        elements.homeVoiceButton,
        elements.openMobileAccountForm,
        elements.openMobileTransferForm,
        elements.openMobileGoalForm
    ];

    const forms = [
        elements.accountForm,
        elements.transferForm,
        elements.transactionForm,
        elements.goalForm,
        elements.contributionForm,
        elements.quickContributionForm,
        elements.quickAddForm
    ];

    forms.forEach((form) => {
        if (!form) {
            return;
        }

        form.querySelectorAll('button[type="submit"]').forEach((button) => {
            list.push(button);
        });
    });

    if (elements.mobileNav) {
        const addButton = elements.mobileNav.querySelector(
            '[data-mobile-tab="add"]'
        );
        if (addButton) {
            list.push(addButton);
        }
    }

    return list.filter(Boolean);
}

function setPromoMessage(text, tone) {
    if (!elements.promoMessage) {
        return;
    }

    elements.promoMessage.textContent = text || "";
    elements.promoMessage.classList.remove(
        "form-message--error",
        "form-message--success"
    );

    if (!text) {
        return;
    }

    if (tone === "error") {
        elements.promoMessage.classList.add("form-message--error");
    } else if (tone === "success") {
        elements.promoMessage.classList.add("form-message--success");
    }
}

function renderAccessStatus() {
    if (typeof getAccessSnapshot !== "function") {
        return;
    }

    const snapshot = getAccessSnapshot();

    if (elements.accessStatusText) {
        if (snapshot.isExpired) {
            elements.accessStatusText.textContent = "Пробный период завершён";
        } else if (snapshot.isLicensed) {
            elements.accessStatusText.textContent = "Активировано";
        } else {
            elements.accessStatusText.textContent = "Пробная версия";
        }
    }

    if (elements.accessRemainingText) {
        if (snapshot.isExpired) {
            elements.accessRemainingText.textContent =
                "Ваши данные сохранены на устройстве. Доступен просмотр, экспорт и удаление данных.";
        } else if (snapshot.isLicensed) {
            elements.accessRemainingText.textContent =
                "Полный доступ к приложению.";
        } else {
            elements.accessRemainingText.textContent =
                "Осталось: " + snapshot.remainingTrialLabel;
        }
    }

    if (elements.accessExpiredBanner) {
        elements.accessExpiredBanner.classList.toggle(
            "hidden",
            !snapshot.isExpired
        );
    }
}

function applyAccessModeToUi() {
    const canWrite =
        typeof hasFinancialWriteAccess === "function"
            ? hasFinancialWriteAccess()
            : true;

    let mode = "trial";
    if (typeof getAccessSnapshot === "function") {
        const snapshot = getAccessSnapshot();
        if (snapshot.isExpired) {
            mode = "expired";
        } else if (snapshot.isLicensed) {
            mode = "licensed";
        }
    }

    document.body.dataset.accessMode = mode;
    document.body.classList.toggle("access-readonly", !canWrite);

    getAccessWriteControlElements().forEach((control) => {
        control.disabled = !canWrite;
        if (!canWrite) {
            control.setAttribute("aria-disabled", "true");
        } else {
            control.removeAttribute("aria-disabled");
        }
    });
}

function scrollToPromoPanel() {
    if (typeof setMobileTab === "function") {
        setMobileTab("more", { scrollToTop: false });
    }

    const target = elements.promoPanel || document.getElementById("promoPanel");

    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (elements.promoCodeInput) {
        window.setTimeout(() => {
            elements.promoCodeInput.focus();
        }, 280);
    }
}

async function handlePromoActivateClick() {
    if (typeof activatePromoCode !== "function") {
        setPromoMessage("Активация недоступна.", "error");
        return;
    }

    const raw = elements.promoCodeInput
        ? elements.promoCodeInput.value
        : "";

    setPromoMessage("Проверка промокода…");

    try {
        const result = await activatePromoCode(raw);

        if (!result || !result.ok) {
            const reason = result && result.reason;
            setPromoMessage(
                reason === "invalid"
                    ? "Введите корректный промокод."
                    : "Промокод не принят. Проверьте код и попробуйте снова.",
                "error"
            );
            return;
        }

        if (elements.promoCodeInput) {
            elements.promoCodeInput.value = "";
        }

        setPromoMessage("Доступ активирован.", "success");

        if (typeof refreshAccessClock === "function") {
            await refreshAccessClock();
        }

        renderAccessStatus();
        applyAccessModeToUi();

        if (typeof showToast === "function") {
            showToast("Приложение активировано.");
        }
    } catch (error) {
        console.error("Ошибка активации промокода:", error);
        setPromoMessage(
            "Не удалось проверить промокод. Попробуйте позже.",
            "error"
        );
    }
}

function initAccessUi() {
    if (elements.promoActivateButton) {
        elements.promoActivateButton.addEventListener(
            "click",
            handlePromoActivateClick
        );
    }

    if (elements.promoCodeInput) {
        elements.promoCodeInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                handlePromoActivateClick();
            }
        });
    }

    if (elements.accessActivateScrollButton) {
        elements.accessActivateScrollButton.addEventListener(
            "click",
            scrollToPromoPanel
        );
    }

    renderAccessStatus();
    applyAccessModeToUi();
}
