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
import { ContentEditableAdapter } from './text-adapter.js';

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
  private originalCaretColor: string | null = null;
  private mutationObserver: MutationObserver | null = null;

  private readonly onScrollOrResize = (): void => this.update();
  private readonly onFieldMutation = (): void => this.update();
  private readonly onSelectionChange = (): void => {
    // Only re-render if the active selection belongs to our attached field.
    // Otherwise selection events from elsewhere cause unnecessary churn.
    if (!this.adapter) return;
    const active = document.activeElement;
    if (active === this.adapter.element || this.adapter.element.contains(active)) {
      this.update();
    }
  };

  /** Attach cursor rendering to a field via its TextAdapter. */
  attach(adapter: TextAdapter): void {
    this.adapter = adapter;
    this.createCursorEl();

    // Hide the native blinking caret — our overlay replaces it.
    const el = adapter.element;
    this.originalCaretColor = el.style.caretColor;
    el.style.caretColor = 'transparent';

    el.addEventListener('scroll', this.onScrollOrResize, true);
    el.addEventListener('input', this.onFieldMutation);
    el.addEventListener('keyup', this.onFieldMutation);
    el.addEventListener('mouseup', this.onFieldMutation);
    document.addEventListener('selectionchange', this.onSelectionChange);
    window.addEventListener('scroll', this.onScrollOrResize, true);
    window.addEventListener('resize', this.onScrollOrResize);

    // Rich editors (ProseMirror, Lexical, Slate, CodeMirror 6) sometimes
    // update their DOM without firing an input event we'd see here — they
    // use a transaction pipeline that prevents the default event and
    // re-renders manually. A MutationObserver catches every DOM change, so
    // the block cursor stays in sync after Shift+Enter / Enter even when
    // the editor swallows the input event.
    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(this.onFieldMutation);
      this.mutationObserver.observe(el, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    this.update();
  }

  detach(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    if (this.adapter) {
      const el = this.adapter.element;
      // Restore the original caret color (empty string clears our inline override).
      el.style.caretColor = this.originalCaretColor ?? '';
      this.originalCaretColor = null;

      el.removeEventListener('scroll', this.onScrollOrResize, true);
      el.removeEventListener('input', this.onFieldMutation);
      el.removeEventListener('keyup', this.onFieldMutation);
      el.removeEventListener('mouseup', this.onFieldMutation);
    }
    document.removeEventListener('selectionchange', this.onSelectionChange);
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

    // Draw selection first (behind the cursor).
    if (this.mode === 'visual' && this.selectionRange) {
      this.renderSelection();
    } else {
      this.clearSelectionEls();
    }

    const pos = this.adapter.getCursorPosition();
    const caret = this.getCaretGeometry(pos);
    if (!caret || !this.isWithinField(caret)) {
      this.cursorEl.style.display = 'none';
      return;
    }

    this.cursorEl.style.display = 'block';
    this.cursorEl.style.left = `${caret.x}px`;
    this.cursorEl.style.top = `${caret.y}px`;
    this.cursorEl.style.height = `${caret.height}px`;
    this.cursorEl.dataset.mode = this.mode;

    if (this.mode === 'insert') {
      // Thin blinking I-beam. Animation lives in the stylesheet.
      this.cursorEl.style.width = '2px';
      this.cursorEl.textContent = '';
    } else {
      // Opaque block. Render the character under the cursor inside the
      // overlay so it stays readable against the solid background.
      this.cursorEl.style.width = `${caret.charWidth}px`;
      this.syncFontToField(caret.height);
      const text = this.adapter.getText();
      const ch = pos < text.length ? text[pos] : '';
      this.cursorEl.textContent = ch && ch !== '\n' ? ch : '';
    }
  }

  /**
   * Copy every font/line-box property from the field so the glyph rendered
   * inside the overlay lands at the same baseline as the underlying text.
   * We pin line-height to the measured caret height (a pixel number) because
   * `getComputedStyle(...).lineHeight` can return the keyword "normal" in
   * some engines, which we cannot reliably feed back through `style`.
   */
  private syncFontToField(caretHeight: number): void {
    if (!this.cursorEl || !this.adapter) return;
    const cs = window.getComputedStyle(this.adapter.element);
    const style = this.cursorEl.style;
    style.fontFamily = cs.fontFamily;
    style.fontSize = cs.fontSize;
    style.fontWeight = cs.fontWeight;
    style.fontStyle = cs.fontStyle;
    style.fontVariant = cs.fontVariant;
    style.fontStretch = cs.fontStretch;
    style.letterSpacing = cs.letterSpacing;
    style.wordSpacing = cs.wordSpacing;
    style.textTransform = cs.textTransform;
    style.textIndent = '0';
    style.lineHeight = `${caretHeight}px`;
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

  private getContentEditableCaret(el: HTMLElement, _pos: number): CaretGeometry | null {
    // setCursorPosition has already placed the live Selection at the right
    // DOM position — inside a text node for positions on text, or inside an
    // empty block (Tiptap: `<p class="is-empty"><br trailingBreak/></p>`)
    // for blank lines. Measure off that selection directly rather than
    // re-walking innerText, which has no entry for the blank line.
    const doc = el.ownerDocument;
    const win = doc.defaultView ?? window;
    const sel = win.getSelection();

    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      const offset = range.startOffset;

      if (node.nodeType === Node.TEXT_NODE) {
        const geom = this.measureTextNodeCaret(el, node as Text, offset);
        if (geom) return geom;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const geom = this.measureElementAnchorCaret(el, node as Element, offset);
        if (geom) return geom;
      }
    }

    // No usable selection — empty field, or selection not initialised yet.
    return this.emptyFieldCaret(el);
  }

  private measureTextNodeCaret(
    el: HTMLElement,
    tnode: Text,
    offset: number,
  ): CaretGeometry | null {
    const doc = el.ownerDocument;
    const textLen = tnode.textContent?.length ?? 0;
    const clamped = Math.max(0, Math.min(offset, textLen));

    // Extend by one character to capture the glyph rect (x/y/width/height).
    if (clamped < textLen) {
      try {
        const r = doc.createRange();
        r.setStart(tnode, clamped);
        r.setEnd(tnode, clamped + 1);
        const rects = r.getClientRects();
        if (rects.length > 0) {
          const rect = rects[0];
          if (rect.height > 0) {
            return {
              x: rect.left,
              y: rect.top,
              height: rect.height,
              charWidth: rect.width > 0 ? rect.width : measureOneChar(el),
            };
          }
        }
      } catch {
        /* fall through to collapsed measurement */
      }
    }

    // End-of-text-node: extension isn't possible, so use a collapsed range.
    try {
      const r = doc.createRange();
      r.setStart(tnode, clamped);
      r.collapse(true);
      const rect = r.getBoundingClientRect();
      if (rect.height > 0 || rect.top !== 0 || rect.left !== 0) {
        return {
          x: rect.left,
          y: rect.top,
          height: rect.height || computeLineHeight(el),
          charWidth: measureOneChar(el),
        };
      }
    } catch {
      /* fall through */
    }

    return null;
  }

  /**
   * The selection is anchored on an element, not a text node. Happens when
   * the cursor sits on a blank line — Tiptap's `<p class="is-empty"><br
   * trailingBreak/></p>` has no text node, so we land on the `<p>` itself.
   *
   * Collapsed Range rects on element anchors are unreliable in Chrome
   * (often `(0,0,0,0)`), so we reach for the anchor element's own
   * `getBoundingClientRect()` — its content box is exactly where the block
   * cursor should sit.
   */
  private measureElementAnchorCaret(
    el: HTMLElement,
    anchor: Element,
    offset: number,
  ): CaretGeometry | null {
    const doc = el.ownerDocument;

    // First try the Range path — Chrome sometimes gives a usable rect here.
    try {
      const r = doc.createRange();
      r.setStart(anchor, offset);
      r.collapse(true);
      const rect = r.getBoundingClientRect();
      if (rect.height > 0) {
        return {
          x: rect.left,
          y: rect.top,
          height: rect.height,
          charWidth: measureOneChar(el),
        };
      }
    } catch {
      /* fall through */
    }

    // Fallback: use the anchor element itself. This always produces a real
    // rect when the element is rendered, so the block cursor reliably
    // appears on blank lines.
    const rect = anchor.getBoundingClientRect();
    if (rect.height > 0 || rect.width > 0) {
      const cs = window.getComputedStyle(anchor);
      const lineHeight =
        anchor instanceof HTMLElement ? computeLineHeight(anchor) : computeLineHeight(el);
      return {
        x: rect.left + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.borderLeftWidth) || 0),
        y: rect.top + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.borderTopWidth) || 0),
        height: lineHeight || rect.height,
        charWidth: measureOneChar(el),
      };
    }

    return null;
  }

  private emptyFieldCaret(el: HTMLElement): CaretGeometry {
    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    return {
      x: rect.left + (parseFloat(cs.paddingLeft) || 0),
      y: rect.top + (parseFloat(cs.paddingTop) || 0),
      height: computeLineHeight(el),
      charWidth: measureOneChar(el),
    };
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
    // Use the adapter's own offset→DOM mapping so selection rendering stays
    // in the same coordinate space as getText() / getCursorPosition(). That
    // includes empty-block anchors (Tiptap's blank <p>), so selections that
    // span a blank line produce a highlight on that line instead of
    // collapsing to zero.
    const adapter = this.adapter;
    if (!(adapter instanceof ContentEditableAdapter)) return [];

    const start = adapter.offsetToDomPosition(lo);
    const end = adapter.offsetToDomPosition(hi);

    try {
      const range = el.ownerDocument.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const rects = Array.from(range.getClientRects(), (r) => ({
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      }));

      // A selection that ends at an empty-block anchor (blank line in
      // Tiptap) gets no rect for that trailing blank line — the Range ends
      // at `(<p class="is-empty">, 0)` and the <p> contributes no visible
      // content of its own. Synthesise a rect from the anchor element so
      // the user sees the blank line highlighted like in real Vim.
      if (end.node.nodeType === Node.ELEMENT_NODE && hi > lo) {
        const anchor = end.node as Element;
        const elRect = anchor.getBoundingClientRect();
        if (elRect.height > 0) {
          const cs = window.getComputedStyle(anchor);
          const lineHeight =
            anchor instanceof HTMLElement
              ? computeLineHeight(anchor)
              : computeLineHeight(el);
          const x =
            elRect.left +
            (parseFloat(cs.paddingLeft) || 0) +
            (parseFloat(cs.borderLeftWidth) || 0);
          const y =
            elRect.top +
            (parseFloat(cs.paddingTop) || 0) +
            (parseFloat(cs.borderTopWidth) || 0);
          const alreadyCovered = rects.some(
            (r) => Math.abs(r.top - y) < 1 && r.width > 0,
          );
          if (!alreadyCovered) {
            rects.push({
              left: x,
              top: y,
              width: Math.max(measureOneChar(el), 6),
              height: lineHeight || elRect.height,
            });
          }
        }
      }

      return rects;
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
