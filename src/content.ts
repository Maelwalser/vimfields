/**
 * Content script entry point.
 *
 * Discovers editable fields, attaches Vim key handling,
 * renders the block cursor, selection highlight, and status bar.
 */

import { MessageType, type ExtensionMessage, type VimConfig } from './types';
import { DEFAULT_CONFIG } from './constants';
import { FieldDetector } from './dom/field-detector';
import {
  createTextAdapter,
  ContentEditableAdapter,
  applyMonospaceFont,
  restoreFont,
  type TextAdapter,
} from './dom/text-adapter';
import { CursorRenderer } from './dom/cursor-renderer';
import { StatusBar } from './dom/status-bar';
import { isHostDisabled } from './dom/site-matcher';
import { ModeManager } from './vim/mode-manager';
import { VimMode as VimModeEnum } from './vim/types';
import { CommandParser, type ParseResult } from './vim/command-parser';
import { executeMotion, applyMotionRepeated } from './vim/motions';
import { textObjectRange } from './vim/text-objects';
import { Registers } from './vim/registers';
import {
  deleteOp, changeOp, yankOp, deleteChar, replaceChar,
  pasteAfter, pasteBefore, joinLines,
  deleteSelection, yankSelection, changeSelection,
  caseOp, toggleCaseChar, deleteCharBefore, caseSelection,
  lineStartOf, lineEndOf,
} from './vim/operators';
import type { Command } from './vim/types';

// ── State ──────────────────────────────────────────────────────────

let config: VimConfig = { ...DEFAULT_CONFIG };
let activeAdapter: TextAdapter | null = null;
let activeElement: HTMLElement | null = null;
let visualAnchor = 0;

const modeManager = new ModeManager();
const parser = new CommandParser();
const registers = new Registers();
const cursorRenderer = new CursorRenderer();
const statusBar = new StatusBar();
const fieldDetector = new FieldDetector(onFieldFound);

// Undo stack per element (simple — stores full text snapshots)
const undoStacks = new WeakMap<HTMLElement, string[]>();

function pushUndo(el: HTMLElement, text: string): void {
  let stack = undoStacks.get(el);
  if (!stack) {
    stack = [];
    undoStacks.set(el, stack);
  }
  stack.push(text);
  if (stack.length > 100) stack.shift();
}

function popUndo(el: HTMLElement): string | undefined {
  return undoStacks.get(el)?.pop();
}

// ── Escape remap tracking ──────────────────────────────────────────

let escapeRemapBuffer = '';
let escapeRemapTimeout: ReturnType<typeof setTimeout> | null = null;

// ── Clipboard ──────────────────────────────────────────────────────

/**
 * Write text to the system clipboard so it's pastable in other tabs/apps.
 * Falls back to a hidden-textarea + execCommand trick when the async API
 * is unavailable (old Chrome, non-secure context, etc.).
 */
function copyToClipboard(text: string): void {
  if (!text) return;

  const asyncWrite = navigator.clipboard?.writeText;
  if (asyncWrite) {
    asyncWrite.call(navigator.clipboard, text).catch(() => execCommandCopy(text));
    return;
  }
  execCommandCopy(text);
}

function execCommandCopy(text: string): void {
  const active = document.activeElement as HTMLElement | null;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '-9999px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);

  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    document.execCommand('copy');
  } catch {
    // Best-effort — internal register still holds the text
  } finally {
    ta.remove();
    active?.focus();
  }
}

/**
 * Read the system clipboard, returning null if unavailable or denied.
 * Called before p/P so yanks made in other tabs can be pasted here.
 */
