/* =========================================================
   Service Worker — Семейный бюджет (Этап 7 / PWA)
   Scope: ./ (только каталог приложения на GitHub Pages)
   ========================================================= */

const RELEASE = "20260808-8";
const CACHE_PREFIX = "family-budget-";
const CACHE_NAME = `${CACHE_PREFIX}shell-${RELEASE}`;

const APP_SHELL = [
    "./",
    "./index.html",
    `./styles.css?v=${RELEASE}`,
    `./constants.js?v=${RELEASE}`,
    `./state.js?v=${RELEASE}`,
    `./money.js?v=${RELEASE}`,
    `./dates.js?v=${RELEASE}`,
    `./formatting.js?v=${RELEASE}`,
    `./ui.js?v=${RELEASE}`,
    `./calculations.js?v=${RELEASE}`,
    `./storage.js?v=${RELEASE}`,
    `./accounts.js?v=${RELEASE}`,
    `./transactions.js?v=${RELEASE}`,
    `./voice-parser.js?v=${RELEASE}`,
    `./voice-habits.js?v=${RELEASE}`,
    `./voice.js?v=${RELEASE}`,
    `./goals.js?v=${RELEASE}`,
    `./contributions.js?v=${RELEASE}`,
    `./analytics.js?v=${RELEASE}`,
    `./backup.js?v=${RELEASE}`,
    `./pwa.js?v=${RELEASE}`,
    `./app.js?v=${RELEASE}`,
    "./manifest.webmanifest",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-maskable-512.png",
    "./icons/apple-touch-icon.png",
    "./icons/app-icon.svg"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            // Fail installation if any required shell asset is missing.
            await cache.addAll(APP_SHELL);
        })()
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys.map((key) => {
                    if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                    return undefined;
                })
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

function isSameOrigin(request) {
    try {
        return new URL(request.url).origin === self.location.origin;
    } catch (_error) {
        return false;
    }
}

function isNavigationRequest(request) {
    return (
        request.mode === "navigate" ||
        (request.method === "GET" &&
            request.headers.get("accept") &&
            request.headers.get("accept").includes("text/html"))
    );
}

function isVersionedStaticAsset(url) {
    return (
        url.searchParams.has("v") &&
        (url.pathname.endsWith(".css") ||
            url.pathname.endsWith(".js") ||
            url.pathname.endsWith(".png") ||
            url.pathname.endsWith(".svg") ||
            url.pathname.endsWith(".webmanifest") ||
            url.pathname.endsWith(".ico"))
    );
}

function isShellStaticAsset(url) {
    const path = url.pathname;
    return (
        path.endsWith(".css") ||
        path.endsWith(".js") ||
        path.endsWith(".png") ||
        path.endsWith(".svg") ||
        path.endsWith(".webmanifest") ||
        path.endsWith("/icons/icon-192.png") ||
        path.endsWith("/icons/icon-512.png") ||
        path.endsWith("/icons/icon-maskable-512.png") ||
        path.endsWith("/icons/apple-touch-icon.png") ||
        path.endsWith("/icons/app-icon.svg") ||
        path.endsWith("/manifest.webmanifest")
    );
}

async function networkFirstNavigation(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put("./index.html", networkResponse.clone());
            return networkResponse;
        }
    } catch (_error) {
        // Fall through to cache.
    }

    const cached =
        (await caches.match(request)) ||
        (await caches.match("./index.html")) ||
        (await caches.match("./"));

    if (cached) {
        return cached;
    }

    return new Response("Офлайн. Приложение недоступно без кэша.", {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
}

async function cacheFirstAsset(request) {
    const cached = await caches.match(request);
    if (cached) {
        return cached;
    }

    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
    }
    return networkResponse;
}

self.addEventListener("fetch", (event) => {
    const { request } = event;

    if (request.method !== "GET") {
        return;
    }

    if (!isSameOrigin(request)) {
        return;
    }

    // Never intercept the service worker script itself.
    if (request.url.includes("service-worker.js")) {
        return;
    }

    if (isNavigationRequest(request)) {
        event.respondWith(networkFirstNavigation(request));
        return;
    }

    let url;
    try {
        url = new URL(request.url);
    } catch (_error) {
        return;
    }

    if (isVersionedStaticAsset(url) || isShellStaticAsset(url)) {
        event.respondWith(cacheFirstAsset(request));
    }
});
