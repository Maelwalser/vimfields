/**
 * TextAdapter abstracts text read/write and cursor operations across
 * input, textarea, and contenteditable elements.
 */

import { MONOSPACE_FONT_STACK } from '../constants';

export interface SelectionRange {
  start: number;
  end: number;
}

export interface CursorPosition {
  line: number;
  column: number;
  offset: number;
}

export interface TextAdapter {
  readonly element: HTMLElement;

  getText(): string;
  setText(text: string): void;
  getCursorPosition(): number;
  setCursorPosition(pos: number): void;
  getSelectionRange(): SelectionRange;
  setSelectionRange(start: number, end: number): void;

  /** Convert a linear offset to line/column (for multi-line fields). */
  offsetToLineCol(offset: number): { line: number; column: number };
  /** Convert line/column to a linear offset. */
  lineColToOffset(line: number, column: number): number;
  /** Get the total number of lines. */
  getLineCount(): number;
  /** Get the text content of a specific line (0-indexed). */
  getLine(line: number): string;

  /**
   * Insert a single line break at `position` and return the cursor offset
   * immediately after the inserted break. For rich-text contenteditable
   * editors (ProseMirror, Lexical) this uses the same path as Shift+Enter
   * so the editor's own model stays in sync.
   *
   * Single-line adapters (InputAdapter) are a no-op and return `position`.
   */
  insertLineBreak(position: number): number;

  dispose(): void;
}

// ---------------------------------------------------------------------------
// Dispatch synthetic events so React/Vue controlled inputs stay in sync
// ---------------------------------------------------------------------------

function dispatchInputEvents(element: HTMLElement, data: string | null = null): void {
  // InputEvent for React's synthetic event system and contenteditable editors
  // that diff on inputType/data (Lexical, ProseMirror, Draft, Slate).
  const inputEvent = new InputEvent('input', {
    bubbles: true,
    cancelable: false,
    inputType: 'insertText',
    data,
  });
  element.dispatchEvent(inputEvent);

  // Change event for Vue v-model and legacy bindings
  const changeEvent = new Event('change', { bubbles: true });
  element.dispatchEvent(changeEvent);
}

// Shared setter that uses the native value setter to bypass React's override
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
}

// ---------------------------------------------------------------------------
// InputAdapter — <input type="text"> and similar single-line inputs
// ---------------------------------------------------------------------------

export class InputAdapter implements TextAdapter {
  readonly element: HTMLInputElement;

  constructor(element: HTMLInputElement) {
    this.element = element;
  }

  getText(): string {
    return this.element.value;
  }

  setText(text: string): void {
    setNativeValue(this.element, text);
    dispatchInputEvents(this.element);
  }

  getCursorPosition(): number {
    return this.element.selectionStart ?? 0;
  }

  setCursorPosition(pos: number): void {
    const clamped = Math.max(0, Math.min(pos, this.element.value.length));
    this.element.setSelectionRange(clamped, clamped);
  }

  getSelectionRange(): SelectionRange {
    return {
      start: this.element.selectionStart ?? 0,
      end: this.element.selectionEnd ?? 0,
    };
  }

  setSelectionRange(start: number, end: number): void {
    const len = this.element.value.length;
    this.element.setSelectionRange(
      Math.max(0, Math.min(start, len)),
      Math.max(0, Math.min(end, len)),
    );
  }

  offsetToLineCol(offset: number): { line: number; column: number } {
    // Single-line: always line 0
    return { line: 0, column: Math.max(0, Math.min(offset, this.element.value.length)) };
  }

  lineColToOffset(_line: number, column: number): number {
    return Math.max(0, Math.min(column, this.element.value.length));
  }

  getLineCount(): number {
    return 1;
  }

  getLine(_line: number): string {
    return this.element.value;
  }

  insertLineBreak(position: number): number {
    return position;
  }

  dispose(): void {
    // No cleanup needed
  }
}

// ---------------------------------------------------------------------------
// TextareaAdapter — <textarea> with multi-line cursor math
// ---------------------------------------------------------------------------

export class TextareaAdapter implements TextAdapter {
  readonly element: HTMLTextAreaElement;

  constructor(element: HTMLTextAreaElement) {
    this.element = element;
  }

  getText(): string {
    return this.element.value;
  }