async function readClipboard(): Promise<string | null> {
  try {
    const text = await navigator.clipboard?.readText();
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

/**
 * Sync the unnamed register from the system clipboard when they diverge,
 * so cross-tab / cross-app copies are pasteable. Clipboard text ending in
 * a newline is treated as a linewise yank (matching Vim's convention).
 */
async function syncRegisterFromClipboard(): Promise<void> {
  const clip = await readClipboard();
  if (clip == null) return;
  const current = registers.get('"').text;
  if (clip === current) return;
  const linewise = clip.endsWith('\n');
  registers.recordYank(clip, linewise);
}

/** Paste from the system clipboard (falling back to the unnamed register). */
async function doPaste(after: boolean): Promise<void> {
  if (!activeAdapter || !activeElement) return;
  const adapter = activeAdapter;
  const element = activeElement;

  await syncRegisterFromClipboard();

  // The user may have blurred or refocused a different field while the
  // clipboard read was in flight — bail out if the target changed.
  if (activeAdapter !== adapter || activeElement !== element) return;

  const text = adapter.getText();
  const cursor = adapter.getCursorPosition();
  pushUndo(element, text);

  const edit = after
    ? pasteAfter(text, cursor, registers)
    : pasteBefore(text, cursor, registers);

  adapter.setText(edit.text);
  adapter.setCursorPosition(edit.cursor);
  clampNormalCursor();
  cursorRenderer.update();
}

// ── Visual mode motion buffer ──────────────────────────────────────

let visualBuffer = '';

// ── Last f/F/t/T — for ; and , repeat ──────────────────────────────

let lastCharMotion: { motion: 'f' | 'F' | 't' | 'T'; char: string } | null = null;

/** Invert an f/F/t/T pair (used by `,`). */
function invertCharMotion(m: 'f' | 'F' | 't' | 'T'): 'f' | 'F' | 't' | 'T' {
  return ({ f: 'F', F: 'f', t: 'T', T: 't' } as const)[m];
}

/**
 * Resolve `;` / `,` against the stored last f/F/t/T, producing the actual
 * motion+char to execute. Returns null if there is no prior motion.
 */
function resolveCharRepeat(key: ';' | ','): { motion: string; char: string } | null {
  if (!lastCharMotion) return null;
  const motion = key === ';' ? lastCharMotion.motion : invertCharMotion(lastCharMotion.motion);
  return { motion, char: lastCharMotion.char };
}

// ── Helpers ────────────────────────────────────────────────────────

function toRendererMode(mode: VimModeEnum): 'normal' | 'insert' | 'visual' {
  switch (mode) {
    case VimModeEnum.Normal: return 'normal';
    case VimModeEnum.Insert: return 'insert';
    case VimModeEnum.Visual:
    case VimModeEnum.VisualLine: return 'visual';
  }
}

function isSiteDisabled(): boolean {
  return isHostDisabled(window.location.hostname, config.disabledSites);
}

// ── Field attachment ───────────────────────────────────────────────

function onFieldFound(element: HTMLElement): void {
  element.addEventListener('focus', () => onFieldFocus(element));
  element.addEventListener('blur', () => onFieldBlur(element));
}

function onFieldFocus(element: HTMLElement): void {
  if (!config.enabled || isSiteDisabled()) return;

  const adapter = createTextAdapter(element);
  if (!adapter) return;

  activeAdapter = adapter;
  activeElement = element;

  if (config.useMonospaceFont) {
    applyMonospaceFont(element);
  }

  // Always start in insert mode on focus (user was already typing)
  modeManager.enterInsert();
  const mode = toRendererMode(modeManager.mode);
  cursorRenderer.attach(adapter);
  cursorRenderer.setMode(mode);
  statusBar.attach(element);
  statusBar.setMode(mode);
  parser.reset();
  escapeRemapBuffer = '';
  visualBuffer = '';
}

function onFieldBlur(element: HTMLElement): void {
  restoreFont(element);
  cursorRenderer.detach();
  statusBar.detach();
  activeAdapter = null;
  activeElement = null;
  parser.reset();
  escapeRemapBuffer = '';
  visualBuffer = '';
}

// ── Key handling ───────────────────────────────────────────────────

function handleKeyDown(e: KeyboardEvent): void {
  // Synthetic events (e.g. any InputEvent/KeyboardEvent we dispatch from the
  // text adapter) must pass through untouched so the target editor's own
  // handler can process them.
  if (!e.isTrusted) return;
  // IME composition: CJK and accented-input sequences deliver intermediate
  // keystrokes that must reach the browser's composition pipeline. Chrome
  // reports keyCode 229 during composition; isComposing covers the rest.
  if (e.isComposing || e.keyCode === 229) return;
  if (!config.enabled || isSiteDisabled()) return;
  if (!activeAdapter || !activeElement) return;

  const mode = modeManager.mode;

  // Insert mode: check for escape or escape remap
  if (mode === VimModeEnum.Insert) {
    handleInsertKey(e);
    return;
  }

  // Pass browser / user-configured shortcuts (e.g. Ctrl+K, Ctrl+L in Vivaldi)
  // through to the browser instead of intercepting them as Vim motions.
  if (isBrowserShortcut(e)) return;

  const key = mapKey(e);
  if (!key) return;

  e.preventDefault();
  e.stopPropagation();

  if (mode === VimModeEnum.Visual || mode === VimModeEnum.VisualLine) {
    handleVisualKey(key);
  } else {
    handleNormalKey(key);
  }
}

/**
 * Returns true for any modifier combo we don't explicitly implement, so the
 * browser/OS gets a chance to run its own handler (tab switching, find, etc.).
 * Shift is ignored — it's how capital letters like G/J arrive.
 */
function isBrowserShortcut(e: KeyboardEvent): boolean {
  if (!e.ctrlKey && !e.altKey && !e.metaKey) return false;
  // Vim's two explicit Ctrl bindings — handle these ourselves.
  if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'c' || e.key === 'r')) {
    return false;
  }
  return true;
}

