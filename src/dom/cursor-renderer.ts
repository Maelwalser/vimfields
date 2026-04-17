/**
 * CursorRenderer draws a block cursor overlay and a visual-mode selection
 * highlight on top of the active editable field.
 *
 * Positioning strategy:
 *   • <input> / <textarea> — a hidden "mirror" <div> whose computed layout
 *     matches the field. A marker <span> is spliced in at the cursor offset;
 *     its bounding rect gives the exact caret coordinates, honoring
 *     word-wrap, padding, letter-spacing, tabs, scroll offsets and RTL.
 *   • contenteditable — uses the Range API directly, because the field's
 *     own DOM is already laid out on screen.
 *
 * The cursor is sized to the width of the character under it (so it looks
 * the same whether you're over an "i" or a "W" in a proportional font).
 * At end-of-text or on a newline, a space-width caret is used.
 */

import type { TextAdapter } from './text-adapter.js';

export type VimMode = 'normal' | 'insert' | 'visual';

const CURSOR_CLASS = 'vimfields-block-cursor';
const SELECTION_CLASS = 'vimfields-selection-rect';
const MIRROR_CLASS = 'vimfields-mirror';

// Computed-style properties we copy from the field onto the mirror div so
// layout (and therefore the caret's measured position) matches.
const MIRRORED_PROPERTIES = [
  'boxSizing',
  'width',
  'height',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
  'fontSizeAdjust', 'lineHeight', 'fontFamily',
  'textAlign', 'textTransform', 'textIndent', 'textDecoration',
  'letterSpacing', 'wordSpacing',
  'tabSize', 'MozTabSize',
  'direction',
] as const;

