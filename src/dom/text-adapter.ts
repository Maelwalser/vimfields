/**
 * TextAdapter abstracts text read/write and cursor operations across
 * input, textarea, and contenteditable elements.
 */

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
function isTrailingBreakMarker(el: Element): boolean {
  if (el.tagName !== 'BR') return false;
  const cls = el.getAttribute('class') ?? '';
  return /\btrailingBreak\b/.test(cls) || el.hasAttribute('data-trailing-break');
}

// Editors can smuggle line breaks into text nodes using Unicode line/paragraph
// separator characters (U+2028 / U+2029). Treat them exactly like '\n' so the
// cursor math and motions see them as line boundaries.
function normalizeLineSeparators(s: string): string {
  return s.replace(/[\u2028\u2029]/g, '\n');
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

    const treatAsBlock = el !== root && isBlockElement(el);
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
    // For framework editors (Lexical, ProseMirror, Draft, Slate) that listen
    // to beforeinput/input to drive their internal model, execCommand
    // ('insertText') fires the native event pipeline so the editor stays in
    // sync. Requires focus; if anything fails we rebuild the DOM by hand.
    const active = document.activeElement as Node | null;
    const isFocused =
      active === this.element ||
      (active != null && this.element.contains(active));

    if (isFocused) {
      try {
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(this.element);
          sel.removeAllRanges();
          sel.addRange(range);
          if (document.execCommand('insertText', false, text)) {
            return;
          }
        }
      } catch {
        // fall through to manual DOM rebuild
      }
    }

    // Rebuild as text nodes separated by <br>. innerText's setter would do
    // this in a real browser, but jsdom's is a no-op — doing it explicitly
    // keeps our round-trip consistent with computeTextView() in both.
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
    // Place the selection where the break should go, then ask the browser /
    // editor to insert a line break using the same input pipeline Shift+Enter
    // travels through. execCommand('insertLineBreak') fires a beforeinput with
    // inputType: 'insertLineBreak', which ProseMirror/Lexical handle via their
    // own transaction — setText('insertText', "\n") would strip the newline.
    this.setCursorPosition(position);

    const doc = this.element.ownerDocument;
    let inserted = false;
    try {
      inserted = doc.execCommand('insertLineBreak');
    } catch {
      inserted = false;
    }

    if (!inserted) {
      const sel = doc.defaultView?.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const br = doc.createElement('br');
        range.deleteContents();
        range.insertNode(br);
        dispatchInputEvents(this.element, null);
        inserted = true;
      }
    }

    if (!inserted) return position;

    // Inserting a '\n'-equivalent at `position` shifts everything after it by
    // exactly one offset. The cursor belongs at `position + 1`. We set it
    // explicitly instead of trusting the browser's post-insert Range, which
    // can land in an ambiguous gap between block boundaries.
    const after = position + 1;
    this.setCursorPosition(after);
    return after;
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