function mapKey(e: KeyboardEvent): string | null {
  if (e.key === 'Escape') return '\x1b';
  if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'c') return '\x03';
  if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'r') return '\x12';
  if (e.key.length === 1) return e.key;
  return null;
}

function handleInsertKey(e: KeyboardEvent): void {
  // Escape key exits insert mode
  if (e.key === 'Escape') {
    e.preventDefault();
    exitInsertMode();
    return;
  }

  // Ctrl+C also exits
  if (e.ctrlKey && e.key === 'c') {
    e.preventDefault();
    exitInsertMode();
    return;
  }

  // Escape remap (e.g. "jk"). Modifier combos (Ctrl+K, Alt+L, ...) should
  // pass through to the browser unchanged and not pollute the buffer.
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  if (config.escapeRemap && e.key.length === 1) {
    const remap = config.escapeRemap;
    escapeRemapBuffer += e.key;

    if (escapeRemapBuffer === remap) {
      e.preventDefault();
      // Delete the first character of the remap that was already typed
      if (activeAdapter) {
        const text = activeAdapter.getText();
        const cursor = activeAdapter.getCursorPosition();
        const newText = text.slice(0, cursor - 1) + text.slice(cursor);
        activeAdapter.setText(newText);
        activeAdapter.setCursorPosition(cursor - 1);
      }
      escapeRemapBuffer = '';
      if (escapeRemapTimeout) clearTimeout(escapeRemapTimeout);
      exitInsertMode();
      return;
    }

    if (remap.startsWith(escapeRemapBuffer)) {
      // Partial match — wait for more keys
      if (escapeRemapTimeout) clearTimeout(escapeRemapTimeout);
      escapeRemapTimeout = setTimeout(() => {
        escapeRemapBuffer = '';
      }, 300);
      return;
    }

    // No match — reset
    escapeRemapBuffer = '';
    if (escapeRemapTimeout) clearTimeout(escapeRemapTimeout);
  }
}

function exitInsertMode(): void {
  modeManager.enterNormal();
  const mode = toRendererMode(modeManager.mode);
  cursorRenderer.setMode(mode);
  statusBar.setMode(mode);
  parser.reset();

  // Keep the cursor where the user left it — only clamp if it's past the end
  // or sitting on a trailing newline so Normal-mode invariants hold.
  if (activeAdapter) {
    clampNormalCursor();
    cursorRenderer.update();
  }
}

/** In normal mode, the cursor sits ON a character, not past it. */
function clampNormalCursor(): void {
  if (!activeAdapter) return;
  const text = activeAdapter.getText();
  if (text.length === 0) {
    activeAdapter.setCursorPosition(0);
    return;
  }
  const pos = activeAdapter.getCursorPosition();
  if (pos >= text.length) {
    activeAdapter.setCursorPosition(text.length - 1);
    return;
  }
  // If the cursor is on a trailing newline, step back onto the last char of the line
  if (text[pos] === '\n' && pos > 0 && text[pos - 1] !== '\n') {
    activeAdapter.setCursorPosition(pos - 1);
  }
}

