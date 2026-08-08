"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(file) {
    return fs.readFileSync(path.join(ROOT, file), "utf8");
}

test("PWA release tokens stay synchronized across index and service worker", () => {
    const indexHtml = read("index.html");
    const serviceWorker = read("service-worker.js");

    const releaseMatch = serviceWorker.match(/const RELEASE = "([^"]+)"/);
    assert.ok(releaseMatch, "service-worker.js must define RELEASE");
    const release = releaseMatch[1];

    assert.match(release, /^\d{8}-\d+$/);
    assert.ok(
        serviceWorker.includes('CACHE_PREFIX = "family-budget-"') &&
            serviceWorker.includes("shell-${RELEASE}"),
        "cache name must use family-budget-shell prefix via CACHE_PREFIX"
    );

    const assetVersions = [
        ...indexHtml.matchAll(/\?v=(\d{8}-\d+)/g)
    ].map((match) => match[1]);

    assert.ok(assetVersions.length > 10, "index.html must version local assets");
    assert.ok(
        assetVersions.every((version) => version === release),
        `all index.html ?v tokens must equal RELEASE (${release}), got ${[
            ...new Set(assetVersions)
        ].join(", ")}`
    );

    const shellBlock = serviceWorker.slice(
        serviceWorker.indexOf("const APP_SHELL"),
        serviceWorker.indexOf("];", serviceWorker.indexOf("const APP_SHELL")) + 2
    );

    assert.ok(shellBlock.includes("${RELEASE}"), "APP_SHELL must use RELEASE");

    const requiredShellFiles = [
        "access-control.js",
        "access-ui.js",
        "legal.js",
        "indexed-db.js",
        "storage.js",
        "pwa.js",
        "app.js"
    ];

    requiredShellFiles.forEach((file) => {
        assert.ok(
            shellBlock.includes(file),
            `APP_SHELL must include ${file}`
        );
        assert.ok(
            indexHtml.includes(`${file}?v=${release}`),
            `index.html must load ${file}?v=${release}`
        );
    });

    assert.ok(
        read("constants.js").includes('APP_DISPLAY_VERSION = "8.1"'),
        "APP_DISPLAY_VERSION must be 8.1"
    );
});