  setText(text: string): void {
    setNativeValue(this.element, text);
    dispatchInputEvents(this.element);
  }

  getCursorPosition(): number {
    return this.element.selectionStart ?? 0;
  }

  setCursorPosition(pos: number): void {
    const clamped = Math.max(0, Math.min(pos, this.element.value.length));
    this.element.setSelectionRange(clamped, clamped);
  }

  getSelectionRange(): SelectionRange {
    return {
      start: this.element.selectionStart ?? 0,
      end: this.element.selectionEnd ?? 0,
    };
  }

  setSelectionRange(start: number, end: number): void {
    const len = this.element.value.length;
    this.element.setSelectionRange(
      Math.max(0, Math.min(start, len)),
      Math.max(0, Math.min(end, len)),
    );
  }

  private getLines(): string[] {
    return this.element.value.split('\n');
  }

  offsetToLineCol(offset: number): { line: number; column: number } {
    const text = this.element.value;
    const clampedOffset = Math.max(0, Math.min(offset, text.length));
    let line = 0;
    let remaining = clampedOffset;

    const lines = this.getLines();
    for (let i = 0; i < lines.length; i++) {
      // +1 for the newline character (except the last line)
      const lineLen = lines[i].length + (i < lines.length - 1 ? 1 : 0);
      if (remaining <= lines[i].length) {
        return { line: i, column: remaining };
      }
      remaining -= lineLen;
      line = i + 1;
    }

    // Past end — clamp to end of last line
    const lastLine = lines.length - 1;
    return { line: lastLine, column: lines[lastLine].length };
  }

  lineColToOffset(line: number, column: number): number {
    const lines = this.getLines();
    const clampedLine = Math.max(0, Math.min(line, lines.length - 1));
    const clampedCol = Math.max(0, Math.min(column, lines[clampedLine].length));

    let offset = 0;
    for (let i = 0; i < clampedLine; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    return offset + clampedCol;
  }

  getLineCount(): number {
    return this.getLines().length;
  }

  getLine(line: number): string {
    const lines = this.getLines();
    const clamped = Math.max(0, Math.min(line, lines.length - 1));
    return lines[clamped];
  }

  insertLineBreak(position: number): number {
    const current = this.element.value;
    const clamped = Math.max(0, Math.min(position, current.length));
    const next = current.slice(0, clamped) + '\n' + current.slice(clamped);
    setNativeValue(this.element, next);
    const after = clamped + 1;
    this.element.setSelectionRange(after, after);
    dispatchInputEvents(this.element, '\n');
    return after;
  }

  dispose(): void {
    // No cleanup needed
  }
}

// ---------------------------------------------------------------------------
// ContentEditableAdapter — contenteditable elements using Selection/Range API
// ---------------------------------------------------------------------------

// Tags that introduce line breaks in the "plain text" view, matching how
// innerText treats block-level boundaries. Rich-text editors (ProseMirror,
// Lexical, Draft, Slate) render Shift+Enter as a <br> or a split <p>/<div>,
// so we treat both as real newlines in our offset space.
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DETAILS', 'DIALOG',
  'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER',
  'HGROUP', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
  'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

// Some editors render an empty block with a <br class="ProseMirror-trailingBreak">
// (or similar) purely to give the line height. That <br> is invisible to the
// user's cursor and counting it produces phantom newlines in getText().
//
// Known sentinel patterns across framework editors:
//   • ProseMirror / Tiptap: <br class="ProseMirror-trailingBreak">
//   • Generic: any <br data-trailing-break>
//   • Lexical: empty <p><br></p> as structural terminator is handled by the
//     "empty block at EOF" logic in computeTextView, not here — a Lexical
//     <br data-lexical-linebreak> IS a real user-visible newline.
//   • Slate: trailing <br data-slate-zero-width="z"> inside an empty block.
function isTrailingBreakMarker(el: Element): boolean {
  if (el.tagName !== 'BR') return false;
  const cls = el.getAttribute('class') ?? '';
  if (/\btrailingBreak\b/.test(cls)) return true;
  if (el.hasAttribute('data-trailing-break')) return true;
  if (el.getAttribute('data-slate-zero-width') === 'z') return true;
  return false;
}

// Inline widgets (mentions, emoji pickers, file chips) use contenteditable="false".
// They contribute their textContent to the visible text but must not emit block
// boundaries — walking into them as if they were <div>s adds phantom newlines.
function isInlineUneditableWidget(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const ce = el.getAttribute('contenteditable');
  if (ce !== 'false') return false;
  // Treat as inline only if it isn't itself a block tag. Block-tag widgets
  // (rare, e.g. inline code blocks) still deserve their own line.
  return !BLOCK_TAGS.has(el.tagName);
}

// Editors can smuggle line breaks into text nodes using Unicode line/paragraph
// separator characters (U+2028 / U+2029). Treat them exactly like '\n' so the
// cursor math and motions see them as line boundaries.
function normalizeLineSeparators(s: string): string {
  return s.replace(/[\u2028\u2029]/g, '\n');
}

function isAllNewlines(s: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (s[i] !== '\n') return false;
  }
  return end > start;
}