function handleNormalKey(key: string): void {
  if (!activeAdapter || !activeElement) return;

  const result = parser.feed(key);
  statusBar.setCommandBuffer(parser.getBuffer());

  processParseResult(result);
}

// ── Visual mode ────────────────────────────────────────────────────

function handleVisualKey(key: string): void {
  if (!activeAdapter || !activeElement) return;

  // Escape / Ctrl-C exits visual mode
  if (key === '\x1b' || key === '\x03') {
    exitVisualMode();
    return;
  }

  // g-prefixed case-change operators on the selection: gu / gU / g~
  // (The `g` was consumed into visualBuffer on the previous keystroke.)
  if (visualBuffer === 'g' && (key === 'u' || key === 'U' || key === '~')) {
    const text = activeAdapter.getText();
    const cursor = activeAdapter.getCursorPosition();
    const isLinewise = modeManager.mode === VimModeEnum.VisualLine;
    pushUndo(activeElement, text);
    const mode = key === 'u' ? 'lower' : key === 'U' ? 'upper' : 'toggle';
    const edit = caseSelection(text, visualAnchor, cursor, isLinewise, mode);
    activeAdapter.setText(edit.text);
    activeAdapter.setCursorPosition(Math.min(visualAnchor, cursor));
    visualBuffer = '';
    exitVisualMode();
    return;
  }

  // Operators and non-motion keys are only accepted when no motion is in progress
  if (visualBuffer === '') {
    const text = activeAdapter.getText();
    const cursor = activeAdapter.getCursorPosition();
    const isLinewise = modeManager.mode === VimModeEnum.VisualLine;

    switch (key) {
      case 'd':
      case 'x':
      case 'X':
      case 'D': {
        pushUndo(activeElement, text);
        const edit = deleteSelection(text, visualAnchor, cursor, isLinewise, registers);
        activeAdapter.setText(edit.text);
        activeAdapter.setCursorPosition(edit.cursor);
        exitVisualMode();
        return;
      }
      case 'y':
      case 'Y': {
        yankSelection(text, visualAnchor, cursor, isLinewise, registers);
        copyToClipboard(registers.get('"').text);
        activeAdapter.setCursorPosition(Math.min(visualAnchor, cursor));
        exitVisualMode();
        return;
      }
      case 'c':
      case 'C':
      case 's':
      case 'S': {
        pushUndo(activeElement, text);
        const edit = changeSelection(text, visualAnchor, cursor, isLinewise, registers);
        activeAdapter.setText(edit.text);
        activeAdapter.setCursorPosition(edit.cursor);
        modeManager.enterInsert();
        updateModeUI();
        cursorRenderer.clearSelection();
        return;
      }
      case 'u':
      case 'U':
      case '~': {
        pushUndo(activeElement, text);
        const mode = key === 'u' ? 'lower' : key === 'U' ? 'upper' : 'toggle';
        const edit = caseSelection(text, visualAnchor, cursor, isLinewise, mode);
        activeAdapter.setText(edit.text);
        activeAdapter.setCursorPosition(Math.min(visualAnchor, cursor));
        exitVisualMode();
        return;
      }
      case 'o': {
        // Swap anchor and cursor — keeps the selection, moves the "active end"
        const newAnchor = cursor;
        activeAdapter.setCursorPosition(visualAnchor);
        visualAnchor = newAnchor;
        updateVisualSelection();
        return;
      }
      case 'v': {
        if (modeManager.mode === VimModeEnum.VisualLine) {
          modeManager.enterVisual();
          updateModeUI();
          updateVisualSelection();
        } else {
          exitVisualMode();
        }
        return;
      }
      case 'V': {
        if (modeManager.mode === VimModeEnum.Visual) {
          modeManager.enterVisualLine();
          updateModeUI();
          updateVisualSelection();
        } else {
          exitVisualMode();
        }
        return;
      }
    }
  }

  // Anything else is a motion or text object, possibly with a count
  visualBuffer += key;
  statusBar.setCommandBuffer(visualBuffer);

  const text = activeAdapter.getText();
  const cursor = activeAdapter.getCursorPosition();
  const parsed = parseVisualMotion(visualBuffer, text, cursor);

  if (parsed === 'pending') return;

  if (parsed === 'invalid') {
    visualBuffer = '';
    statusBar.setCommandBuffer('');
    return;
  }

  if (parsed.kind === 'cursor') {
    activeAdapter.setCursorPosition(parsed.value);
  } else {
    // Text object: snap the selection to [start, end-1] and treat the far
    // side as the active cursor end.
    visualAnchor = parsed.start;
    activeAdapter.setCursorPosition(Math.max(parsed.start, parsed.end - 1));
  }

  updateVisualSelection();
  visualBuffer = '';
  statusBar.setCommandBuffer('');
}

