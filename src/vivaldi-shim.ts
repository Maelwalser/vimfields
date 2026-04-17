/**
 * Minimal shim for `chrome.runtime` so content.ts can run in Vivaldi's UI
 * (browser.html) as a custom mod script, outside any extension context.
 *
 * Only the two surfaces content.ts touches are stubbed:
 *   • chrome.runtime.onMessage.addListener — registered at module load
 *   • chrome.runtime.sendMessage            — awaited inside a try/catch
 *
 * If a real chrome.runtime already exists (e.g. Vivaldi exposes one in the
 * UI context), we leave it alone.
 */

type Listener = (...args: unknown[]) => void;

// Go through `any` — @types/chrome declares globalThis.chrome with its full
// extension surface, which our minimal shim can't (and shouldn't) satisfy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = globalThis as any;

if (!w.chrome) w.chrome = {};
if (!w.chrome.runtime) w.chrome.runtime = {};

const runtime = w.chrome.runtime;

if (!runtime.onMessage || typeof runtime.onMessage.addListener !== 'function') {
  const listeners = new Set<Listener>();
  runtime.onMessage = {
    addListener: (fn: Listener) => { listeners.add(fn); },
    removeListener: (fn: Listener) => { listeners.delete(fn); },
  };
}

if (typeof runtime.sendMessage !== 'function') {
  runtime.sendMessage = () =>
    Promise.reject(new Error('vimfields: no extension context (Vivaldi mod)'));
}