function isBlockElement(el: Element): boolean {
  if (BLOCK_TAGS.has(el.tagName)) return true;
  try {
    const display = window.getComputedStyle(el).display;
    if (!display) return false;
    return (
      display === 'block' ||
      display === 'list-item' ||
      display === 'flow-root' ||
      display === 'table' ||
      display.startsWith('table-') ||
      display.startsWith('flex') ||
      display.startsWith('grid')
    );
  } catch {
    return false;
  }
}

/**
 * Build a plain-text view of a contenteditable subtree, along with the
 * starting offset of each Text node in that view.
 *
 * This mirrors the subset of `innerText` behavior we care about:
 *   • <br> contributes a single '\n'
 *   • Block-level element boundaries insert a '\n' between siblings
 *     (so <p>a</p><p>b</p> becomes "a\nb")
 *
 * Keeping getText() and the offset math backed by the same walker is what
 * makes j/k work across Shift+Enter: both sides agree that the newline
 * exists and sits at the same offset.
 */
/**
 * Build a plain-text view of a contenteditable, mapping each Text node to
 * its offset in the final string.
 *
 * The walker emits one '\n' between sibling block-level boxes, one '\n' per
 * <br> (skipping ProseMirror-trailingBreak markers), and flushes any pending
 * separator at the end — so a trailing empty <p> (Tiptap's canonical empty-
 * line pattern, `<p class="is-empty"><br class="ProseMirror-trailingBreak"/></p>`)
 * produces the trailing "\n" that makes j/k and getLineCount agree with what
 * the user sees.
 *
 * Consecutive empty blocks accumulate: `<p>a</p><p></p><p>b</p>` becomes
 * "a\n\nb" (three lines) because each block's pre-visit increments the
 * pending counter even when the block emits no text of its own.
 *
 * We intentionally do not use `element.innerText` — for block-styled editors
 * like Tiptap / ProseMirror it overcounts empty paragraphs (each renders with
 * vertical margin that innerText turns into an extra '\n'), which produced
 * phantom blank lines in an earlier version of this code.
 */
interface EmptyBlockAnchor {
  element: Element;
  start: number;
}

function computeTextView(root: Element): {
  text: string;
  textNodes: Array<{ node: Text; start: number }>;
  emptyAnchors: EmptyBlockAnchor[];
} {
  const textNodes: Array<{ node: Text; start: number }> = [];
  // Empty blocks (e.g. Tiptap's `<p class="is-empty"><br ...trailingBreak/></p>`)
  // have no text node — they represent blank lines. Record them here so
  // setCursorPosition() can land inside the right paragraph and
  // rangeToOffset() can recognise when the selection sits in one.
  const emptyAnchors: EmptyBlockAnchor[] = [];
  let text = '';
  let pendingNewlines = 0;
  let emittedAny = false;

  const flushPending = (): void => {
    while (pendingNewlines > 0) {
      text += '\n';
      pendingNewlines--;
    }
  };

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = (node as Text).textContent ?? '';
      if (raw.length === 0) return;
      const content = normalizeLineSeparators(raw);
      flushPending();
      textNodes.push({ node: node as Text, start: text.length });
      text += content;
      emittedAny = true;
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    if (el.tagName === 'BR') {
      if (isTrailingBreakMarker(el)) return;
      flushPending();
      text += '\n';
      emittedAny = true;
      return;
    }

    const treatAsBlock =
      el !== root && !isInlineUneditableWidget(el) && isBlockElement(el);
    const textLenBefore = text.length;

    if (treatAsBlock && emittedAny) {
      pendingNewlines++;
    }

    for (const child of Array.from(el.childNodes)) {
      visit(child);
    }

    if (treatAsBlock && emittedAny && text.length === textLenBefore) {
      // This block produced no text. Its line starts at the offset the
      // NEXT flush would write — i.e. current text plus still-pending \n's.
      // setCursorPosition(that offset) should land INSIDE this empty block
      // so the browser caret is visible on the blank line.
      emptyAnchors.push({ element: el, start: text.length + pendingNewlines });
    }
  };

  visit(root);
  // Trailing empty blocks leave pending newlines unflushed. Those represent
  // blank lines the user can see and edit (Tiptap's empty <p> with
  // trailing-break marker), so emit them so cursor math lines up.
  flushPending();

  return { text, textNodes, emptyAnchors };
}