interface CaretGeometry {
  x: number;
  y: number;
  height: number;
  charWidth: number;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class CursorRenderer {
  private cursorEl: HTMLDivElement | null = null;
  private mirrorEl: HTMLDivElement | null = null;
  private selectionEls: HTMLDivElement[] = [];
  private mode: VimMode = 'normal';
  private adapter: TextAdapter | null = null;
  private selectionRange: { start: number; end: number } | null = null;
  private animFrameId: number | null = null;

  private readonly onScrollOrResize = (): void => this.update();

  /** Attach cursor rendering to a field via its TextAdapter. */
  attach(adapter: TextAdapter): void {
    this.adapter = adapter;
    this.createCursorEl();
    adapter.element.addEventListener('scroll', this.onScrollOrResize, true);
    window.addEventListener('scroll', this.onScrollOrResize, true);
    window.addEventListener('resize', this.onScrollOrResize);
    this.update();
  }

  detach(): void {
    if (this.adapter) {
      this.adapter.element.removeEventListener('scroll', this.onScrollOrResize, true);
    }
    window.removeEventListener('scroll', this.onScrollOrResize, true);
    window.removeEventListener('resize', this.onScrollOrResize);

    this.cursorEl?.remove();
    this.mirrorEl?.remove();
    this.clearSelectionEls();
    this.cursorEl = null;
    this.mirrorEl = null;
    this.adapter = null;
    this.selectionRange = null;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  setMode(mode: VimMode): void {
    this.mode = mode;
    if (mode !== 'visual') {
      this.selectionRange = null;
    }
    this.update();
  }

  /** Set the visual-mode selection range (half-open: [start, end)). */
  setSelection(start: number, end: number): void {
    this.selectionRange = { start, end };
    this.update();
  }

  clearSelection(): void {
    this.selectionRange = null;
    this.update();
  }

  /** Call after cursor movement, text change, or layout change. */
  update(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.animFrameId = requestAnimationFrame(() => {
      this.animFrameId = null;
      this.render();
    });
  }

  // ─── Rendering ────────────────────────────────────────────────────────

  private render(): void {
    if (!this.cursorEl || !this.adapter) return;

    if (this.mode === 'insert') {
      this.cursorEl.style.display = 'none';
      this.clearSelectionEls();
      return;
    }

    // Draw selection first (behind the cursor).
    if (this.mode === 'visual' && this.selectionRange) {
      this.renderSelection();
    } else {
      this.clearSelectionEls();
    }

    const caret = this.getCaretGeometry(this.adapter.getCursorPosition());
    if (!caret || !this.isWithinField(caret)) {
      this.cursorEl.style.display = 'none';
      return;
    }

    this.cursorEl.style.display = 'block';
    this.cursorEl.style.left = `${caret.x}px`;
    this.cursorEl.style.top = `${caret.y}px`;
    this.cursorEl.style.width = `${caret.charWidth}px`;
    this.cursorEl.style.height = `${caret.height}px`;
    this.cursorEl.dataset.mode = this.mode;
  }

  private renderSelection(): void {
    if (!this.adapter || !this.selectionRange) {
      this.clearSelectionEls();
      return;
    }
    const text = this.adapter.getText();
    const lo = Math.max(0, Math.min(this.selectionRange.start, text.length));
    const hi = Math.max(0, Math.min(this.selectionRange.end, text.length));
    if (hi <= lo) {
      this.clearSelectionEls();
      return;
    }

    const rects = this.getSelectionRects(lo, hi);
    const fieldRect = this.adapter.element.getBoundingClientRect();

    // Reuse existing overlay elements where possible, then trim or grow.
    let used = 0;
    for (const rect of rects) {
      const clipped = this.clipToField(rect, fieldRect);
      if (!clipped) continue;

      let el = this.selectionEls[used];
      if (!el) {
        el = document.createElement('div');
        el.className = SELECTION_CLASS;
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
        this.selectionEls.push(el);
      }
      el.style.left = `${clipped.left}px`;
      el.style.top = `${clipped.top}px`;
      el.style.width = `${clipped.width}px`;
      el.style.height = `${clipped.height}px`;
      used++;
    }

    while (this.selectionEls.length > used) {
      this.selectionEls.pop()?.remove();
    }
  }

  // ─── Geometry helpers ─────────────────────────────────────────────────

  private getCaretGeometry(pos: number): CaretGeometry | null {
    if (!this.adapter) return null;
    const el = this.adapter.element;

    if (el.isContentEditable) {
      return this.getContentEditableCaret(el, pos);
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return this.getFieldCaret(el, pos);
    }
    return null;
  }

  private getFieldCaret(
    el: HTMLInputElement | HTMLTextAreaElement,
    pos: number,
  ): CaretGeometry | null {
    const mirror = this.ensureMirror(el);
    if (!mirror) return null;

    const text = el.value ?? '';
    const safePos = Math.max(0, Math.min(pos, text.length));
    const charAtCursor = safePos < text.length ? text[safePos] : '';
    const displayChar = charAtCursor && charAtCursor !== '\n' ? charAtCursor : ' ';

    // Replay text into the mirror with a marker span in place of the cursor char.
    mirror.textContent = '';
    mirror.appendChild(document.createTextNode(text.substring(0, safePos)));

    const marker = document.createElement('span');
    marker.textContent = displayChar;
    mirror.appendChild(marker);

    // Re-emit the newline (so the rest of the text wraps properly) or the
    // rest of the text minus the char we just drew inside the marker.
    if (charAtCursor === '\n') {
      mirror.appendChild(document.createTextNode('\n'));
      mirror.appendChild(document.createTextNode(text.substring(safePos + 1)));
    } else if (charAtCursor) {
      mirror.appendChild(document.createTextNode(text.substring(safePos + 1)));
    }

    const markerRect = marker.getBoundingClientRect();
    const fieldRect = el.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();

    const charWidth = markerRect.width > 0 ? markerRect.width : measureOneChar(el);
    const height = markerRect.height > 0 ? markerRect.height : computeLineHeight(el);

    const yShift = el instanceof HTMLInputElement ? inputVerticalCenterOffset(el) : 0;
    const x = fieldRect.left + (markerRect.left - mirrorRect.left) - el.scrollLeft;
    const y = fieldRect.top + (markerRect.top - mirrorRect.top) - el.scrollTop + yShift;

    return { x, y, height, charWidth };
  }

  private getContentEditableCaret(el: HTMLElement, pos: number): CaretGeometry | null {
    const text = el.innerText ?? '';
    if (text.length === 0) {
      const rect = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      return {
        x: rect.left + (parseFloat(cs.paddingLeft) || 0),
        y: rect.top + (parseFloat(cs.paddingTop) || 0),
        height: computeLineHeight(el),
        charWidth: measureOneChar(el),
      };
    }

    const safePos = Math.max(0, Math.min(pos, text.length));
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    let node: Text | null;
    let lastNode: Text | null = null;
    let lastLen = 0;

    while ((node = walker.nextNode() as Text | null)) {
      const len = node.textContent?.length ?? 0;
      lastNode = node;
      lastLen = len;
      if (charCount + len > safePos) {
        const local = safePos - charCount;
        const range = document.createRange();
        range.setStart(node, local);
        range.setEnd(node, Math.min(local + 1, len));
        const rects = range.getClientRects();
        if (rects.length > 0) {
          const r = rects[0];
          return {
            x: r.left,
            y: r.top,
            height: r.height || computeLineHeight(el),
            charWidth: r.width > 0 ? r.width : measureOneChar(el),
          };
        }
      }
      charCount += len;
    }

    // End of text: anchor at the end of the last text node.
    if (lastNode) {
      const range = document.createRange();
      range.setStart(lastNode, lastLen);
      range.collapse(true);
      const rects = range.getClientRects();
      if (rects.length > 0) {
        return {
          x: rects[0].left,
          y: rects[0].top,
          height: rects[0].height || computeLineHeight(el),
          charWidth: measureOneChar(el),
        };
      }
    }
    return null;
  }

  private getSelectionRects(lo: number, hi: number): Rect[] {
    if (!this.adapter) return [];
    const el = this.adapter.element;

    if (el.isContentEditable) {
      return this.getContentEditableSelectionRects(el, lo, hi);
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return this.getFieldSelectionRects(el, lo, hi);
    }
    return [];
  }

  private getFieldSelectionRects(
    el: HTMLInputElement | HTMLTextAreaElement,
    lo: number,
    hi: number,
  ): Rect[] {
    const mirror = this.ensureMirror(el);
    if (!mirror) return [];

    const text = el.value ?? '';
    mirror.textContent = '';
    mirror.appendChild(document.createTextNode(text.substring(0, lo)));

    // Wrap each selected char in its own span so we can read per-visual-line
    // rects. Newlines stay as plain text so wrapping still works.
    const charSpans: HTMLSpanElement[] = [];
    for (let i = lo; i < hi; i++) {
      const ch = text[i];
      if (ch === '\n') {
        mirror.appendChild(document.createTextNode('\n'));
        continue;
      }
      const span = document.createElement('span');
      span.textContent = ch;
      mirror.appendChild(span);
      charSpans.push(span);
    }
    mirror.appendChild(document.createTextNode(text.substring(hi)));

    const fieldRect = el.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const yShift = el instanceof HTMLInputElement ? inputVerticalCenterOffset(el) : 0;
    const dx = fieldRect.left - mirrorRect.left - el.scrollLeft;
    const dy = fieldRect.top - mirrorRect.top - el.scrollTop + yShift;

    // Merge per-char rects that sit on the same visual line.
    const rows = new Map<number, { left: number; right: number; top: number; bottom: number }>();
    for (const span of charSpans) {
      const r = span.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const key = Math.round(r.top);
      const left = r.left + dx;
      const right = r.right + dx;
      const top = r.top + dy;
      const bottom = r.bottom + dy;
      const existing = rows.get(key);
      if (existing) {
        existing.left = Math.min(existing.left, left);
        existing.right = Math.max(existing.right, right);
        existing.top = Math.min(existing.top, top);
        existing.bottom = Math.max(existing.bottom, bottom);
      } else {
        rows.set(key, { left, right, top, bottom });
      }
    }

    const out: Rect[] = [];
    for (const { left, right, top, bottom } of rows.values()) {
      out.push({ left, top, width: right - left, height: bottom - top });
    }
    return out;
  }

  private getContentEditableSelectionRects(el: HTMLElement, lo: number, hi: number): Rect[] {
    const start = offsetToNodeOffset(el, lo);
    const end = offsetToNodeOffset(el, hi);
    if (!start || !end) return [];
    try {
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return Array.from(range.getClientRects(), (r) => ({
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      }));
    } catch {
      return [];
    }
  }

  // ─── Support ──────────────────────────────────────────────────────────

  private createCursorEl(): void {
    if (this.cursorEl) return;
    this.cursorEl = document.createElement('div');
    this.cursorEl.className = CURSOR_CLASS;
    this.cursorEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.cursorEl);
  }

  private clearSelectionEls(): void {
    for (const el of this.selectionEls) el.remove();
    this.selectionEls = [];
  }

  private isWithinField(caret: CaretGeometry): boolean {
    if (!this.adapter) return false;
    const r = this.adapter.element.getBoundingClientRect();
    return (
      caret.x + caret.charWidth > r.left - 1 &&
      caret.x < r.right + 1 &&
      caret.y + caret.height > r.top - 1 &&
      caret.y < r.bottom + 1
    );
  }

  private clipToField(rect: Rect, field: DOMRect): Rect | null {
    const left = Math.max(rect.left, field.left);
    const right = Math.min(rect.left + rect.width, field.right);
    const top = Math.max(rect.top, field.top);
    const bottom = Math.min(rect.top + rect.height, field.bottom);
    if (right <= left || bottom <= top) return null;
    return { left, top, width: right - left, height: bottom - top };
  }

  private ensureMirror(el: HTMLInputElement | HTMLTextAreaElement): HTMLDivElement | null {
    if (!this.mirrorEl) {
      this.mirrorEl = document.createElement('div');
      this.mirrorEl.className = MIRROR_CLASS;
      document.body.appendChild(this.mirrorEl);
    }
    syncMirrorToField(this.mirrorEl, el);
    return this.mirrorEl;
  }
}

// ─── Module-level helpers ────────────────────────────────────────────────

function syncMirrorToField(
  mirror: HTMLDivElement,
  el: HTMLInputElement | HTMLTextAreaElement,
): void {
  const cs = window.getComputedStyle(el);
  const style = mirror.style;

  // Hide the mirror off-screen while keeping it in the normal layout flow.
  style.position = 'absolute';
  style.visibility = 'hidden';
  style.pointerEvents = 'none';
  style.top = '0';
  style.left = '-9999px';
  style.zIndex = '-1';
  style.overflow = 'hidden';
  style.margin = '0';

  for (const prop of MIRRORED_PROPERTIES) {
    // Safe: both sides are CSSStyleDeclaration-shaped with matching keys.
    (style as unknown as Record<string, string>)[prop] =
      (cs as unknown as Record<string, string>)[prop];
  }

  if (el instanceof HTMLInputElement) {
    // Single-line: don't wrap, let width grow so we can read horizontal offsets.
    style.whiteSpace = 'pre';
    style.width = 'auto';
    style.height = cs.height;
  } else {
    // Textareas wrap like the DOM does — pre-wrap preserves whitespace.
    style.whiteSpace = 'pre-wrap';
    style.wordWrap = 'break-word';
    (style as unknown as Record<string, string>)['overflowWrap'] = 'break-word';
  }
}

function offsetToNodeOffset(
  el: HTMLElement,
  offset: number,
): { node: Node; offset: number } | null {
  const text = el.innerText ?? '';
  const clamped = Math.max(0, Math.min(offset, text.length));
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let count = 0;
  let last: Text | null = null;
  let lastLen = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const len = node.textContent?.length ?? 0;
    if (count + len >= clamped) {
      return { node, offset: clamped - count };
    }
    count += len;
    last = node;
    lastLen = len;
  }
  if (last) return { node: last, offset: lastLen };
  return { node: el, offset: 0 };
}

