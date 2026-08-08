"use strict";

/**
 * Voice Input v1: browser SpeechRecognition → local parser → Quick Add draft.
 * Никогда не вызывает addTransaction напрямую.
 */

let voiceRecognition = null;
let voiceRecognitionActive = false;
let voiceDraftActive = false;
let voiceIgnoreResults = false;
let voiceUserAborted = false;

function isSpeechRecognitionSupported() {
    return Boolean(
        typeof window !== "undefined" &&
            (window.SpeechRecognition || window.webkitSpeechRecognition)
    );
}

function getSpeechRecognitionConstructor() {
    if (typeof window === "undefined") {
        return null;
    }

    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function isVoiceDraftActive() {
    return voiceDraftActive;
}

function blurQuickAddInputs() {
    const active = document.activeElement;

    if (
        active &&
        elements.quickAddModal &&
        elements.quickAddModal.contains(active) &&
        typeof active.blur === "function"
    ) {
        active.blur();
    }

    [
        elements.quickAddAmount,
        elements.quickAddCategory,
        elements.quickAddMember,
        elements.quickAddComment
    ].forEach((input) => {
        if (input && typeof input.blur === "function") {
            input.blur();
        }
    });
}

function setVoiceUnsupportedState() {
    if (elements.quickAddVoiceButton) {
        elements.quickAddVoiceButton.disabled = true;
        elements.quickAddVoiceButton.setAttribute("aria-disabled", "true");
        elements.quickAddVoiceButton.title =
            "Голосовой ввод не поддерживается этим браузером";
    }

    if (elements.homeVoiceButton) {
        elements.homeVoiceButton.classList.add("hidden");
        elements.homeVoiceButton.disabled = true;
    }

    if (elements.quickAddVoiceStatus) {
        elements.quickAddVoiceStatus.classList.remove("hidden");
        elements.quickAddVoiceStatus.textContent =
            "Голосовой ввод не поддерживается этим браузером. Используйте ручное добавление.";
        elements.quickAddVoiceStatus.dataset.voiceState = "unsupported";
    }
}

function updateVoiceMicButtons(isListening) {
    const label = isListening ? "Остановить" : "🎙 Голосом";
    const homeLabel = isListening ? "Остановить" : "🎙 Добавить голосом";

    if (elements.quickAddVoiceButton) {
        elements.quickAddVoiceButton.textContent = label;
        elements.quickAddVoiceButton.classList.toggle(
            "quick-add-voice__button--listening",
            isListening
        );
        elements.quickAddVoiceButton.setAttribute(
            "aria-pressed",
            isListening ? "true" : "false"
        );
    }

    if (elements.homeVoiceButton) {
        elements.homeVoiceButton.textContent = homeLabel;
        elements.homeVoiceButton.classList.toggle(
            "mobile-dashboard__voice--listening",
            isListening
        );
    }
}

function setVoiceListeningUi(isListening) {
    updateVoiceMicButtons(isListening);

    if (!elements.quickAddVoiceStatus) {
        return;
    }

    if (isListening) {
        elements.quickAddVoiceStatus.classList.remove("hidden");
        elements.quickAddVoiceStatus.dataset.voiceState = "listening";
        elements.quickAddVoiceStatus.innerHTML = `
            <div class="quick-add-voice__listening">
                <span class="quick-add-voice__dot" aria-hidden="true"></span>
                <strong>Слушаю...</strong>
            </div>
            <p class="quick-add-voice__prompt">Скажите операцию одной фразой</p>
            <p class="quick-add-voice__example">Например: Продукты 2450 рублей с основного счёта</p>
        `;
        return;
    }

    if (elements.quickAddVoiceStatus.dataset.voiceState === "listening") {
        elements.quickAddVoiceStatus.dataset.voiceState = "";
    }
}

function clearVoicePreview() {
    voiceDraftActive = false;

    if (elements.quickAddVoicePreview) {
        elements.quickAddVoicePreview.classList.add("hidden");
        elements.quickAddVoicePreview.innerHTML = "";
    }

    if (typeof updateQuickAddSubmitLabel === "function") {
        updateQuickAddSubmitLabel();
    }
}

function clearVoiceUi(options = {}) {
    const { keepUnsupported = true } = options;
    const wasUnsupported =
        elements.quickAddVoiceStatus?.dataset.voiceState === "unsupported";

    clearVoicePreview();
    setVoiceListeningUi(false);

    if (elements.quickAddVoiceStatus && !(keepUnsupported && wasUnsupported)) {
        if (!wasUnsupported || !keepUnsupported) {
            elements.quickAddVoiceStatus.classList.add("hidden");
            elements.quickAddVoiceStatus.textContent = "";
            elements.quickAddVoiceStatus.dataset.voiceState = "";
        }
    }
}

function showVoiceError(message) {
    if (!elements.quickAddVoiceStatus) {
        return;
    }

    elements.quickAddVoiceStatus.classList.remove("hidden");
    elements.quickAddVoiceStatus.dataset.voiceState = "error";
    elements.quickAddVoiceStatus.innerHTML = `
        <p class="quick-add-voice__error">${escapeHTML(message)}</p>
        <p class="quick-add-voice__privacy">Операция сохранится только после вашего подтверждения.</p>
    `;
}

function formatVoicePreviewDate(dateValue) {
    const today = getToday();

    if (dateValue === today) {
        return "Сегодня";
    }

    if (dateValue === getYesterday()) {
        return "Вчера";
    }

    if (
        typeof addDaysToDateString === "function" &&
        dateValue === addDaysToDateString(today, -2)
    ) {
        return "Позавчера";
    }

    return typeof formatDate === "function" ? formatDate(dateValue) : dateValue;
}

function renderVoicePreview(parsed) {
    if (!elements.quickAddVoicePreview) {
        return;
    }

    const accountName =
        getAccountById(parsed.accountId)?.name || "Счёт не выбран";
    const typeLabel = parsed.type === "income" ? "Доход" : "Расход";
    const amountLabel =
        parsed.amount === null || parsed.amount === undefined
            ? "сумма не распознана"
            : formatMoney(rublesToMinor(parsed.amount));
    const categoryLabel = parsed.category || "категория не выбрана";
    const dateLabel = formatVoicePreviewDate(parsed.date);
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];

    voiceDraftActive = true;
    elements.quickAddVoicePreview.classList.remove("hidden");
    elements.quickAddVoicePreview.innerHTML = `
        <div class="quick-add-voice__preview-block">
            <div class="quick-add-voice__preview-label">Распознано</div>
            <p class="quick-add-voice__transcript">${escapeHTML(parsed.transcript || "")}</p>
        </div>
        <div class="quick-add-voice__preview-block">
            <div class="quick-add-voice__preview-label">Проверьте</div>
            <p class="quick-add-voice__summary">
                ${escapeHTML(typeLabel)} · ${escapeHTML(amountLabel)}<br>
                ${escapeHTML(categoryLabel)}<br>
                ${escapeHTML(accountName)}<br>
                ${escapeHTML(dateLabel)}
                ${
                    parsed.comment
                        ? `<br>Комментарий: ${escapeHTML(parsed.comment)}`
                        : ""
                }
            </p>
        </div>
        ${
            warnings.length
                ? `<ul class="quick-add-voice__warnings">${warnings
                      .map(
                          (warning) =>
                              `<li>⚠ ${escapeHTML(warning)}</li>`
                      )
                      .join("")}</ul>`
                : ""
        }
        <p class="quick-add-voice__privacy">Операция сохранится только после вашего подтверждения.</p>
        <button
            class="button button--secondary quick-add-voice__again"
            type="button"
            id="quickAddVoiceAgain"
        >
            🎙 Сказать ещё раз
        </button>
    `;

    if (typeof updateQuickAddSubmitLabel === "function") {
        updateQuickAddSubmitLabel();
    }
}

