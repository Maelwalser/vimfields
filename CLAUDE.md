# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

VimFields is a Chrome Manifest V3 extension that adds Vim keybindings to every editable field in the browser — `<input>`, `<textarea>`, and `contenteditable` elements (including those inside shadow DOM).

## Commands

```bash
npm run build          # Bundle content/background/popup scripts into dist/ (esbuild)
npm run watch          # Rebuild on change (unminified, keeps source maps)
npm run typecheck      # tsc --noEmit
npm test               # Run all vitest tests once
npm run test:watch     # Vitest in watch mode
npm run test:dom       # Run only the jsdom-environment tests in tests/dom/
npx vitest run tests/vim/motions.test.ts   # Run one test file
npx vitest run -t "word forward"            # Run tests matching a name
```

Loading the extension in Chrome: `chrome://extensions` → Developer mode → Load unpacked → point at the repo root (not `dist/`). The `manifest.json` at the root references `dist/src/*.js`, so `npm run build` must have run first.

## Architecture

Three Chrome execution contexts exchange state through `chrome.runtime` messages defined in `src/types.ts` (`MessageType` enum):

- **Content script** (`src/content.ts`) — Injected into every page at `document_idle`. Owns the keyboard listener (capture-phase `keydown` on `document`), the currently focused adapter, the undo stack (per-element `WeakMap`), and a single `ModeManager`/`CommandParser`/`Registers` instance for the page.
- **Background service worker** (`src/background.ts`) — Persists `VimConfig` via `chrome.storage.sync`, handles the `Alt+V` toggle command, and broadcasts config changes to all tabs.
- **Popup** (`popup/popup.ts`) — Writes config changes through the background worker; never talks to content scripts directly.

The content script is organized into two decoupled layers:

**`src/vim/`** — Pure logic, no DOM. All functions take `(text, cursor, …)` and return a new `{ text, cursor }`. This is what the vitest tests in `tests/vim/` exercise directly without jsdom.
- `command-parser.ts` — Buffers keystrokes and yields a `ParseResult` (`pending` | `complete` | `action` | `invalid`) for the grammar `[count][operator][count][motion]` plus single-key actions (`i`, `a`, `x`, `p`, `v`, …).
- `motions.ts`, `operators.ts` — Implement `h/j/k/l/w/b/e/0/$/G/f/t`, `d/c/y`, `x`, `r`, `p/P`, `J`, visual-mode operators.
- `mode-manager.ts` — State machine for `Normal | Insert | Visual | VisualLine` with listener callbacks.
- `registers.ts` — Vim registers (including linewise flag used by `p`/`P`).

**`src/dom/`** — Adapters that reconcile the pure logic with browser reality.
- `text-adapter.ts` — `createTextAdapter(element)` returns a uniform interface (`getText`, `setText`, `getCursorPosition`, `setSelectionRange`, `offsetToLineCol`, …) over `HTMLInputElement`, `HTMLTextAreaElement`, and `contenteditable`. `setText` uses the native value setter (`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')`) and dispatches synthetic `input`/`change` events so React controlled inputs and Vue `v-model` stay in sync.
- `field-detector.ts` — `MutationObserver` that scans `document.body` plus every `shadowRoot` it encounters, both at startup and for future additions. Tracks attached elements in a `WeakSet`.
- `cursor-renderer.ts` — Draws the block cursor overlay and updates on text/mode change.
- `status-bar.ts` — Renders the `NORMAL`/`INSERT`/`VISUAL` indicator and command buffer.

### Key flow in `content.ts`

`handleKeyDown` (capture phase) branches on `modeManager.mode`. Insert mode passes almost everything through to the browser but intercepts `Escape`, `Ctrl+C`, and the `escapeRemap` sequence (default `jk` — when it fires, the first remap character that was already typed into the field is deleted). Normal and Visual modes `preventDefault`/`stopPropagation`, map the event via `mapKey`, then dispatch to `handleNormalKey` (via `CommandParser`) or `handleVisualKey` (direct dispatch using `visualAnchor`). `processParseResult` converts a completed `Command` into an edit using the pure operators, snapshots undo via `pushUndo` before mutations, and calls `activeAdapter.setText`/`setCursorPosition`.

## Testing Conventions

- `tests/vim/*` runs in the default node environment and tests pure text transforms — no jsdom required.
- `tests/dom/*` is routed to the `jsdom` environment via `environmentMatchGlobs` in `vitest.config.ts`.
- Add new pure-logic tests to `tests/vim/`; only use `tests/dom/` when real DOM semantics (selection, events, contenteditable) are under test.

## Build Details

- Entrypoints (`src/content.ts`, `src/background.ts`, `popup/popup.ts`) are bundled to `dist/` as ESM targeting `chrome120`. The background worker is loaded as a module (`"type": "module"` in the manifest).
- `tsconfig.json` has `noEmit: true` — TypeScript is only used for type checking; esbuild does the emitting.
- Source maps are emitted in both modes; `minify` is disabled only in watch mode.

## Gotchas

- The content script runs on `<all_urls>` at `document_idle`. When editing `content.ts`, assume the page's own scripts may already have attached listeners — always use capture phase and call `stopPropagation` before the site's handlers see the key.
- `setText` MUST go through the native setter (see `text-adapter.ts`) or React will discard the change on its next render.
- Shadow DOM traversal in `FieldDetector` recurses into every element's `shadowRoot`. When adding a new editable-element heuristic, update `isEditableField` — not the querySelector — so shadow DOM fields keep working.
- `content.ts` keeps a single `activeAdapter` per page. If you add per-field state, use a `WeakMap<HTMLElement, …>` like `undoStacks` to avoid leaks.
