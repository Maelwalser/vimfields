/**
 * StatusBar renders a small floating indicator just below the active field
 * showing the current Vim mode and pending command buffer. It stays anchored
 * via a ResizeObserver plus scroll/resize listeners.
 */

import type { VimMode } from './cursor-renderer.js';

const STATUS_CLASS = 'vimfields-status-bar';
const STYLE_ID = 'vimfields-injected-styles';
const GAP = 4;

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

  private readonly onScrollOrResize = (): void => this.position();

  constructor() {
    this.injectStyles();
  }

  /** Show the status bar anchored to a field element. */
  attach(target: HTMLElement): void {
    this.targetElement = target;
    this.createElement();
    this.position();

    this.resizeObserver = new ResizeObserver(() => this.position());
    this.resizeObserver.observe(target);
    window.addEventListener('scroll', this.onScrollOrResize, true);
    window.addEventListener('resize', this.onScrollOrResize);
  }

  detach(): void {
    this.el?.remove();
    this.el = null;
    this.modeSpan = null;
    this.bufferSpan = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('scroll', this.onScrollOrResize, true);
    window.removeEventListener('resize', this.onScrollOrResize);
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
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const barH = this.el.offsetHeight || 20;

    // Prefer placement below the field; fall back above if no room.
    let top = rect.bottom + GAP;
    if (top + barH > viewportH) {
      top = Math.max(GAP, rect.top - barH - GAP);
    }

    // Anchor to the field's right edge.
    const barW = this.el.offsetWidth || 0;
    const viewportW = window.innerWidth || document.documentElement.clientWidth;
    let left = rect.right - barW;
    left = Math.max(GAP, Math.min(left, viewportW - barW - GAP));

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  // ─── Private ──────────────────────────────────────────────────────────

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
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = getInlineStyles();
    document.head.appendChild(style);
  }
}

/**
 * CSS injected at runtime. Mirrors src/styles/vimfields.css so the overlay
 * works even when the stylesheet isn't loaded as a separate resource.
 */
function getInlineStyles(): string {
  return `
/* Block cursor */
.vimfields-block-cursor {
  position: fixed;
  pointer-events: none;
  z-index: 2147483646;
  box-sizing: content-box;
  margin: 0;
  padding: 0;
  border: 0;
  background: rgb(120, 170, 255);
  color: #0b1220;
  border-radius: 1px;
  overflow: hidden;
  white-space: pre;
  text-align: left;
  text-indent: 0;
  vertical-align: baseline;
  transition: left 40ms linear, top 40ms linear,
              width 40ms linear, height 40ms linear;
}

.vimfields-block-cursor[data-mode="visual"] {
  background: rgb(196, 166, 245);
  color: #1a0b2e;
}

.vimfields-block-cursor[data-mode="insert"] {
  color: transparent;
  animation: vimfields-cursor-blink 1.06s steps(2, end) infinite;
}

@keyframes vimfields-cursor-blink {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* Visual-mode selection highlight */
.vimfields-selection-rect {
  position: fixed;
  pointer-events: none;
  z-index: 2147483645;
  background: rgba(196, 166, 245, 0.32);
  border-radius: 1px;
}

/* Hidden mirror div used to measure caret position */
.vimfields-mirror {
  position: absolute !important;
  visibility: hidden !important;
  pointer-events: none !important;
  top: 0 !important;
  left: -9999px !important;
  z-index: -1 !important;
  margin: 0 !important;
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
  background: rgba(30, 30, 30, 0.9);
  border-radius: 4px;
  pointer-events: none;
  user-select: none;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.vimfields-status-bar[data-mode="insert"] {
  color: #a8db8f;
}

.vimfields-status-bar[data-mode="visual"] {
  color: #c4a6f5;
}

.vimfields-status-mode {
  font-weight: 600;
}

.vimfields-status-buffer {
  color: #ffd77a;
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
    animation: none;
  }
}
`;
}
