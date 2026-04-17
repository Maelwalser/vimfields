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
function computeTextView(root: Element): {
  text: string;
  textNodes: Array<{ node: Text; start: number }>;
} {
  const textNodes: Array<{ node: Text; start: number }> = [];
  let text = '';
  let pendingNewline = false;
  let emittedAny = false;

  const flushPending = (): void => {
    if (pendingNewline) {
      text += '\n';
      pendingNewline = false;
    }
  };

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const content = (node as Text).textContent ?? '';
      if (content.length === 0) return;
      flushPending();
      textNodes.push({ node: node as Text, start: text.length });
      text += content;
      emittedAny = true;
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    if (el.tagName === 'BR') {
      flushPending();
      text += '\n';
      emittedAny = true;
      return;
    }

    const treatAsBlock = el !== root && isBlockElement(el);

    if (treatAsBlock && emittedAny) {
      pendingNewline = true;
    }

    for (const child of Array.from(el.childNodes)) {
      visit(child);
    }

    if (treatAsBlock && emittedAny) {
      pendingNewline = true;
    }
  };

  visit(root);
  return { text, textNodes };
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

  dispose(): void {
    // No cleanup needed
  }

  // ---- Private helpers for Selection/Range <-> offset conversion ----

  /**
   * Walk the subtree, accumulating the same offset that computeTextView()
   * produces, until we reach the Selection endpoint. This keeps cursor
   * coordinates aligned with getText() across <br>s and block boundaries,
   * which is what Shift+Enter produces in Claude/Gemini-style editors.
   */
  private rangeToOffset(range: Range, useStart: boolean): number {
    const targetNode = useStart ? range.startContainer : range.endContainer;
    const targetOffset = useStart ? range.startOffset : range.endOffset;
    const root = this.element;

    // Degenerate case: selection is anchored directly on the contenteditable.
    if (targetNode === root) {
      const { text, textNodes } = computeTextView(root);
      if (targetOffset <= 0) return 0;
      if (targetOffset >= root.childNodes.length) return text.length;
      // Find the offset at the boundary just before child[targetOffset].
      const child = root.childNodes[targetOffset];
      for (const entry of textNodes) {
        if (child.contains(entry.node) || child === entry.node) {
          return entry.start;
        }
      }
      return text.length;
    }

    let offset = 0;
    let emittedAny = false;
    let pendingNewline = false;
    let stopped = false;
    let stoppedAt = 0;

    const flushPending = (): void => {
      if (pendingNewline) {
        offset += 1;
        pendingNewline = false;
      }
    };

    const visit = (node: Node): void => {
      if (stopped) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const content = (node as Text).textContent ?? '';
        if (node === targetNode) {
          flushPending();
          const clampedTargetOffset = Math.max(
            0,
            Math.min(targetOffset, content.length),
          );
          if (clampedTargetOffset > 0) {
            offset += clampedTargetOffset;
            emittedAny = true;
          }
          stoppedAt = offset;
          stopped = true;
          return;
        }
        if (content.length === 0) return;
        flushPending();
        offset += content.length;
        emittedAny = true;
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const el = node as Element;
      if (el.tagName === 'BR') {
        if (node === targetNode) {
          if (targetOffset <= 0) {
            flushPending();
          } else {
            flushPending();
            offset += 1;
            emittedAny = true;
          }
          stoppedAt = offset;
          stopped = true;
          return;
        }
        flushPending();
        offset += 1;
        emittedAny = true;
        return;
      }

      const treatAsBlock = el !== root && isBlockElement(el);

      if (treatAsBlock && emittedAny) {
        pendingNewline = true;
      }

      const children = Array.from(el.childNodes);
      for (let i = 0; i < children.length; i++) {
        if (node === targetNode && i === targetOffset) {
          flushPending();
          stoppedAt = offset;
          stopped = true;
          return;
        }
        visit(children[i]);
        if (stopped) return;
      }

      if (node === targetNode && targetOffset === children.length) {
        flushPending();
        stoppedAt = offset;
        stopped = true;
        return;
      }

      if (treatAsBlock && emittedAny) {
        pendingNewline = true;
      }
    };

    visit(root);
    return stopped ? stoppedAt : offset;
  }

  /**
   * Convert a linear character offset (in the same coord space as getText())
   * to a { node, offset } pair suitable for Range.setStart / Range.setEnd.
   */
  private offsetToNodePosition(offset: number): { node: Node; offset: number } {
    const root = this.element;
    const { text, textNodes } = computeTextView(root);
    const clamped = Math.max(0, Math.min(offset, text.length));

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

    // No text nodes at all, or offset past the last text node.
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
