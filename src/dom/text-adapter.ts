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

function dispatchInputEvents(element: HTMLElement): void {
  // InputEvent for React's synthetic event system
  const inputEvent = new InputEvent('input', {
    bubbles: true,
    cancelable: false,
    inputType: 'insertText',
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

export class ContentEditableAdapter implements TextAdapter {
  readonly element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  getText(): string {
    return this.element.innerText ?? '';
  }

  setText(text: string): void {
    this.element.innerText = text;
    dispatchInputEvents(this.element);
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
   * Walk all text nodes under this.element in DOM order,
   * converting a Selection range endpoint to a linear character offset.
   */
  private rangeToOffset(range: Range, useStart: boolean): number {
    const targetNode = useStart ? range.startContainer : range.endContainer;
    const targetOffset = useStart ? range.startOffset : range.endOffset;

    let charCount = 0;
    const walker = document.createTreeWalker(this.element, NodeFilter.SHOW_TEXT);
    let node: Text | null;

    while ((node = walker.nextNode() as Text | null)) {
      if (node === targetNode) {
        return charCount + targetOffset;
      }
      charCount += node.textContent?.length ?? 0;
    }

    // targetNode might be the element itself (e.g. empty contenteditable)
    if (targetNode === this.element) {
      return targetOffset === 0 ? 0 : this.getText().length;
    }

    return charCount;
  }

  /**
   * Convert a linear character offset to a { node, offset } pair
   * suitable for Range.setStart / Range.setEnd.
   */
  private offsetToNodePosition(offset: number): { node: Node; offset: number } {
    const text = this.getText();
    const clampedOffset = Math.max(0, Math.min(offset, text.length));

    const walker = document.createTreeWalker(this.element, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    let node: Text | null;

    while ((node = walker.nextNode() as Text | null)) {
      const len = node.textContent?.length ?? 0;
      if (charCount + len >= clampedOffset) {
        return { node, offset: clampedOffset - charCount };
      }
      charCount += len;
    }

    // Fallback: element itself (e.g. empty contenteditable)
    return { node: this.element, offset: 0 };
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
  if (
    element.isContentEditable ||
    element.contentEditable === 'true' ||
    ceAttr === 'true' ||
    ceAttr === ''
  ) {
    return new ContentEditableAdapter(element);
  }

  return null;
}
