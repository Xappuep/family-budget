/**
 * Generate ECDSA P-256 license signing keypair for local signing only.
 * Private key stays under .local-secrets/ (gitignored).
 * Public key is written to tracked license-public-keys.js.
 *
 * Usage: node scripts/init-license-signing-key.mjs [--force]
 */

import { webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const secretsDir = path.join(root, ".local-secrets");
const keyPath = path.join(secretsDir, "license-signing-key.json");
const publicKeysPath = path.join(root, "license-public-keys.js");
const force = process.argv.includes("--force");
const kid = "K1";

if (fs.existsSync(keyPath) && !force) {
    console.error(
        `Refusing to overwrite existing signing key at ${keyPath}. Pass --force to regenerate.`
    );
    process.exit(1);
}

const subtle = webcrypto.subtle;
const keyPair = await subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
);

const privateJwk = await subtle.exportKey("jwk", keyPair.privateKey);
const publicJwk = await subtle.exportKey("jwk", keyPair.publicKey);
const createdAt = new Date().toISOString();

const publicJwkWithoutD = { ...publicJwk };
delete publicJwkWithoutD.d;

fs.mkdirSync(secretsDir, { recursive: true });
fs.writeFileSync(
    keyPath,
    JSON.stringify({ kid, privateJwk, publicJwk, createdAt }, null, 2) + "\n",
    "utf8"
);

const publicJwkLiteral = JSON.stringify(publicJwkWithoutD, null, 4)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `    ${line}`))
    .join("\n");

const publicKeysSource =
    `"use strict";\n` +
    `\n` +
    `/** Public JWKs for FB2 license token verification (no private material). */\n` +
    `const LICENSE_PUBLIC_KEYS = Object.freeze({\n` +
    `    ${kid}: Object.freeze(${publicJwkLiteral})\n` +
    `});\n`;

fs.writeFileSync(publicKeysPath, publicKeysSource, "utf8");

const keyFileExists = fs.existsSync(keyPath);

console.log(
    JSON.stringify(
        {
            kid,
            keyFileExists,
            keyFilePath: path.relative(root, keyPath).split(path.sep).join("/"),
            publicJwk: publicJwkWithoutD
        },
        null,
        2
    )
);