type VisualParseResult =
  | 'pending'
  | 'invalid'
  | { kind: 'cursor'; value: number }
  | { kind: 'range'; start: number; end: number };

const VISUAL_MOTIONS = new Set([
  'h', 'j', 'k', 'l',
  'w', 'b', 'e', 'W', 'B', 'E',
  '$', '^', '%', 'G',
  ';', ',',
]);

function parseVisualMotion(buf: string, text: string, cursor: number): VisualParseResult {
  let i = 0;

  // Count prefix — "0" alone is the line-start motion
  let countStr = '';
  while (i < buf.length && buf[i] >= '1' && buf[i] <= '9') {
    countStr += buf[i];
    i++;
  }
  while (countStr && i < buf.length && buf[i] >= '0' && buf[i] <= '9') {
    countStr += buf[i];
    i++;
  }
  const count = countStr ? parseInt(countStr, 10) : 1;

  if (i >= buf.length) return 'pending';

  const key = buf[i];

  // 0 as line-start motion when not consumed as count
  if (key === '0' && !countStr) {
    return { kind: 'cursor', value: applyMotionNTimes('0', text, cursor, count) };
  }

  // Text object: i{x} / a{x}
  if (key === 'i' || key === 'a') {
    if (i + 1 >= buf.length) return 'pending';
    const range = textObjectRange(buf[i + 1], key === 'a', text, cursor);
    if (!range) return 'invalid';
    return { kind: 'range', start: range[0], end: range[1] };
  }

  // g-prefixed: gg, ge, gE
  if (key === 'g') {
    if (i + 1 >= buf.length) return 'pending';
    const second = buf[i + 1];
    if (second === 'g') {
      return { kind: 'cursor', value: applyMotionNTimes('gg', text, cursor, count) };
    }
    if (second === 'e' || second === 'E') {
      return { kind: 'cursor', value: applyMotionNTimes('g' + second, text, cursor, count) };
    }
    return 'invalid';
  }

  // f/F/t/T — record for ; , repeat
  if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
    if (i + 1 >= buf.length) return 'pending';
    lastCharMotion = { motion: key as 'f' | 'F' | 't' | 'T', char: buf[i + 1] };
    return { kind: 'cursor', value: applyMotionNTimes(key, text, cursor, count, buf[i + 1]) };
  }

  // ; / , — resolve against stored last f/F/t/T
  if (key === ';' || key === ',') {
    const resolved = resolveCharRepeat(key);
    if (!resolved) return 'invalid';
    return {
      kind: 'cursor',
      value: applyMotionNTimes(resolved.motion, text, cursor, count, resolved.char, true),
    };
  }

  if (VISUAL_MOTIONS.has(key)) {
    return { kind: 'cursor', value: applyMotionNTimes(key, text, cursor, count) };
  }

  return 'invalid';
}

function applyMotionNTimes(
  motion: string,
  text: string,
  cursor: number,
  count: number,
  charArg?: string,
  isRepeat = false,
): number {
  return applyMotionRepeated(motion, text, cursor, count, charArg, isRepeat);
}

function updateVisualSelection(): void {
  if (!activeAdapter) return;

  const text = activeAdapter.getText();
  const cursor = activeAdapter.getCursorPosition();
  const isLinewise = modeManager.mode === VimModeEnum.VisualLine;

  let selStart: number;
  let selEnd: number;

  if (isLinewise) {
    const lo = Math.min(visualAnchor, cursor);
    const hi = Math.max(visualAnchor, cursor);
    selStart = text.lastIndexOf('\n', lo - 1) + 1;
    const nextNL = text.indexOf('\n', hi);
    selEnd = nextNL === -1 ? text.length : nextNL + 1;
  } else {
    selStart = Math.min(visualAnchor, cursor);
    selEnd = Math.min(Math.max(visualAnchor, cursor) + 1, text.length);
  }

  // Native selection (for accessibility / copy); our overlay is authoritative visually.
  try {
    activeAdapter.setSelectionRange(selStart, selEnd);
    // setSelectionRange moves the caret; restore our cursor position so the
    // block cursor stays on the active end of the selection.
    activeAdapter.setCursorPosition(cursor);
  } catch {
    // Some fields reject programmatic selection — ignore
  }

  cursorRenderer.setSelection(selStart, selEnd);
  cursorRenderer.update();
}