function applyVoiceParseResult(parsed) {
    if (!parsed || !isQuickAddOpen()) {
        return;
    }

    setQuickAddType(parsed.type === "income" ? "income" : "expense");

    if (elements.quickAddAmount) {
        elements.quickAddAmount.value =
            parsed.amount === null || parsed.amount === undefined
                ? ""
                : String(parsed.amount);
    }

    if (elements.quickAddCategory) {
        elements.quickAddCategory.value = parsed.category || "";
    }

    renderQuickAddCategories();
    syncQuickAddCategorySelection();

    if (elements.quickAddAccount && parsed.accountId) {
        elements.quickAddAccount.value = parsed.accountId;
    }

    if (elements.quickAddDate) {
        elements.quickAddDate.value = parsed.date || getToday();
    }

    if (elements.quickAddComment) {
        elements.quickAddComment.value = parsed.comment || "";
    }

    if (parsed.comment && elements.quickAddExtra) {
        elements.quickAddExtra.open = true;
    }

    showFormMessage(elements.quickAddMessage, "");
    renderVoicePreview(parsed);
}

function buildVoiceParserContext() {
    return {
        accounts: (state.accounts || []).map((account) => ({
            id: account.id,
            name: account.name
        })),
        preferredAccountId: getPreferredTransactionAccountId(),
        today: getToday(),
        categories: QUICK_ADD_CATEGORIES
    };
}

function handleVoiceTranscript(transcript) {
    if (voiceIgnoreResults || !isQuickAddOpen()) {
        return;
    }

    const parsed = parseVoiceTransaction(
        transcript,
        buildVoiceParserContext()
    );

    applyVoiceParseResult(parsed);

    if (elements.quickAddVoiceStatus) {
        elements.quickAddVoiceStatus.classList.add("hidden");
        elements.quickAddVoiceStatus.dataset.voiceState = "";
        elements.quickAddVoiceStatus.textContent = "";
    }
}

