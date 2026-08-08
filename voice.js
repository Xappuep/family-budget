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
/** @type {null | { phrase: string, category: string, mode: "create" | "update", previousCategory?: string }} */
let pendingVoiceHabit = null;
/** @type {null | object} */
let lastVoiceParseResult = null;

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
    const quickLabel = isListening ? "Остановить" : "🎙 Голосом";
    const homeTitle = isListening ? "Остановить" : "Добавить голосом";
    const homeSubtitle = isListening
        ? "Слушаю команду"
        : "Скажите расход или доход";

    if (elements.quickAddVoiceButton) {
        elements.quickAddVoiceButton.textContent = quickLabel;
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
        const title = elements.homeVoiceButton.querySelector(
            ".mobile-dashboard__voice-cta__title"
        );
        const subtitle = elements.homeVoiceButton.querySelector(
            ".mobile-dashboard__voice-cta__subtitle"
        );

        if (title) {
            title.textContent = homeTitle;
        } else {
            elements.homeVoiceButton.textContent = isListening
                ? "Остановить"
                : "🎙 Добавить голосом";
        }

        if (subtitle) {
            subtitle.textContent = homeSubtitle;
        }

        elements.homeVoiceButton.classList.toggle(
            "mobile-dashboard__voice-cta--listening",
            isListening
        );
        elements.homeVoiceButton.setAttribute(
            "aria-pressed",
            isListening ? "true" : "false"
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

function clearPendingVoiceHabit() {
    pendingVoiceHabit = null;
    lastVoiceParseResult = null;
    hideVoiceHabitPrompt();
}

function hideVoiceHabitPrompt() {
    if (!elements.quickAddVoiceHabitPrompt) {
        return;
    }

    elements.quickAddVoiceHabitPrompt.classList.add("hidden");
    elements.quickAddVoiceHabitPrompt.innerHTML = "";
}

function clearVoicePreview() {
    voiceDraftActive = false;
    clearPendingVoiceHabit();

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
    const habitHint =
        parsed.categorySource === "habit" && parsed.habitMatch?.phrase
            ? `${categoryLabel} · из локальной привычки «${parsed.habitMatch.phrase}»`
            : "";

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
                ${
                    habitHint
                        ? `<span class="quick-add-voice__habit-hint">${escapeHTML(habitHint)}</span><br>`
                        : ""
                }
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
        <div
            class="quick-add-voice__habit-prompt hidden"
            id="quickAddVoiceHabitPrompt"
        ></div>
        <p class="quick-add-voice__privacy">Операция сохранится только после вашего подтверждения.</p>
        <button
            class="button button--secondary quick-add-voice__again"
            type="button"
            id="quickAddVoiceAgain"
        >
            🎙 Сказать ещё раз
        </button>
    `;

    elements.quickAddVoiceHabitPrompt = document.getElementById(
        "quickAddVoiceHabitPrompt"
    );

    if (typeof updateQuickAddSubmitLabel === "function") {
        updateQuickAddSubmitLabel();
    }
}

function applyVoiceParseResult(parsed) {
    if (!parsed || !isQuickAddOpen()) {
        return;
    }

    clearPendingVoiceHabit();
    lastVoiceParseResult = parsed;

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
    evaluateVoiceHabitPrompt();
}

function buildVoiceParserContext() {
    const habits =
        typeof getVoiceHabitMappings === "function"
            ? getVoiceHabitMappings()
            : [];

    return {
        accounts: (state.accounts || []).map((account) => ({
            id: account.id,
            name: account.name
        })),
        preferredAccountId: getPreferredTransactionAccountId(),
        today: getToday(),
        categories: QUICK_ADD_CATEGORIES,
        habits
    };
}

function showVoiceHabitPrompt(options) {
    const prompt = elements.quickAddVoiceHabitPrompt;

    if (!prompt) {
        return;
    }

    const { mode, phrase, category, previousCategory } = options;
    const isUpdate = mode === "update";

    prompt.classList.remove("hidden");
    prompt.innerHTML = `
        <div class="quick-add-voice__habit-card">
            <div class="quick-add-voice__habit-card-title">
                ${isUpdate ? "Обновить правило?" : "Запомнить на будущее?"}
            </div>
            <p class="quick-add-voice__habit-card-map">
                ${
                    isUpdate
                        ? `${escapeHTML(phrase)}:<br>${escapeHTML(previousCategory || "")} → ${escapeHTML(category)}`
                        : `${escapeHTML(phrase)} → ${escapeHTML(category)}`
                }
            </p>
            <button
                class="button button--primary button--small"
                type="button"
                data-voice-habit-action="${isUpdate ? "update" : "remember"}"
            >
                ${isUpdate ? "Обновить" : "Запомнить"}
            </button>
        </div>
    `;
}

function evaluateVoiceHabitPrompt() {
    if (!voiceDraftActive || !lastVoiceParseResult) {
        hideVoiceHabitPrompt();
        return;
    }

    const category = String(elements.quickAddCategory?.value || "").trim();

    if (!category) {
        hideVoiceHabitPrompt();
        pendingVoiceHabit = null;
        return;
    }

    const parsed = lastVoiceParseResult;
    const source = parsed.categorySource || "none";

    if (source === "explicit") {
        hideVoiceHabitPrompt();
        pendingVoiceHabit = null;
        return;
    }

    if (source === "habit" && parsed.habitMatch?.phrase) {
        const original = String(parsed.habitMatch.category || "").trim();

        if (
            original &&
            original.localeCompare(category, "ru", { sensitivity: "accent" }) !== 0
        ) {
            showVoiceHabitPrompt({
                mode: "update",
                phrase: parsed.habitMatch.phrase,
                category,
                previousCategory: original
            });
            return;
        }

        hideVoiceHabitPrompt();
        return;
    }

    const candidate = String(parsed.habitCandidate || "").trim();

    if (
        !candidate ||
        (typeof isVoiceHabitGenericPhrase === "function" &&
            isVoiceHabitGenericPhrase(candidate))
    ) {
        hideVoiceHabitPrompt();
        return;
    }

    if (source === "none") {
        showVoiceHabitPrompt({
            mode: "create",
            phrase: candidate,
            category
        });
    }
}

function acceptPendingVoiceHabitFromPrompt(mode) {
    if (!lastVoiceParseResult) {
        return;
    }

    const category = String(elements.quickAddCategory?.value || "").trim();
    const parsed = lastVoiceParseResult;

    if (!category) {
        return;
    }

    if (mode === "update" && parsed.habitMatch?.phrase) {
        pendingVoiceHabit = {
            mode: "update",
            phrase: parsed.habitMatch.phrase,
            category,
            previousCategory: parsed.habitMatch.category
        };
    } else if (parsed.habitCandidate) {
        pendingVoiceHabit = {
            mode: "create",
            phrase: parsed.habitCandidate,
            category
        };
    } else {
        return;
    }

    if (elements.quickAddVoiceHabitPrompt) {
        elements.quickAddVoiceHabitPrompt.innerHTML = `
            <p class="quick-add-voice__habit-pending">
                Правило будет сохранено после подтверждения операции.
            </p>
        `;
        elements.quickAddVoiceHabitPrompt.classList.remove("hidden");
    }
}

function commitPendingVoiceHabit() {
    if (!pendingVoiceHabit) {
        return;
    }

    if (typeof upsertVoiceHabit === "function") {
        upsertVoiceHabit(pendingVoiceHabit.phrase, pendingVoiceHabit.category);
    }

    pendingVoiceHabit = null;

    if (typeof renderVoiceHabitsPanel === "function") {
        renderVoiceHabitsPanel();
    }
}

function handleVoiceHabitPromptClick(event) {
    const button = event.target.closest("[data-voice-habit-action]");

    if (!button) {
        return;
    }

    const action = button.dataset.voiceHabitAction;

    if (action === "remember" || action === "update") {
        acceptPendingVoiceHabitFromPrompt(action === "update" ? "update" : "create");
    }
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
    clearPendingVoiceHabit();
    lastVoiceParseResult = null;

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
    if (
        event.target.closest("[data-voice-habit-action]") &&
        elements.quickAddVoicePreview?.contains(event.target)
    ) {
        handleVoiceHabitPromptClick(event);
        return;
    }

    const again = event.target.closest("#quickAddVoiceAgain, .quick-add-voice__again");

    if (!again || !elements.quickAddVoicePreview?.contains(again)) {
        return;
    }

    event.preventDefault();
    clearPendingVoiceHabit();
    startVoiceRecognition();
}

function renderVoiceHabitsPanel() {
    if (!elements.voiceHabitsList) {
        return;
    }

    const mappings =
        typeof getVoiceHabitMappings === "function" ? getVoiceHabitMappings() : [];

    if (elements.voiceHabitsEmpty) {
        elements.voiceHabitsEmpty.classList.toggle("hidden", mappings.length > 0);
    }

    if (elements.clearVoiceHabitsButton) {
        elements.clearVoiceHabitsButton.classList.toggle(
            "hidden",
            mappings.length === 0
        );
        elements.clearVoiceHabitsButton.disabled = mappings.length === 0;
    }

    elements.voiceHabitsList.innerHTML = "";

    if (mappings.length === 0) {
        return;
    }

    mappings
        .slice()
        .sort((first, second) =>
            String(first.phrase).localeCompare(String(second.phrase), "ru")
        )
        .forEach((habit) => {
            const row = document.createElement("div");
            row.className = "voice-habits__row";
            row.dataset.habitId = habit.id;
            row.innerHTML = `
                <div class="voice-habits__copy">
                    <strong class="voice-habits__phrase">${escapeHTML(habit.phrase)}</strong>
                    <span class="voice-habits__arrow">→ ${escapeHTML(habit.category)}</span>
                </div>
                <div class="mobile-action-menu voice-habits__menu">
                    <button
                        class="mobile-action-menu__toggle"
                        type="button"
                        data-action="toggle-mobile-menu"
                        aria-label="Действия с правилом"
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
                            data-action="delete-voice-habit"
                            data-id="${escapeHTML(habit.id)}"
                        >
                            Удалить
                        </button>
                    </div>
                </div>
            `;
            elements.voiceHabitsList.appendChild(row);
        });
}

function handleVoiceHabitsPanelClick(event) {
    const toggle = event.target.closest("[data-action='toggle-mobile-menu']");

    if (
        toggle &&
        elements.voiceHabitsList &&
        elements.voiceHabitsList.contains(toggle)
    ) {
        toggleMobileActionMenu(toggle);
        return;
    }

    const deleteButton = event.target.closest(
        "[data-action='delete-voice-habit']"
    );

    if (
        !deleteButton ||
        !elements.voiceHabitsList ||
        !elements.voiceHabitsList.contains(deleteButton)
    ) {
        return;
    }

    closeMobileActionMenus();
    const habitId = deleteButton.dataset.id;

    if (!habitId || typeof deleteVoiceHabit !== "function") {
        return;
    }

    const confirmed = window.confirm("Удалить это голосовое правило?");

    if (!confirmed) {
        return;
    }

    deleteVoiceHabit(habitId);
    renderVoiceHabitsPanel();
    showToast("Голосовое правило удалено.");
}

function handleClearVoiceHabitsClick() {
    const mappings =
        typeof getVoiceHabitMappings === "function" ? getVoiceHabitMappings() : [];

    if (mappings.length === 0) {
        return;
    }

    const confirmed = window.confirm(
        "Очистить весь словарь голосовых привычек? Операции и счета не изменятся."
    );

    if (!confirmed) {
        return;
    }

    if (typeof clearVoiceHabits === "function") {
        clearVoiceHabits();
    }

    renderVoiceHabitsPanel();
    showToast("Словарь голосовых привычек очищен.");
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

    renderVoiceHabitsPanel();

    if (!isSpeechRecognitionSupported()) {
        setVoiceUnsupportedState();
        return;
    }

    if (elements.quickAddVoiceButton) {
        elements.quickAddVoiceButton.disabled = false;
        elements.quickAddVoiceButton.removeAttribute("aria-disabled");
    }
}