export class ContentEditableAdapter implements TextAdapter {
  readonly element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  getText(): string {
    return computeTextView(this.element).text;
  }

  setText(text: string): void {
    // Framework editors (Lexical, ProseMirror, Draft, Slate) install
    // beforeinput handlers that drive their internal document model. The old
    // "selectNodeContents + execCommand('insertText', multi-line)" path was
    // unreliable on ProseMirror (Claude) because those editors filter \n out
    // of insertText. We use a diff: delete only the changed range, then
    // re-insert the new content with Shift+Enter for hard breaks — each
    // call matches the native input path those editors listen to.
    const active = document.activeElement as Node | null;
    const isFocused =
      active === this.element ||
      (active != null && this.element.contains(active));

    if (isFocused) {
      try {
        if (this.applyTextViaDiff(text)) return;
      } catch {
        // fall through
      }
      // Focused framework editor and the diff path failed. DO NOT rebuild
      // the DOM — ProseMirror / Lexical / Tiptap / Slate own the structure,
      // and replacing their <p> blocks with a <br>-flattened soup wipes the
      // user's blank-line structure and leaves the editor's internal model
      // out of sync. Dispatch an input event so any React/Vue bindings
      // reconcile against whatever the editor actually has, and return. On
      // the next interaction the editor will re-normalise from its own
      // model — strictly safer than our guessing.
      dispatchInputEvents(this.element, null);
      return;
    }

    // Manual DOM rebuild — used in jsdom and whenever the element is not
    // focused (e.g. the background script sets initial content into a
    // plain contenteditable).
    while (this.element.firstChild) {
      this.element.removeChild(this.element.firstChild);
    }
    const doc = this.element.ownerDocument;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        this.element.appendChild(doc.createElement('br'));
      }
      if (lines[i].length > 0) {
        this.element.appendChild(doc.createTextNode(lines[i]));
      }
    }
    dispatchInputEvents(this.element, text);
  }

  /**
   * Apply a new text by diffing against the current content and poking only
   * the changed range through the editor's input pipeline. Returns true when
   * the edit succeeded and the resulting text matches — callers that get
   * false should fall back to a DOM rebuild.
   */
  private applyTextViaDiff(next: string): boolean {
    const current = this.getText();
    if (current === next) return true;

    let prefix = 0;
    const minLen = Math.min(current.length, next.length);
    while (prefix < minLen && current[prefix] === next[prefix]) prefix++;

    let suffix = 0;
    while (
      suffix < minLen - prefix &&
      current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
    ) suffix++;

    let removeStart = prefix;
    let removeEnd = current.length - suffix;
    const insertText = next.slice(prefix, next.length - suffix);

    // Cursor-biased disambiguation for delete-only edits across consecutive
    // '\n's. Prefix/suffix matching on "…\n\n\n\n…" can't tell which '\n' was
    // meant — it always picks the last one — and the resulting DOM range may
    // map both endpoints to the same ProseMirror position, causing the editor
    // to collapse multiple adjacent empty blocks. When the removed range is
    // entirely newlines AND the context around it is also newlines, slide the
    // range toward the user's cursor so we select a range inside the cursor's
    // own block.
    if (
      insertText.length === 0 &&
      removeEnd > removeStart &&
      isAllNewlines(current, removeStart, removeEnd)
    ) {
      const cursor = this.getCursorPosition();
      const len = removeEnd - removeStart;
      let runStart = removeStart;
      while (runStart > 0 && current[runStart - 1] === '\n') runStart--;
      let runEnd = removeEnd;
      while (runEnd < current.length && current[runEnd] === '\n') runEnd++;
      if (runEnd - runStart > len) {
        // Prefer a range that contains the cursor; fall back to a range
        // that starts at the cursor's nearest newline.
        const clampedCursor = Math.max(runStart, Math.min(cursor, runEnd));
        const biasedStart = Math.max(runStart, Math.min(clampedCursor, runEnd - len));
        removeStart = biasedStart;
        removeEnd = biasedStart + len;
      }
    }
    const doc = this.element.ownerDocument;

    if (removeEnd > removeStart) {
      this.setSelectionRange(removeStart, removeEnd);
      let deleted = false;
      try {
        deleted = doc.execCommand('delete');
      } catch {
        deleted = false;
      }
      if (!deleted) return false;
    } else {
      this.setCursorPosition(removeStart);
    }

    if (insertText.length > 0) {
      const segments = insertText.split('\n');
      for (let i = 0; i < segments.length; i++) {
        if (i > 0) {
          if (!this.insertHardBreakAtCaret()) return false;
        }
        if (segments[i].length > 0) {
          let ok = false;
          try {
            ok = doc.execCommand('insertText', false, segments[i]);
          } catch {
            ok = false;
          }
          if (!ok) return false;
        }
      }
    }

    return this.getText() === next;
  }

  /**
   * Insert a single hard break at the current caret, returning true if the
   * editor accepted it. Escalation ladder, from most-native to most-manual:
   *   1. document.execCommand('insertLineBreak') — Chrome's native path for
   *      Shift+Enter. Fires a real beforeinput/input pair with inputType
   *      'insertLineBreak', which is what ProseMirror/Lexical/Slate listen
   *      for. Works in framework-backed contenteditables.
   *   2. Dispatch a synthetic InputEvent('beforeinput', …) with inputType
   *      'insertLineBreak'. Some editors (older Slate builds) subscribe to
   *      this even from scripts.
   *   3. Manual <br> insertion + input dispatch. Last-resort fallback for
   *      jsdom and plain contenteditable where execCommand is a no-op.
   *
   * We deliberately DO NOT dispatch a synthetic Shift+Enter KeyboardEvent —
   * framework editors check `isTrusted` and reject scripted ones, so that
   * path was dead code on the editors it was meant to help.
   */
  private insertHardBreakAtCaret(): boolean {
    const doc = this.element.ownerDocument;
    const view = doc.defaultView;
    const beforeLen = this.getText().length;

    try {
      if (doc.execCommand('insertLineBreak') && this.getText().length > beforeLen) {
        return true;
      }
    } catch {
      // fall through
    }

    const InputEventCtor = view?.InputEvent ?? InputEvent;
    try {
      const beforeInput = new InputEventCtor('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertLineBreak',
        data: null,
      });
      // dispatchEvent returns false when a handler called preventDefault —
      // i.e. the editor accepted and is handling the break itself.
      const consumedByEditor = !this.element.dispatchEvent(beforeInput);
      if (consumedByEditor && this.getText().length > beforeLen) return true;
    } catch {
      // fall through
    }

    const sel = view?.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const br = doc.createElement('br');
      range.deleteContents();
      range.insertNode(br);
      const after = doc.createRange();
      after.setStartAfter(br);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
      dispatchInputEvents(this.element, null);
      return true;
    }
    return false;
  }

  getCursorPosition(): number {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    return this.rangeToOffset(sel.getRangeAt(0), true);
  }

  setCursorPosition(pos: number): void {
    const { node, offset } = this.offsetToNodePosition(pos);
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  getSelectionRange(): SelectionRange {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
    const range = sel.getRangeAt(0);
    return {
      start: this.rangeToOffset(range, true),
      end: this.rangeToOffset(range, false),
    };
  }

  setSelectionRange(start: number, end: number): void {
    const startPos = this.offsetToNodePosition(start);
    const endPos = this.offsetToNodePosition(end);
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  offsetToLineCol(offset: number): { line: number; column: number } {
    const text = this.getText();
    const clamped = Math.max(0, Math.min(offset, text.length));
    const lines = text.split('\n');
    let remaining = clamped;
    for (let i = 0; i < lines.length; i++) {
      if (remaining <= lines[i].length) {
        return { line: i, column: remaining };
      }
      remaining -= lines[i].length + 1;
    }
    const last = lines.length - 1;
    return { line: last, column: lines[last].length };
  }

  lineColToOffset(line: number, column: number): number {
    const lines = this.getText().split('\n');
    const clampedLine = Math.max(0, Math.min(line, lines.length - 1));
    const clampedCol = Math.max(0, Math.min(column, lines[clampedLine].length));
    let offset = 0;
    for (let i = 0; i < clampedLine; i++) {
      offset += lines[i].length + 1;
    }
    return offset + clampedCol;
  }

  getLineCount(): number {
    return this.getText().split('\n').length;
  }

  getLine(line: number): string {
    const lines = this.getText().split('\n');
    const clamped = Math.max(0, Math.min(line, lines.length - 1));
    return lines[clamped];
  }

  insertLineBreak(position: number): number {
    this.setCursorPosition(position);
    if (!this.insertHardBreakAtCaret()) return position;
    const after = position + 1;
    this.setCursorPosition(after);
    return after;
  }

  /**
   * Delete the block-level ancestor of the current selection that sits as a
   * direct child of the editor root, exactly as if the user dragged a native
   * selection around that one `<p>` / `<div>` and pressed Backspace. Used by
   * linewise Vim operators (`dd`, `D`, visual-line delete) to bypass the
   * offset-based text diff, which is ambiguous across consecutive blank
   * lines and lets ProseMirror normalisation eagerly collapse adjacent empty
   * blocks.
   *
   * Returns true on success; false if no suitable block was found (e.g. the
   * editor has no block structure, or removing this block would empty the
   * root — deferring to the diff path is safer in that case).
   *
   * After a successful delete the caret is placed at the start of the
   * nearest surviving sibling, so the subsequent `clampNormalCursor()` in
   * content.ts lands us on a sane Normal-mode position.
   */
  deleteBlockAtCursor(): boolean {
    const root = this.element;
    const view = root.ownerDocument?.defaultView ?? window;
    const sel = view.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);

    const block = this.findTopLevelBlock(range.startContainer);
    if (!block) return false;
    // Refuse to delete the only block — would empty the editor and leave
    // the framework editor in an invalid schema state.
    if (block.parentNode === root) {
      let blockSiblings = 0;
      for (const child of Array.from(root.children)) {
        if (isBlockElement(child)) blockSiblings++;
      }
      if (blockSiblings <= 1) return false;
    }

    const restore = (block.previousElementSibling as HTMLElement | null) ??
      (block.nextElementSibling as HTMLElement | null);

    const doc = root.ownerDocument;
    const blockRange = doc.createRange();
    blockRange.selectNode(block);
    sel.removeAllRanges();
    sel.addRange(blockRange);

    const InputEventCtor = view.InputEvent ?? InputEvent;
    let consumedByEditor = false;
    try {
      const beforeInput = new InputEventCtor('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'deleteContent',
        data: null,
      });
      // dispatchEvent returns false when a handler called preventDefault —
      // the editor is taking responsibility for the delete.
      consumedByEditor = !root.dispatchEvent(beforeInput);
    } catch {
      consumedByEditor = false;
    }

    if (!consumedByEditor) {
      // Plain contenteditable (no framework listener) — remove the node
      // ourselves and dispatch an input event so React/Vue bindings see the
      // change.
      if (block.parentNode) {
        block.parentNode.removeChild(block);
      }
      dispatchInputEvents(root, null);
    }

    // Place the caret at the start of a surviving sibling so Normal-mode
    // position math finds a valid offset on the first frame. If the editor
    // handled the delete it may have already moved the caret — we only
    // force the position when no sibling was found (edge case).
    if (restore && restore.isConnected) {
      try {
        const after = doc.createRange();
        after.setStart(restore, 0);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
      } catch {
        // Restore is not a valid start container (rare) — leave the
        // editor's own caret wherever it landed.
      }
    }
    return true;
  }

  /**
   * Walk up from `node` to find the nearest block element that is a direct
   * child of this adapter's root. Returns null if no such ancestor exists
   * (i.e. the editor has no block structure at its top level).
   */
  private findTopLevelBlock(node: Node): HTMLElement | null {
    const root = this.element;
    let current: Node | null = node;
    // If the selection is anchored on the root itself with an offset, pick
    // the child at that index.
    if (current === root && node.nodeType === Node.ELEMENT_NODE) {
      return null;
    }
    while (current && current !== root) {
      const parent: Node | null = current.parentNode;
      if (parent === root && current.nodeType === Node.ELEMENT_NODE) {
        const el = current as HTMLElement;
        if (isBlockElement(el)) return el;
        return null;
      }
      current = parent;
    }
    return null;
  }

  dispose(): void {
    // No cleanup needed
  }

  /**
   * Public accessor for mapping a linear offset to a DOM { node, offset }
   * pair in the adapter's coordinate space. CursorRenderer uses this to
   * stay consistent with getText() / getCursorPosition() when drawing
   * overlays (notably the visual-mode selection rects). Without it the
   * renderer would have to re-implement the walker + empty-block anchor
   * logic and get blank-line positions wrong.
   */
  offsetToDomPosition(offset: number): { node: Node; offset: number } {
    return this.offsetToNodePosition(offset);
  }

  // ---- Private helpers for Selection/Range <-> offset conversion ----

  /**
   * Convert a DOM Range endpoint to an offset in getText()'s coordinate
   * space. Uses the Text-node → offset map produced by computeTextView(),
   * which may come from either the DOM walker or from `innerText` matching.
   * That shared mapping is what keeps getText(), getCursorPosition() and
   * offsetToNodePosition() all in agreement even when a rich editor's DOM
   * (ProseMirror, Lexical, Slate, Tiptap) contains line breaks the walker
   * alone doesn't recognize.
   */
  private rangeToOffset(range: Range, useStart: boolean): number {
    const targetNode = useStart ? range.startContainer : range.endContainer;
    const targetOffset = useStart ? range.startOffset : range.endOffset;
    const root = this.element;
    const { text, textNodes, emptyAnchors } = computeTextView(root);

    // Target is a text node — add the in-node offset to the node's base.
    if (targetNode.nodeType === Node.TEXT_NODE) {
      for (const entry of textNodes) {
        if (entry.node === targetNode) {
          const content = entry.node.textContent ?? '';
          const clamped = Math.max(0, Math.min(targetOffset, content.length));
          return entry.start + clamped;
        }
      }
      return 0;
    }

    // Selection is anchored on an element. If that element is an empty-block
    // anchor (e.g. a blank line's <p> in Tiptap), or the selection is on a
    // descendant that lives inside one, use the anchor's offset directly.
    // This is what lets j/k, Shift+Enter cursor tracking, and the block
    // cursor overlay all agree that the caret is on the blank line.
    for (const anchor of emptyAnchors) {
      if (anchor.element === targetNode || anchor.element.contains(targetNode)) {
        return anchor.start;
      }
    }

    // Otherwise walk through text nodes and land on the first one at or
    // after the target position.
    const doc = root.ownerDocument;
    const probe = doc.createRange();
    try {
      probe.setStart(targetNode, targetOffset);
      probe.setEnd(targetNode, targetOffset);
    } catch {
      return 0;
    }

    for (const entry of textNodes) {
      let cmp: number;
      try {
        cmp = probe.comparePoint(entry.node, 0);
      } catch {
        continue;
      }
      if (cmp >= 0) {
        // This text node starts at or after the target — land here so the
        // cursor sits at the start of the next visible text.
        return entry.start;
      }
    }

    // All text nodes come before the target — cursor is past the last one.
    return text.length;
  }

  /**
   * Convert a linear character offset (in the same coord space as getText())
   * to a { node, offset } pair suitable for Range.setStart / Range.setEnd.
   */
  private offsetToNodePosition(offset: number): { node: Node; offset: number } {
    const root = this.element;
    const { text, textNodes, emptyAnchors } = computeTextView(root);
    const clamped = Math.max(0, Math.min(offset, text.length));

    // Blank-line positions (empty <p> in Tiptap, empty <div> in other editors)
    // have no text node. Land inside the anchor element so the browser caret
    // renders on the correct line. Without this, setCursorPosition(4) for
    // text "the\n" falls back to end-of-"the" and the cursor visually stays
    // on line 1 even though our offset math says line 2.
    for (const anchor of emptyAnchors) {
      if (anchor.start === clamped) {
        return { node: anchor.element, offset: 0 };
      }
    }

    // Prefer placing the cursor inside a text node so framework editors
    // (ProseMirror/Lexical) treat the selection as a "real" text position.
    for (let i = 0; i < textNodes.length; i++) {
      const entry = textNodes[i];
      const end = entry.start + (entry.node.textContent?.length ?? 0);
      if (clamped < end) {
        if (clamped >= entry.start) {
          return { node: entry.node, offset: clamped - entry.start };
        }
        // The offset sits in a synthetic newline gap before this text node.
        // Land at the start of this node so the cursor appears on the new line.
        return { node: entry.node, offset: 0 };
      }
      if (clamped === end) {
        // Boundary: if the next node's start == clamped (no newline gap),
        // setting {next, 0} and {current, len} are both valid. Prefer the
        // current node's end for stability.
        if (i + 1 < textNodes.length && textNodes[i + 1].start === clamped) {
          return { node: entry.node, offset: clamped - entry.start };
        }
        return { node: entry.node, offset: clamped - entry.start };
      }
    }

    // Past all text nodes with no exact anchor match — prefer the last
    // anchor (trailing blank lines) over the end of the last text node.
    if (emptyAnchors.length > 0) {
      const last = emptyAnchors[emptyAnchors.length - 1];
      return { node: last.element, offset: 0 };
    }
    if (textNodes.length > 0) {
      const last = textNodes[textNodes.length - 1];
      return {
        node: last.node,
        offset: last.node.textContent?.length ?? 0,
      };
    }
    return { node: root, offset: 0 };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTextAdapter(element: HTMLElement): TextAdapter | null {
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    const textTypes = ['text', 'search', 'url', 'tel', 'password', 'email', ''];
    if (textTypes.includes(type)) {
      return new InputAdapter(element);
    }
    return null;
  }

  if (element instanceof HTMLTextAreaElement) {
    return new TextareaAdapter(element);
  }

  const ceAttr = element.getAttribute('contenteditable');
  if (ceAttr === 'true' || ceAttr === '' || ceAttr === 'plaintext-only') {
    return new ContentEditableAdapter(element);
  }
  // IDL fallback — returns 'inherit' on descendants, so it only identifies
  // explicit editor roots even when the attribute isn't reflected back.
  const ceIdl = element.contentEditable;
  if (ceIdl === 'true' || ceIdl === 'plaintext-only') {
    return new ContentEditableAdapter(element);
  }

  return null;
}