function mapSpeechRecognitionError(errorCode) {
    switch (errorCode) {
        case "not-allowed":
            return "Доступ к микрофону запрещён. Разрешите его в настройках браузера.";
        case "no-speech":
            return "Речь не распознана. Попробуйте ещё раз.";
        case "audio-capture":
            return "Микрофон недоступен.";
        case "network":
            return "Сервис распознавания речи сейчас недоступен.";
        case "aborted":
            return "";
        default:
            return "Не удалось распознать речь. Попробуйте ещё раз.";
    }
}

function stopVoiceRecognition(options = {}) {
    const { abort = false, silent = false } = options;

    if (!voiceRecognition) {
        voiceRecognitionActive = false;
        setVoiceListeningUi(false);
        return;
    }

    voiceUserAborted = abort || silent;
    voiceIgnoreResults = abort || silent;

    try {
        if (abort) {
            voiceRecognition.abort();
        } else {
            voiceRecognition.stop();
        }
    } catch (_error) {
        // Браузер может бросить, если сессия уже завершена.
    }

    voiceRecognitionActive = false;
    setVoiceListeningUi(false);
}

function abortVoiceRecognition() {
    stopVoiceRecognition({ abort: true, silent: true });
    voiceRecognition = null;
    voiceRecognitionActive = false;
    voiceIgnoreResults = true;
    setVoiceListeningUi(false);
}

function startVoiceRecognition() {
    if (!isSpeechRecognitionSupported()) {
        setVoiceUnsupportedState();
        showVoiceError(
            "Голосовой ввод не поддерживается этим браузером. Используйте ручное добавление."
        );
        return;
    }

    if (voiceRecognitionActive) {
        stopVoiceRecognition({ abort: false });
        return;
    }

    if (!isQuickAddOpen()) {
        return;
    }

    const Recognition = getSpeechRecognitionConstructor();

    if (!Recognition) {
        setVoiceUnsupportedState();
        return;
    }

    blurQuickAddInputs();
    voiceIgnoreResults = false;
    voiceUserAborted = false;

    const recognition = new Recognition();
    recognition.lang = "ru-RU";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    voiceRecognition = recognition;
    voiceRecognitionActive = true;
    setVoiceListeningUi(true);

    recognition.onresult = (event) => {
        if (voiceIgnoreResults || !isQuickAddOpen()) {
            return;
        }

        const transcript = event?.results?.[0]?.[0]?.transcript || "";

        voiceRecognitionActive = false;
        setVoiceListeningUi(false);

        if (!String(transcript).trim()) {
            showVoiceError("Речь не распознана. Попробуйте ещё раз.");
            return;
        }

        handleVoiceTranscript(String(transcript).trim());
    };

    recognition.onerror = (event) => {
        voiceRecognitionActive = false;
        setVoiceListeningUi(false);

        if (voiceUserAborted || voiceIgnoreResults) {
            return;
        }

        const message = mapSpeechRecognitionError(event?.error || "");

        if (message) {
            showVoiceError(message);
        }
    };

    recognition.onend = () => {
        voiceRecognitionActive = false;
        setVoiceListeningUi(false);
        voiceRecognition = null;
    };

    try {
        recognition.start();
    } catch (_error) {
        voiceRecognitionActive = false;
        voiceRecognition = null;
        setVoiceListeningUi(false);
        showVoiceError("Не удалось распознать речь. Попробуйте ещё раз.");
    }
}

function openQuickAddForVoice() {
    openQuickAddSheet({ focusAmount: false });
    startVoiceRecognition();
}

function handleQuickAddVoiceButtonClick(event) {
    event.preventDefault();

    if (!isSpeechRecognitionSupported()) {
        setVoiceUnsupportedState();
        showVoiceError(
            "Голосовой ввод не поддерживается этим браузером. Используйте ручное добавление."
        );
        return;
    }

    if (voiceRecognitionActive) {
        stopVoiceRecognition({ abort: false });
        return;
    }

    startVoiceRecognition();
}

function handleHomeVoiceButtonClick(event) {
    event.preventDefault();
    openQuickAddForVoice();
}

function handleQuickAddVoicePreviewClick(event) {
    const again = event.target.closest("#quickAddVoiceAgain, .quick-add-voice__again");

    if (!again || !elements.quickAddVoicePreview?.contains(again)) {
        return;
    }

    event.preventDefault();
    startVoiceRecognition();
}

function initVoiceInput() {
    if (elements.homeVoiceButton) {
        if (isSpeechRecognitionSupported()) {
            elements.homeVoiceButton.classList.remove("hidden");
            elements.homeVoiceButton.disabled = false;
        } else {
            elements.homeVoiceButton.classList.add("hidden");
            elements.homeVoiceButton.disabled = true;
        }
    }

    if (!isSpeechRecognitionSupported()) {
        setVoiceUnsupportedState();
        return;
    }

    if (elements.quickAddVoiceButton) {
        elements.quickAddVoiceButton.disabled = false;
        elements.quickAddVoiceButton.removeAttribute("aria-disabled");
    }
}
