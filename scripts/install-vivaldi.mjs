#!/usr/bin/env node
/**
 * Installs dist/vivaldi/custom.js into Vivaldi's resources directory and
 * patches browser.html to load it. Idempotent — safe to re-run after Vivaldi
 * updates (which overwrite browser.html).
 *
 * Usage:
 *   node scripts/install-vivaldi.mjs            # install
 *   node scripts/install-vivaldi.mjs --uninstall
 *   node scripts/install-vivaldi.mjs --dir=/path/to/resources/vivaldi
 *
 * Writing into the Vivaldi install dir usually needs elevation:
 *   Linux/macOS: sudo -E node scripts/install-vivaldi.mjs
 *   Windows:     run from an Administrator terminal
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const BUNDLE = join(REPO_ROOT, 'dist/vivaldi/custom.js');
const BUNDLE_MAP = join(REPO_ROOT, 'dist/vivaldi/custom.js.map');

const MARKER_START = '<!-- vimfields:start -->';
const MARKER_END = '<!-- vimfields:end -->';
const SNIPPET = `${MARKER_START}\n<script src="vimfields/custom.js"></script>\n${MARKER_END}\n`;

const args = process.argv.slice(2);
const uninstall = args.includes('--uninstall');
const dirArg = args.find((a) => a.startsWith('--dir='))?.slice('--dir='.length);

function candidatePaths() {
  const p = platform();
  if (p === 'linux') {
    return [
      '/opt/vivaldi/resources/vivaldi',
      '/opt/vivaldi-snapshot/resources/vivaldi',
      '/usr/share/vivaldi/resources/vivaldi',
      '/usr/lib/vivaldi/resources/vivaldi',
      process.env.HOME && `${process.env.HOME}/.local/share/vivaldi/resources/vivaldi`,
    ].filter(Boolean);
  }
  if (p === 'darwin') {
    const roots = [
      '/Applications/Vivaldi.app/Contents/Versioned',
      process.env.HOME && `${process.env.HOME}/Applications/Vivaldi.app/Contents/Versioned`,
    ].filter(Boolean);
    const out = [];
    for (const root of roots) {
      if (!existsSync(root)) continue;
      for (const version of readdirSync(root)) {
        const candidate = join(root, version, 'Resources', 'vivaldi');
        if (existsSync(candidate)) out.push(candidate);
      }
    }
    return out;
  }
  if (p === 'win32') {
    const roots = [
      'C:\\Program Files\\Vivaldi\\Application',
      'C:\\Program Files (x86)\\Vivaldi\\Application',
      process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Vivaldi\\Application`,
    ].filter(Boolean);
    const out = [];
    for (const root of roots) {
      if (!existsSync(root)) continue;
      for (const entry of readdirSync(root)) {
        if (!/^\d/.test(entry)) continue;
        const candidate = join(root, entry, 'resources', 'vivaldi');
        if (existsSync(candidate)) out.push(candidate);
      }
    }
    return out;
  }
  return [];
}

function findResourcesDir() {
  if (dirArg) {
    if (!existsSync(dirArg)) {
      throw new Error(`--dir=${dirArg} does not exist`);
    }
    return dirArg;
  }
  const found = candidatePaths().filter(existsSync);
  if (found.length === 0) {
    throw new Error(
      'Could not find Vivaldi install. Pass --dir=<path-to-resources/vivaldi>',
    );
  }
  if (found.length > 1) {
    console.log('Multiple Vivaldi installs found; using first:');
    for (const p of found) console.log(`  ${p}`);
  }
  return found[0];
}

/** Remove any previous block (idempotent), then optionally re-insert before </body>. */
function patchBrowserHtml(browserHtml, insert) {
  const raw = readFileSync(browserHtml, 'utf8');
  const blockRe = new RegExp(
    `\\s*${MARKER_START}[\\s\\S]*?${MARKER_END}\\s*`,
    'g',
  );
  const cleaned = raw.replace(blockRe, '\n');
  if (!insert) return cleaned;

  const idx = cleaned.lastIndexOf('</body>');
  if (idx < 0) {
    throw new Error(`No </body> in ${browserHtml} — unexpected format`);
  }
  return cleaned.slice(0, idx) + SNIPPET + cleaned.slice(idx);
}

function main() {
  if (!uninstall && !existsSync(BUNDLE)) {
    throw new Error(`Bundle missing: ${BUNDLE}\n  Run \`npm run build\` first.`);
  }

  const resourcesDir = findResourcesDir();
  console.log(`Vivaldi resources: ${resourcesDir}`);

  const targetDir = join(resourcesDir, 'vimfields');
  const targetFile = join(targetDir, 'custom.js');
  const targetMap = join(targetDir, 'custom.js.map');

  // Modern Vivaldi uses window.html for the main UI; older builds used
  // browser.html. Patch whichever exists.
  const htmlCandidates = ['window.html', 'browser.html'];
  const browserHtml = htmlCandidates
    .map((name) => join(resourcesDir, name))
    .find(existsSync);
  if (!browserHtml) {
    throw new Error(
      `No UI entry file found in ${resourcesDir} ` +
        `(looked for: ${htmlCandidates.join(', ')})`,
    );
  }

  if (uninstall) {
    writeFileSync(browserHtml, patchBrowserHtml(browserHtml, false));
    console.log(`Unpatched ${browserHtml}`);
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true });
      console.log(`Removed ${targetDir}`);
    }
    console.log('Uninstalled. Restart Vivaldi to pick up the change.');
    return;
  }

  mkdirSync(targetDir, { recursive: true });
  copyFileSync(BUNDLE, targetFile);
  console.log(`Copied  ${targetFile}`);
  if (existsSync(BUNDLE_MAP)) {
    copyFileSync(BUNDLE_MAP, targetMap);
    console.log(`Copied  ${targetMap}`);
  }

  writeFileSync(browserHtml, patchBrowserHtml(browserHtml, true));
  console.log(`Patched ${browserHtml}`);
  console.log('\nDone. Fully quit and restart Vivaldi to load the mod.');
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\nvimfields install failed: ${msg}`);
  if (err && (err.code === 'EACCES' || err.code === 'EPERM')) {
    console.error('  → Re-run with sudo (Linux/macOS) or Administrator (Windows).');
  }
  process.exit(1);
}
