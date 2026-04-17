#!/usr/bin/env node
/**
 * Produce a Chrome Web Store-ready zip: manifest.json, dist/, icons/, popup/.
 * Excludes Vivaldi mod output, source maps, tests, node_modules, and the repo
 * metadata.
 *
 * Usage: node scripts/package.mjs [--out path.zip]
 */

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const outArgIdx = process.argv.indexOf("--out");
const outPath = outArgIdx >= 0
  ? resolve(process.cwd(), process.argv[outArgIdx + 1])
  : resolve(root, `vimfields-${pkg.version}.zip`);

if (existsSync(outPath)) rmSync(outPath);

// Only ship what the installed extension actually reads.
const include = [
  "manifest.json",
  "dist/src/content.js",
  "dist/src/background.js",
  "dist/popup/popup.js",
  "popup/popup.html",
  "popup/popup.css",
  "icons",
  "LICENSE",
  "PRIVACY.md",
];

for (const p of include) {
  if (!existsSync(resolve(root, p))) {
    console.error(`[package] Missing: ${p} — run \`npm run build\` first.`);
    process.exit(1);
  }
}

// Delegate to the system `zip` — fast, universally available on Linux/macOS.
try {
  execFileSync("zip", ["-r", "-X", "-q", outPath, ...include], {
    cwd: root,
    stdio: "inherit",
  });
} catch (err) {
  console.error("[package] zip command failed — is `zip` installed?");
  console.error(err.message);
  process.exit(1);
}

console.log(`[package] Wrote ${outPath}`);