function exitVisualMode(): void {
  modeManager.enterNormal();
  visualBuffer = '';
  if (activeAdapter) {
    const pos = activeAdapter.getCursorPosition();
    try {
      activeAdapter.setSelectionRange(pos, pos);
    } catch { /* ignore */ }
    clampNormalCursor();
  }
  cursorRenderer.clearSelection();
  updateModeUI();
  statusBar.setCommandBuffer('');
}

// ── Normal mode parse result dispatch ──────────────────────────────

function processParseResult(result: ParseResult): void {
  if (!activeAdapter || !activeElement) return;

  if (result.status === 'pending' || result.status === 'invalid') {
    if (result.status === 'invalid') parser.reset();
    return;
  }

  const text = activeAdapter.getText();
  const cursor = activeAdapter.getCursorPosition();

  if (result.status === 'action') {
    handleAction(result.action, result.count, text, cursor, result.charArg);
    return;
  }

  if (result.status === 'complete') {
    const cmd = normalizeCharMotion(result.command);

    if (cmd.operator === null) {
      // Pure motion
      const newCursor = applyMotionRepeated(
        cmd.motion!, text, cursor, cmd.count, cmd.charArg, cmd.isCharMotionRepeat ?? false,
      );
      activeAdapter.setCursorPosition(newCursor);
      clampNormalCursor();
    } else {
      // Operator + motion / text object
      pushUndo(activeElement, text);
      let edit;
      let handledViaBlock = false;
      switch (cmd.operator) {
        case 'd':
          edit = deleteOp(text, cursor, cmd, registers);
          // Fast path: linewise `dd` (no count) on a framework contenteditable.
          // Targets the exact <p>/<div> block under the cursor via DOM so
          // adjacent blank lines aren't collapsed by ProseMirror normalisation.
          if (
            cmd.linewise &&
            (cmd.count ?? 1) === 1 &&
            activeAdapter instanceof ContentEditableAdapter
          ) {
            if (activeAdapter.deleteBlockAtCursor()) {
              handledViaBlock = true;
            }
          }
          break;
        case 'c':
          edit = changeOp(text, cursor, cmd, registers);
          break;
        case 'y':
          edit = yankOp(text, cursor, cmd, registers);
          copyToClipboard(registers.get('"').text);
          break;
        case 'gu':
          edit = caseOp(text, cursor, cmd, 'lower');
          break;
        case 'gU':
          edit = caseOp(text, cursor, cmd, 'upper');
          break;
        case 'g~':
          edit = caseOp(text, cursor, cmd, 'toggle');
          break;
        default:
          return;
      }

      if (!handledViaBlock) {
        if (edit.text !== text) {
          activeAdapter.setText(edit.text);
        }
        activeAdapter.setCursorPosition(edit.cursor);
      }

      if (edit.enterInsert) {
        modeManager.enterInsert();
        updateModeUI();
      } else {
        clampNormalCursor();
      }
    }

    cursorRenderer.update();
    statusBar.setCommandBuffer('');
  }
}

/**
 * Record f/F/t/T for later `;`/`,` repeats, and rewrite `;`/`,` commands
 * into their effective motion before execution.
 */
function normalizeCharMotion(cmd: Command): Command {
  if (cmd.motion === 'f' || cmd.motion === 'F' || cmd.motion === 't' || cmd.motion === 'T') {
    if (cmd.charArg) {
      lastCharMotion = { motion: cmd.motion as 'f' | 'F' | 't' | 'T', char: cmd.charArg };
    }
    return cmd;
  }
  if (cmd.motion === ';' || cmd.motion === ',') {
    const resolved = resolveCharRepeat(cmd.motion);
    if (!resolved) return cmd;
    return {
      ...cmd,
      motion: resolved.motion,
      charArg: resolved.char,
      isCharMotionRepeat: true,
    };
  }
  return cmd;
}

