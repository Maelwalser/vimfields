/**
 * StatusBar renders a small floating indicator near the bottom-right
 * of the active field showing the current Vim mode and pending command buffer.
 */

import type { VimMode } from './cursor-renderer.js';

const STATUS_CLASS = 'vimfields-status-bar';
const STYLE_ID = 'vimfields-injected-styles';

const MODE_LABELS: Record<VimMode, string> = {
  normal: '-- NORMAL --',
  insert: '-- INSERT --',
  visual: '-- VISUAL --',
};

export class StatusBar {
  private el: HTMLDivElement | null = null;
  private modeSpan: HTMLSpanElement | null = null;
  private bufferSpan: HTMLSpanElement | null = null;
  private targetElement: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    this.injectStyles();
  }

  /** Show the status bar anchored to a field element. */
  attach(target: HTMLElement): void {
    this.targetElement = target;
    this.createElement();
    this.position();

    // Reposition on resize/scroll
    this.resizeObserver = new ResizeObserver(() => this.position());
    this.resizeObserver.observe(target);
  }

  detach(): void {
    this.el?.remove();
    this.el = null;
    this.modeSpan = null;
    this.bufferSpan = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.targetElement = null;
  }

  setMode(mode: VimMode): void {
    if (this.modeSpan) {
      this.modeSpan.textContent = MODE_LABELS[mode];
    }
    if (this.el) {
      this.el.dataset.mode = mode;
    }
  }

  setCommandBuffer(buffer: string): void {
    if (this.bufferSpan) {
      this.bufferSpan.textContent = buffer;
    }
  }

  /** Reposition relative to the target element. */
  position(): void {
    if (!this.el || !this.targetElement) return;

    const rect = this.targetElement.getBoundingClientRect();
    this.el.style.left = `${rect.right - this.el.offsetWidth - 4}px`;
    this.el.style.top = `${rect.bottom - this.el.offsetHeight - 4}px`;
  }

  // ---------- Private ----------

  private createElement(): void {
    if (this.el) return;

    this.el = document.createElement('div');
    this.el.className = STATUS_CLASS;
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('role', 'status');
    this.el.dataset.mode = 'normal';

    this.modeSpan = document.createElement('span');
    this.modeSpan.className = 'vimfields-status-mode';
    this.modeSpan.textContent = MODE_LABELS.normal;

    this.bufferSpan = document.createElement('span');
    this.bufferSpan.className = 'vimfields-status-buffer';

    this.el.appendChild(this.modeSpan);
    this.el.appendChild(this.bufferSpan);
    document.body.appendChild(this.el);
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;

    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    // The CSS file will be bundled as a content script style
    // For runtime, we inject the styles inline
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = getInlineStyles();
    document.head.appendChild(style);
  }
}

/**
 * Returns the CSS as a string for injection.
 * This mirrors src/styles/vimfields.css to ensure styles are available
 * even if the CSS file isn't loaded as a separate resource.
 */
function getInlineStyles(): string {
  return `
/* Block cursor */
.vimfields-block-cursor {
  position: fixed;
  pointer-events: none;
  z-index: 2147483647;
  background: currentColor;
  mix-blend-mode: difference;
  border-radius: 1px;
  transition: left 50ms ease-out, top 50ms ease-out;
}

.vimfields-block-cursor[data-mode="visual"] {
  background: Highlight;
  opacity: 0.4;
  mix-blend-mode: normal;
}

/* Status bar */
.vimfields-status-bar {
  position: fixed;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 8px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.4;
  color: #e0e0e0;
  background: rgba(30, 30, 30, 0.85);
  border-radius: 4px;
  pointer-events: none;
  user-select: none;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  white-space: nowrap;
}

.vimfields-status-bar[data-mode="insert"] {
  color: #a8db8f;
}

.vimfields-status-bar[data-mode="visual"] {
  color: #c4a6f5;
}

.vimfields-status-buffer {
  color: #888;
}

/* Visual mode selection highlight */
.vimfields-visual-highlight {
  position: absolute;
  pointer-events: none;
  background: Highlight;
  opacity: 0.3;
  z-index: 2147483646;
}

/* Measurement span (always hidden) */
.vimfields-measure {
  position: absolute !important;
  visibility: hidden !important;
  pointer-events: none !important;
  white-space: pre !important;
}

/* Respect prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  .vimfields-block-cursor {
    transition: none;
  }
}
`;
}
