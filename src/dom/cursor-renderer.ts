/**
 * CursorRenderer renders a block cursor overlay for normal/visual mode,
 * positioned over the character at the current cursor position.
 * Hidden in insert mode.
 */

import type { TextAdapter } from './text-adapter.js';

export type VimMode = 'normal' | 'insert' | 'visual';

const CURSOR_CLASS = 'vimfields-block-cursor';

export class CursorRenderer {
  private cursorEl: HTMLDivElement | null = null;
  private measureSpan: HTMLSpanElement | null = null;
  private mode: VimMode = 'normal';
  private adapter: TextAdapter | null = null;
  private animFrameId: number | null = null;

  /** Attach cursor rendering to a field via its TextAdapter. */
  attach(adapter: TextAdapter): void {
    this.adapter = adapter;
    this.createElements();
    this.update();
  }

  detach(): void {
    this.cursorEl?.remove();
    this.measureSpan?.remove();
    this.cursorEl = null;
    this.measureSpan = null;
    this.adapter = null;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  setMode(mode: VimMode): void {
    this.mode = mode;
    this.update();
  }

  /** Call after cursor movement or text change. */
  update(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.animFrameId = requestAnimationFrame(() => {
      this.animFrameId = null;
      this.render();
    });
  }

  // ---------- Private ----------

  private createElements(): void {
    if (this.cursorEl) return;

    this.cursorEl = document.createElement('div');
    this.cursorEl.className = CURSOR_CLASS;
    this.cursorEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.cursorEl);

    this.measureSpan = document.createElement('span');
    this.measureSpan.className = 'vimfields-measure';
    this.measureSpan.style.position = 'absolute';
    this.measureSpan.style.visibility = 'hidden';
    this.measureSpan.style.whiteSpace = 'pre';
    this.measureSpan.style.pointerEvents = 'none';
    this.measureSpan.textContent = 'X';
    document.body.appendChild(this.measureSpan);
  }

  private render(): void {
    if (!this.cursorEl || !this.adapter) return;

    // Hide in insert mode
    if (this.mode === 'insert') {
      this.cursorEl.style.display = 'none';
      return;
    }

    const el = this.adapter.element;
    const pos = this.adapter.getCursorPosition();
    const text = this.adapter.getText();
    const charAtCursor = pos < text.length ? text[pos] : ' ';

    // Copy font styles to measurement span
    const computed = window.getComputedStyle(el);
    if (this.measureSpan) {
      this.measureSpan.style.font = computed.font;
      this.measureSpan.style.letterSpacing = computed.letterSpacing;
      this.measureSpan.textContent = charAtCursor === '\n' ? ' ' : charAtCursor;
    }

    const charRect = this.getCharRect(el, pos, computed);
    if (!charRect) {
      this.cursorEl.style.display = 'none';
      return;
    }

    const charWidth = this.measureSpan?.getBoundingClientRect().width ?? 8;
    const charHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;

    this.cursorEl.style.display = 'block';
    this.cursorEl.style.left = `${charRect.x}px`;
    this.cursorEl.style.top = `${charRect.y}px`;
    this.cursorEl.style.width = `${charWidth}px`;
    this.cursorEl.style.height = `${charHeight}px`;

    // Visual mode gets a different data attribute for CSS styling
    this.cursorEl.dataset.mode = this.mode;
  }

  /**
   * Approximate the character rectangle by using the element's bounding rect
   * and computing offsets from the text content.
   */
  private getCharRect(
    el: HTMLElement,
    pos: number,
    computed: CSSStyleDeclaration,
  ): { x: number; y: number } | null {
    const rect = el.getBoundingClientRect();

    // For contenteditable, try using the Range API for precise positioning
    if (el.isContentEditable) {
      return this.getContentEditableCharPos(el, pos);
    }

    // For input/textarea, compute from element rect + character offset
    const text = (el as HTMLInputElement | HTMLTextAreaElement).value ?? '';
    const paddingLeft = parseFloat(computed.paddingLeft) || 0;
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const borderLeft = parseFloat(computed.borderLeftWidth) || 0;
    const borderTop = parseFloat(computed.borderTopWidth) || 0;
    const scrollLeft = (el as HTMLTextAreaElement).scrollLeft ?? 0;
    const scrollTop = (el as HTMLTextAreaElement).scrollTop ?? 0;

    const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;

    if (el instanceof HTMLTextAreaElement) {
      const lines = text.substring(0, pos).split('\n');
      const currentLine = lines.length - 1;
      const colText = lines[currentLine];

      const colWidth = this.measureText(colText, computed);
      return {
        x: rect.left + borderLeft + paddingLeft + colWidth - scrollLeft,
        y: rect.top + borderTop + paddingTop + currentLine * lineHeight - scrollTop,
      };
    }

    // Single-line input
    const beforeCursor = text.substring(0, pos);
    const textWidth = this.measureText(beforeCursor, computed);
    return {
      x: rect.left + borderLeft + paddingLeft + textWidth - scrollLeft,
      y: rect.top + borderTop + paddingTop,
    };
  }

  private getContentEditableCharPos(
    el: HTMLElement,
    pos: number,
  ): { x: number; y: number } | null {
    const text = el.innerText ?? '';
    if (text.length === 0) {
      const rect = el.getBoundingClientRect();
      const computed = window.getComputedStyle(el);
      return {
        x: rect.left + (parseFloat(computed.paddingLeft) || 0),
        y: rect.top + (parseFloat(computed.paddingTop) || 0),
      };
    }

    // Walk text nodes to find the right position
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    let node: Text | null;

    while ((node = walker.nextNode() as Text | null)) {
      const len = node.textContent?.length ?? 0;
      if (charCount + len >= pos) {
        const range = document.createRange();
        const localOffset = Math.min(pos - charCount, len);
        range.setStart(node, localOffset);
        range.setEnd(node, Math.min(localOffset + 1, len));
        const rects = range.getClientRects();
        if (rects.length > 0) {
          return { x: rects[0].left, y: rects[0].top };
        }
        break;
      }
      charCount += len;
    }

    return null;
  }

  private measureText(text: string, computed: CSSStyleDeclaration): number {
    if (!this.measureSpan) return 0;
    this.measureSpan.style.font = computed.font;
    this.measureSpan.style.letterSpacing = computed.letterSpacing;
    this.measureSpan.textContent = text || '\u200B';
    const width = this.measureSpan.getBoundingClientRect().width;
    // Zero-width space has no width, so return 0 for empty text
    return text ? width : 0;
  }
}