function handleAction(
  action: string,
  count: number,
  text: string,
  cursor: number,
  charArg?: string,
): void {
  if (!activeAdapter || !activeElement) return;

  switch (action) {
    case 'escape':
      modeManager.enterNormal();
      updateModeUI();
      break;

    case 'i':
      modeManager.enterInsert();
      updateModeUI();
      break;

    case 'a':
      activeAdapter.setCursorPosition(Math.min(cursor + 1, text.length));
      modeManager.enterInsert();
      updateModeUI();
      break;

    case 'I': {
      // Move to first non-blank of line
      const lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
      let pos = lineStart;
      while (pos < text.length && (text[pos] === ' ' || text[pos] === '\t')) pos++;
      activeAdapter.setCursorPosition(pos);
      modeManager.enterInsert();
      updateModeUI();
      break;
    }

    case 'A': {
      // Move to end of line
      let lineEnd = text.indexOf('\n', cursor);
      if (lineEnd === -1) lineEnd = text.length;
      activeAdapter.setCursorPosition(lineEnd);
      modeManager.enterInsert();
      updateModeUI();
      break;
    }

    case 'o': {
      pushUndo(activeElement, text);
      const end = lineEndOf(text, cursor);
      const after = activeAdapter.insertLineBreak(end);
      activeAdapter.setCursorPosition(after);
      modeManager.enterInsert();
      updateModeUI();
      break;
    }

    case 'O': {
      pushUndo(activeElement, text);
      const start = lineStartOf(text, cursor);
      activeAdapter.insertLineBreak(start);
      activeAdapter.setCursorPosition(start);
      modeManager.enterInsert();
      updateModeUI();
      break;
    }

    case 'x': {
      pushUndo(activeElement, text);
      const edit = deleteChar(text, cursor, count, registers);
      activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      clampNormalCursor();
      cursorRenderer.update();
      break;
    }

    case 'X': {
      pushUndo(activeElement, text);
      const edit = deleteCharBefore(text, cursor, count, registers);
      if (edit.text !== text) activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      clampNormalCursor();
      cursorRenderer.update();
      break;
    }

    case 'D': {
      // Delete to end of line (= d$)
      pushUndo(activeElement, text);
      const cmd: Command = { count: 1, operator: 'd', motion: '$', linewise: false };
      const edit = deleteOp(text, cursor, cmd, registers);
      activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      clampNormalCursor();
      cursorRenderer.update();
      break;
    }

    case 'C': {
      // Change to end of line (= c$)
      pushUndo(activeElement, text);
      const cmd: Command = { count: 1, operator: 'c', motion: '$', linewise: false };
      const edit = changeOp(text, cursor, cmd, registers);
      activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      modeManager.enterInsert();
      updateModeUI();
      break;
    }

    case 'Y': {
      // Yank entire line(s) (= yy)
      const cmd: Command = { count, operator: 'y', motion: null, linewise: true };
      yankOp(text, cursor, cmd, registers);
      copyToClipboard(registers.get('"').text);
      break;
    }

    case 's': {
      // Substitute: delete `count` chars then enter insert
      pushUndo(activeElement, text);
      const edit = deleteChar(text, cursor, count, registers);
      activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      modeManager.enterInsert();
      updateModeUI();
      break;
    }

    case 'S': {
      // Substitute line: equivalent to cc
      pushUndo(activeElement, text);
      const cmd: Command = { count, operator: 'c', motion: null, linewise: true };
      const edit = changeOp(text, cursor, cmd, registers);
      activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      modeManager.enterInsert();
      updateModeUI();
      break;
    }

    case '~': {
      pushUndo(activeElement, text);
      const edit = toggleCaseChar(text, cursor, count);
      if (edit.text !== text) activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      clampNormalCursor();
      cursorRenderer.update();
      break;
    }

    case 'r': {
      if (charArg) {
        pushUndo(activeElement, text);
        const edit = replaceChar(text, cursor, charArg);
        activeAdapter.setText(edit.text);
        activeAdapter.setCursorPosition(edit.cursor);
        cursorRenderer.update();
      }
      break;
    }

    case 'p':
      void doPaste(true);
      break;

    case 'P':
      void doPaste(false);
      break;

    case 'J': {
      pushUndo(activeElement, text);
      const edit = joinLines(text, cursor);
      activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      clampNormalCursor();
      cursorRenderer.update();
      break;
    }

    case 'u': {
      const prev = popUndo(activeElement);
      if (prev !== undefined) {
        activeAdapter.setText(prev);
        activeAdapter.setCursorPosition(Math.min(cursor, Math.max(0, prev.length - 1)));
        cursorRenderer.update();
      }
      break;
    }

    case 'ctrl-r':
      // Redo not implemented yet
      break;

    case 'v':
      visualAnchor = cursor;
      modeManager.enterVisual();
      updateModeUI();
      updateVisualSelection();
      break;

    case 'V':
      visualAnchor = cursor;
      modeManager.enterVisualLine();
      updateModeUI();
      updateVisualSelection();
      break;
  }
}

