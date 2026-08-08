"use strict";

/* =========================================================
   Access UI — Version 8.2
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

function activationErrorMessage(reason) {
    switch (reason) {
        case "invalid":
            return "Неверный код активации.";
        case "malformed":
        case "oversized":
            return "Формат лицензии повреждён.";
        case "bad_signature":
        case "unknown_kid":
        case "invalid_payload":
            return "Подпись лицензии недействительна.";
        case "installation_mismatch":
            return "Эта лицензия выпущена для другой установки приложения.";
        case "mismatch":
            return "Неверный код активации.";
        case "expired":
            return "Лицензия больше не действует.";
        case "revoked":
            return "Эта лицензия отозвана.";
        case "duplicate":
            return "Эта лицензия уже активирована.";
        default:
            return "Неверный код активации.";
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
            elements.accessStatusText.textContent =
                snapshot.signedLicenseCount > 0 && !snapshot.ownerVerified
                    ? "Лицензия активирована"
                    : "Активировано";
        } else {
            elements.accessStatusText.textContent = "Пробная версия";
        }
    }

    if (elements.accessRemainingText) {
        if (snapshot.isExpired) {
            elements.accessRemainingText.textContent =
                "Ваши данные сохранены на устройстве. Доступен просмотр, экспорт и удаление данных.";
        } else if (snapshot.isLicensed) {
            if (snapshot.licenseIdShort && !snapshot.ownerVerified) {
                elements.accessRemainingText.textContent =
                    "Полный доступ к приложению. ID лицензии: " +
                    snapshot.licenseIdShort;
            } else {
                elements.accessRemainingText.textContent =
                    "Полный доступ к приложению.";
            }
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

    setPromoMessage("Проверка кода…");

    try {
        const result = await activatePromoCode(raw);

        if (!result || !result.ok) {
            setPromoMessage(
                activationErrorMessage(result && result.reason),
                "error"
            );
            return;
        }

        if (elements.promoCodeInput) {
            elements.promoCodeInput.value = "";
        }

        const signed = result.kind === "signed-license";
        setPromoMessage(
            signed
                ? "Лицензия успешно активирована."
                : "Приложение активировано.",
            "success"
        );

        if (typeof refreshAccessClock === "function") {
            await refreshAccessClock();
        }

        renderAccessStatus();
        applyAccessModeToUi();

        if (typeof showToast === "function") {
            showToast(
                signed
                    ? "Лицензия успешно активирована."
                    : "Приложение активировано."
            );
        }
    } catch (error) {
        console.error("Ошибка активации:", error);
        setPromoMessage(
            "Не удалось проверить код активации. Попробуйте позже.",
            "error"
        );
    }
}

function renderInstallationIdUi() {
    if (!elements.installationIdValue) {
        return;
    }

    const id =
        typeof getInstallationId === "function" ? getInstallationId() : null;
    elements.installationIdValue.value = id || "—";
}

async function copyTextWithFallback(text) {
    const value = String(text || "");
    if (!value) {
        return false;
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        try {
            await navigator.clipboard.writeText(value);
            return true;
        } catch (_error) {
            // fall through
        }
    }

    try {
        const area = document.createElement("textarea");
        area.value = value;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(area);
        return ok;
    } catch (_error) {
        return false;
    }
}

async function handleCopyInstallationIdClick() {
    const id =
        typeof getInstallationId === "function" ? getInstallationId() : null;
    if (!id) {
        setPromoMessage("ID установки ещё не готов.", "error");
        return;
    }

    const ok = await copyTextWithFallback(id);
    if (ok) {
        setPromoMessage("ID установки скопирован.", "success");
        if (typeof showToast === "function") {
            showToast("ID установки скопирован.");
        }
    } else {
        setPromoMessage(
            "Не удалось скопировать ID. Выделите поле и скопируйте вручную.",
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

    if (elements.installationIdCopyButton) {
        elements.installationIdCopyButton.addEventListener(
            "click",
            handleCopyInstallationIdClick
        );
    }

    renderInstallationIdUi();
    renderAccessStatus();
    applyAccessModeToUi();
}