function measureOneChar(el: HTMLElement): number {
  const cs = window.getComputedStyle(el);
  const temp = document.createElement('span');
  temp.style.position = 'absolute';
  temp.style.visibility = 'hidden';
  temp.style.whiteSpace = 'pre';
  temp.style.font = cs.font;
  temp.style.letterSpacing = cs.letterSpacing;
  temp.textContent = 'X';
  document.body.appendChild(temp);
  const width = temp.getBoundingClientRect().width;
  temp.remove();
  return width || 8;
}

function computeLineHeight(el: HTMLElement): number {
  const cs = window.getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight);
  if (!isNaN(lh)) return lh;
  const fs = parseFloat(cs.fontSize);
  return isNaN(fs) ? 16 : fs * 1.2;
}

/**
 * Browsers vertically center text inside single-line <input> elements, but our
 * mirror is a <div> with block-flow that lays text out from the top. When the
 * content box is taller than the line-height (common in chrome UIs like
 * Vivaldi's URL bar), the mirror's caret rect ends up half-a-line above the
 * field's actual glyphs. Returns the pixel offset to shift the cursor down by.
 */
function inputVerticalCenterOffset(el: HTMLInputElement): number {
  const cs = window.getComputedStyle(el);
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const contentHeight = el.clientHeight - padTop - padBottom;
  const lineHeight = computeLineHeight(el);
  const extra = (contentHeight - lineHeight) / 2;
  return extra > 0 ? extra : 0;
}