function updateModeUI(): void {
  const mode = toRendererMode(modeManager.mode);
  cursorRenderer.setMode(mode);
  statusBar.setMode(mode);
  cursorRenderer.update();
}

// ── Message handling (background script communication) ──────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  switch (message.type) {
    case MessageType.ToggleEnabled: {
      const payload = message.payload as { enabled: boolean };
      config = { ...config, enabled: payload.enabled };
      if (!payload.enabled) {
        if (activeElement) restoreFont(activeElement);
        cursorRenderer.detach();
        statusBar.detach();
        activeAdapter = null;
        activeElement = null;
      }
      break;
    }
    case MessageType.ConfigUpdated: {
      config = message.payload as VimConfig;
      if (!config.enabled || isSiteDisabled()) {
        if (activeElement) restoreFont(activeElement);
        cursorRenderer.detach();
        statusBar.detach();
        activeAdapter = null;
        activeElement = null;
      } else if (activeElement) {
        if (config.useMonospaceFont) {
          applyMonospaceFont(activeElement);
        } else {
          restoreFont(activeElement);
        }
      }
      break;
    }
  }
});

// ── Initialization ─────────────────────────────────────────────────

async function init(): Promise<void> {
  // Load config from background
  try {
    const savedConfig = await chrome.runtime.sendMessage<
      { type: MessageType },
      VimConfig
    >({ type: MessageType.GetConfig });
    if (savedConfig) {
      config = savedConfig;
    }
  } catch {
    // Extension context may not be ready yet — use defaults
  }

  // Attach unconditionally; handleKeyDown and onFieldFocus gate on config.enabled
  // and isSiteDisabled() so a runtime toggle or disabled-sites edit takes effect
  // without a page reload.
  document.addEventListener('keydown', handleKeyDown, true);
  fieldDetector.start();

  // Diagnostic helper — call `window.__vimfieldsDebug()` from DevTools on a
  // field that isn't behaving (e.g. Claude's chat after a Shift+Enter) to
  // dump what the extension sees vs what the browser shows. Lets us spot DOM
  // patterns our walker and innerText fallback both miss.
  (globalThis as unknown as { __vimfieldsDebug?: () => unknown }).__vimfieldsDebug =
    (): unknown => {
      const el = (activeElement ?? document.activeElement) as HTMLElement | null;
      if (!el) return { error: 'no active editable field' };
      const sel = window.getSelection();
      const r = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      return {
        tag: el.tagName,
        className: el.className,
        contentEditable: (el as HTMLElement).isContentEditable,
        outerHTMLPreview: el.outerHTML.slice(0, 1500),
        innerText: (el as HTMLElement).innerText,
        textContent: el.textContent,
        adapterText: activeAdapter?.getText(),
        adapterCursor: activeAdapter?.getCursorPosition(),
        adapterLineCount: activeAdapter?.getLineCount(),
        selection: r
          ? {
              startContainer: (r.startContainer as Node).nodeName,
              startOffset: r.startOffset,
              endContainer: (r.endContainer as Node).nodeName,
              endOffset: r.endOffset,
              collapsed: r.collapsed,
            }
          : null,
      };
    };
}

init();
