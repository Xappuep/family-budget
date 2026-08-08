/* =========================================================
   PWA — регистрация SW, install UX, offline/update (Этап 7)
   ========================================================= */

const PWA_THEME_COLORS = {
    dark: "#080d16",
    light: "#eef3f9"
};

let deferredInstallPrompt = null;
let pwaUpdateRegistration = null;
let pwaReloadingForUpdate = false;
let pwaUserConfirmedUpdate = false;
let pwaUpdateBannerVisible = false;

function isPwaStandalone() {
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
    );
}

function getThemeColorMeta() {
    return document.getElementById("themeColorMeta");
}

function syncPwaThemeColor(theme) {
    const meta = getThemeColorMeta();
    if (!meta) {
        return;
    }

    const nextTheme = theme === "light" ? "light" : "dark";
    meta.setAttribute("content", PWA_THEME_COLORS[nextTheme]);
}

function ensurePwaUpdateBanner() {
    let banner = document.getElementById("pwaUpdateBanner");

    if (banner) {
        return banner;
    }

    banner = document.createElement("div");
    banner.id = "pwaUpdateBanner";
    banner.className = "pwa-update-banner hidden";
    banner.setAttribute("role", "status");
    banner.innerHTML = `
        <div class="pwa-update-banner__body">
            <strong class="pwa-update-banner__title">Доступно обновление</strong>
            <p class="pwa-update-banner__text">Установить новую версию сейчас?</p>
            <div class="pwa-update-banner__actions">
                <button type="button" class="button button--primary" id="pwaUpdateNowButton">
                    Обновить
                </button>
                <button type="button" class="button button--secondary" id="pwaUpdateLaterButton">
                    Позже
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(banner);

    document
        .getElementById("pwaUpdateNowButton")
        ?.addEventListener("click", () => {
            applyWaitingServiceWorker();
        });

    document
        .getElementById("pwaUpdateLaterButton")
        ?.addEventListener("click", () => {
            hidePwaUpdateBanner();
        });

    return banner;
}

function showPwaUpdateBanner() {
    if (pwaUpdateBannerVisible) {
        return;
    }

    const banner = ensurePwaUpdateBanner();
    banner.classList.remove("hidden");
    pwaUpdateBannerVisible = true;
}

function hidePwaUpdateBanner() {
    const banner = document.getElementById("pwaUpdateBanner");
    if (banner) {
        banner.classList.add("hidden");
    }
    pwaUpdateBannerVisible = false;
}

function applyWaitingServiceWorker() {
    const waiting = pwaUpdateRegistration?.waiting;

    if (!waiting) {
        hidePwaUpdateBanner();
        return;
    }

    pwaUserConfirmedUpdate = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
}

function promptForPwaUpdate(registration) {
    if (!registration?.waiting) {
        return;
    }

    // First install: no controller yet — do not show update UI.
    if (!navigator.serviceWorker.controller) {
        return;
    }

    pwaUpdateRegistration = registration;
    showPwaUpdateBanner();
}

function watchInstallingWorker(registration, worker) {
    if (!worker) {
        return;
    }

    worker.addEventListener("statechange", () => {
        if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
        ) {
            pwaUpdateRegistration = registration;
            showPwaUpdateBanner();
        }
    });
}

function updatePwaInstallUi() {
    const card = document.getElementById("pwaInstallCard");
    const button = document.getElementById("pwaInstallButton");
    const status = document.getElementById("pwaInstallStatus");
    const hint = document.getElementById("pwaInstallHint");

    if (!card) {
        return;
    }

    const standalone = isPwaStandalone();
    const canInstall = Boolean(deferredInstallPrompt) && !standalone;

    if (button) {
        button.classList.toggle("hidden", !canInstall);
    }

    if (status) {
        const showInstalled = standalone;
        status.classList.toggle("hidden", !showInstalled);
    }

    if (hint) {
        const showHint = !standalone && !canInstall;
        hint.classList.toggle("hidden", !showHint);
    }
}

async function handlePwaInstallClick(event) {
    event.preventDefault();

    if (!deferredInstallPrompt) {
        updatePwaInstallUi();
        return;
    }

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    updatePwaInstallUi();

    try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
    } catch (_error) {
        // Browser may reject; fall back to manual install hint.
    }

    updatePwaInstallUi();
}

function setupPwaInstallListeners() {
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        updatePwaInstallUi();
    });

    window.addEventListener("appinstalled", () => {
        deferredInstallPrompt = null;
        updatePwaInstallUi();
        if (typeof showToast === "function") {
            showToast("Приложение установлено", "success");
        }
    });

    const button = document.getElementById("pwaInstallButton");
    if (button) {
        button.addEventListener("click", handlePwaInstallClick);
    }

    const media = window.matchMedia("(display-mode: standalone)");
    if (typeof media.addEventListener === "function") {
        media.addEventListener("change", updatePwaInstallUi);
    } else if (typeof media.addListener === "function") {
        media.addListener(updatePwaInstallUi);
    }

    updatePwaInstallUi();
}

function setupPwaConnectivityToasts() {
    window.addEventListener("offline", () => {
        if (typeof showToast === "function") {
            showToast(
                "Нет подключения к интернету. Локальные данные доступны.",
                "error"
            );
        }
    });

    window.addEventListener("online", () => {
        if (typeof showToast === "function") {
            showToast("Соединение восстановлено.", "success");
        }
    });
}

async function registerPwaServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.register(
            "./service-worker.js",
            {
                scope: "./",
                updateViaCache: "none"
            }
        );

        pwaUpdateRegistration = registration;

        if (registration.waiting) {
            promptForPwaUpdate(registration);
        }

        registration.addEventListener("updatefound", () => {
            watchInstallingWorker(registration, registration.installing);
        });

        try {
            await registration.update();
        } catch (_error) {
            // Offline or transient network — ignore.
        }

        return registration;
    } catch (error) {
        console.warn("PWA service worker registration failed:", error);
        return null;
    }
}

function setupPwaControllerChangeReload() {
    if (!("serviceWorker" in navigator)) {
        return;
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
        // Reload only after explicit user confirmation — not on first claim.
        if (!pwaUserConfirmedUpdate || pwaReloadingForUpdate) {
            return;
        }
        pwaReloadingForUpdate = true;
        window.location.reload();
    });
}

function initPwa() {
    syncPwaThemeColor(
        typeof getCurrentTheme === "function" ? getCurrentTheme() : "dark"
    );
    setupPwaInstallListeners();
    setupPwaConnectivityToasts();
    setupPwaControllerChangeReload();
    ensurePwaUpdateBanner();
    registerPwaServiceWorker();
}
