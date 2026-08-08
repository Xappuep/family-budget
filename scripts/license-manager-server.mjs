/**
 * Local License Manager — binds ONLY to 127.0.0.1.
 * Private signing key never leaves this process / never served over HTTP.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { exec } from "node:child_process";
import {
    loadSigningKeyFile,
    importPrivateSigningKey,
    issueFullAppLicense,
    readRegistry,
    appendLicenseToRegistry,
    normalizeInstallationId,
    isValidInstallationId
} from "./license-issue-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const secretsDir = path.join(root, ".local-secrets");
const keyPath = path.join(secretsDir, "license-signing-key.json");
const registryPath = path.join(secretsDir, "licenses-registry.json");
const htmlPath = path.join(__dirname, "license-manager.html");

const HOST = "127.0.0.1";
const PORT = 8787;
const SESSION_TOKEN = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString(
    "hex"
);

let signingMaterial;
try {
    signingMaterial = loadSigningKeyFile(keyPath);
} catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
}

const privateKey = await importPrivateSigningKey(signingMaterial.privateJwk);
const publicKid = signingMaterial.kid;

function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(payload)
    });
    res.end(payload);
}

function sendText(res, status, text, contentType) {
    res.writeHead(status, {
        "Content-Type": contentType,
        "Cache-Control": "no-store"
    });
    res.end(text);
}

function isLocalHostHeader(hostHeader) {
    const host = String(hostHeader || "").toLowerCase();
    return (
        host === `${HOST}:${PORT}` ||
        host === "localhost:" + PORT ||
        host === "[::1]:" + PORT
    );
}

function isAllowedOrigin(origin) {
    if (!origin) {
        return true;
    }
    const allowed = new Set([
        `http://${HOST}:${PORT}`,
        `http://localhost:${PORT}`,
        `http://[::1]:${PORT}`
    ]);
    return allowed.has(origin);
}

function assertManagerRequest(req, res, { requireJson, requireCsrf } = {}) {
    if (!isLocalHostHeader(req.headers.host)) {
        sendJson(res, 403, { ok: false, error: "Forbidden host" });
        return false;
    }

    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(origin)) {
        sendJson(res, 403, { ok: false, error: "Forbidden origin" });
        return false;
    }

    if (requireCsrf) {
        const token = req.headers["x-license-manager-token"];
        if (token !== SESSION_TOKEN) {
            sendJson(res, 403, { ok: false, error: "Invalid session token" });
            return false;
        }
    }

    if (requireJson) {
        const contentType = String(req.headers["content-type"] || "");
        if (!contentType.toLowerCase().includes("application/json")) {
            sendJson(res, 415, {
                ok: false,
                error: "Content-Type must be application/json"
            });
            return false;
        }
    }

    return true;
}

function readBody(req, limit = 64 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error("Body too large"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

function listLicensesForUi() {
    const registry = readRegistry(registryPath);
    return registry.licenses.map((item) => ({
        licenseId: item.licenseId,
        licenseIdShort: String(item.licenseId || "").slice(0, 8),
        installationId: item.installationId || "",
        installationIdShort: String(item.installationId || "").slice(0, 8),
        kid: item.kid,
        issuedAt: item.issuedAt,
        expiresAt: item.expiresAt,
        entitlements: item.entitlements,
        note: item.note || "",
        token: item.token
    }));
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

        if (req.method === "GET" && url.pathname === "/") {
            if (!assertManagerRequest(req, res)) {
                return;
            }
            const html = fs.readFileSync(htmlPath, "utf8");
            sendText(res, 200, html, "text/html; charset=utf-8");
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/session") {
            if (!assertManagerRequest(req, res)) {
                return;
            }
            sendJson(res, 200, {
                ok: true,
                sessionToken: SESSION_TOKEN,
                kid: publicKid,
                entitlements: ["FULL_APP"],
                licenseType: "Полная лицензия",
                warning:
                    "Signing key " +
                    publicKid +
                    " хранится только локально. " +
                    "Сделайте защищённую резервную копию файла " +
                    ".local-secrets/license-signing-key.json. " +
                    "Не публикуйте этот файл и не отправляйте его клиентам."
            });
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/licenses") {
            if (!assertManagerRequest(req, res, { requireCsrf: true })) {
                return;
            }
            sendJson(res, 200, {
                ok: true,
                licenses: listLicensesForUi()
            });
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/issue") {
            if (
                !assertManagerRequest(req, res, {
                    requireJson: true,
                    requireCsrf: true
                })
            ) {
                return;
            }

            let body;
            try {
                body = JSON.parse(await readBody(req));
            } catch (_error) {
                sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
                return;
            }

            const note =
                typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
            const installationIdRaw =
                typeof body.installationId === "string"
                    ? body.installationId
                    : "";

            if (!String(installationIdRaw).trim()) {
                sendJson(res, 400, {
                    ok: false,
                    error: "Укажите ID установки пользователя"
                });
                return;
            }

            if (!isValidInstallationId(installationIdRaw)) {
                sendJson(res, 400, {
                    ok: false,
                    error: "ID установки должен быть корректным UUID"
                });
                return;
            }

            const installationId = normalizeInstallationId(installationIdRaw);

            let issued;
            try {
                issued = await issueFullAppLicense({
                    privateKey,
                    kid: publicKid,
                    installationId
                });
            } catch (error) {
                sendJson(res, 400, {
                    ok: false,
                    error: error.message || "Не удалось выпустить лицензию"
                });
                return;
            }

            appendLicenseToRegistry(registryPath, {
                licenseId: issued.payload.licenseId,
                installationId: issued.payload.installationId,
                kid: issued.payload.kid,
                issuedAt: issued.payload.issuedAt,
                expiresAt: issued.payload.expiresAt,
                entitlements: issued.payload.entitlements,
                note,
                token: issued.token
            });

            sendJson(res, 200, {
                ok: true,
                licenseId: issued.payload.licenseId,
                licenseIdShort: issued.payload.licenseId.slice(0, 8),
                installationId: issued.payload.installationId,
                installationIdShort: issued.payload.installationId.slice(0, 8),
                issuedAt: issued.payload.issuedAt,
                entitlements: issued.payload.entitlements,
                note,
                token: issued.token
            });
            return;
        }

        sendJson(res, 404, { ok: false, error: "Not found" });
    } catch (error) {
        console.error("License manager error:", error && error.message ? error.message : error);
        sendJson(res, 500, { ok: false, error: "Internal error" });
    }
});

server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}/`;
    console.log(`License Manager listening on ${url}`);
    console.log(`Signing key: ${publicKid}`);
    console.log(
        "Private key is loaded locally and is never exposed via HTTP endpoints."
    );

    const openCmd =
        process.platform === "win32"
            ? `start "" "${url}"`
            : process.platform === "darwin"
              ? `open "${url}"`
              : `xdg-open "${url}"`;

    exec(openCmd, () => {});
});