// ── Monospace font override ────────────────────────────────────────

interface FontStash {
  fontFamily: string;
  fontFamilyPriority: string;
  fontVariantLigatures: string;
  fontVariantLigaturesPriority: string;
  fontFeatureSettings: string;
  fontFeatureSettingsPriority: string;
}

const fontStash = new WeakMap<HTMLElement, FontStash>();

export function applyMonospaceFont(element: HTMLElement): void {
  if (!fontStash.has(element)) {
    fontStash.set(element, {
      fontFamily: element.style.getPropertyValue('font-family'),
      fontFamilyPriority: element.style.getPropertyPriority('font-family'),
      fontVariantLigatures: element.style.getPropertyValue('font-variant-ligatures'),
      fontVariantLigaturesPriority: element.style.getPropertyPriority('font-variant-ligatures'),
      fontFeatureSettings: element.style.getPropertyValue('font-feature-settings'),
      fontFeatureSettingsPriority: element.style.getPropertyPriority('font-feature-settings'),
    });
  }
  element.style.setProperty('font-family', MONOSPACE_FONT_STACK, 'important');
  element.style.setProperty('font-variant-ligatures', 'none', 'important');
  element.style.setProperty('font-feature-settings', 'normal', 'important');
}

export function restoreFont(element: HTMLElement): void {
  const stash = fontStash.get(element);
  if (!stash) return;
  fontStash.delete(element);

  const restore = (prop: string, value: string, priority: string) => {
    if (value === '') {
      element.style.removeProperty(prop);
    } else {
      element.style.setProperty(prop, value, priority);
    }
  };
  restore('font-family', stash.fontFamily, stash.fontFamilyPriority);
  restore('font-variant-ligatures', stash.fontVariantLigatures, stash.fontVariantLigaturesPriority);
  restore('font-feature-settings', stash.fontFeatureSettings, stash.fontFeatureSettingsPriority);
}
