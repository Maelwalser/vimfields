// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/constants.ts
var MODE_NAMES = {
  ["normal" /* Normal */]: "NORMAL",
  ["insert" /* Insert */]: "INSERT",
  ["visual" /* Visual */]: "VISUAL",
  ["visual-line" /* VisualLine */]: "V-LINE"
};
var DEFAULT_CONFIG = {
  enabled: true,
  escapeRemap: "jk",
  disabledSites: []
};

// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/dom/field-detector.ts
var FieldDetector = class {
  observer = null;
  attached = /* @__PURE__ */ new WeakSet();
  onFieldFound;
  observedRoots = /* @__PURE__ */ new Set();
  constructor(onFieldFound2) {
    this.onFieldFound = onFieldFound2;
  }
  /** Start observing the given root (defaults to document.body). */
  start(root = document.body) {
    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
    this.scanNode(root);
    this.observe(root);
  }
  stop() {
    this.observer?.disconnect();
    this.observer = null;
    this.observedRoots.clear();
  }
  /** Check whether an element has already been attached. */
  isAttached(el) {
    return this.attached.has(el);
  }
  // ---------- Private ----------
  observe(root) {
    if (!this.observer || this.observedRoots.has(root)) return;
    this.observedRoots.add(root);
    this.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["contenteditable"]
    });
  }
  handleMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            this.scanNode(node);
          }
        }
      } else if (mutation.type === "attributes") {
        if (mutation.target instanceof HTMLElement) {
          this.checkElement(mutation.target);
        }
      }
    }
  }
  scanNode(root) {
    if (root instanceof HTMLElement) {
      this.checkElement(root);
      if (root.shadowRoot) {
        this.scanNode(root.shadowRoot);
        this.observe(root.shadowRoot);
      }
    }
    if (root instanceof Element || root instanceof DocumentFragment) {
      const elements = root.querySelectorAll(
        'input, textarea, [contenteditable="true"], [contenteditable=""]'
      );
      for (const el of elements) {
        this.checkElement(el);
      }
      const allElements = root.querySelectorAll("*");
      for (const el of allElements) {
        if (el.shadowRoot) {
          this.scanNode(el.shadowRoot);
          this.observe(el.shadowRoot);
        }
      }
    }
  }
  checkElement(el) {
    if (this.attached.has(el)) return;
    if (this.isEditableField(el)) {
      this.attached.add(el);
      this.onFieldFound(el);
    }
  }
  isEditableField(el) {
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      const type = el.type.toLowerCase();
      const textTypes = ["text", "search", "url", "tel", "password", "email", ""];
      return textTypes.includes(type);
    }
    const ceAttr = el.getAttribute("contenteditable");
    if (el.isContentEditable || el.contentEditable === "true" || ceAttr === "true" || ceAttr === "") {
      return true;
    }
    return false;
  }
};

// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/dom/text-adapter.ts
function dispatchInputEvents(element) {
  const inputEvent = new InputEvent("input", {
    bubbles: true,
    cancelable: false,
    inputType: "insertText"
  });
  element.dispatchEvent(inputEvent);
  const changeEvent = new Event("change", { bubbles: true });
  element.dispatchEvent(changeEvent);
}
function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
}
var InputAdapter = class {
  element;
  constructor(element) {
    this.element = element;
  }
  getText() {
    return this.element.value;
  }
  setText(text) {
    setNativeValue(this.element, text);
    dispatchInputEvents(this.element);
  }
  getCursorPosition() {
    return this.element.selectionStart ?? 0;
  }
  setCursorPosition(pos) {
    const clamped = Math.max(0, Math.min(pos, this.element.value.length));
    this.element.setSelectionRange(clamped, clamped);
  }
  getSelectionRange() {
    return {
      start: this.element.selectionStart ?? 0,
      end: this.element.selectionEnd ?? 0
    };
  }
  setSelectionRange(start, end) {
    const len = this.element.value.length;
    this.element.setSelectionRange(
      Math.max(0, Math.min(start, len)),
      Math.max(0, Math.min(end, len))
    );
  }
  offsetToLineCol(offset) {
    return { line: 0, column: Math.max(0, Math.min(offset, this.element.value.length)) };
  }
  lineColToOffset(_line, column) {
    return Math.max(0, Math.min(column, this.element.value.length));
  }
  getLineCount() {
    return 1;
  }
  getLine(_line) {
    return this.element.value;
  }
  dispose() {
  }
};
var TextareaAdapter = class {
  element;
  constructor(element) {
    this.element = element;
  }
  getText() {
    return this.element.value;
  }
  setText(text) {
    setNativeValue(this.element, text);
    dispatchInputEvents(this.element);
  }
  getCursorPosition() {
    return this.element.selectionStart ?? 0;
  }
  setCursorPosition(pos) {
    const clamped = Math.max(0, Math.min(pos, this.element.value.length));
    this.element.setSelectionRange(clamped, clamped);
  }
  getSelectionRange() {
    return {
      start: this.element.selectionStart ?? 0,
      end: this.element.selectionEnd ?? 0
    };
  }
  setSelectionRange(start, end) {
    const len = this.element.value.length;
    this.element.setSelectionRange(
      Math.max(0, Math.min(start, len)),
      Math.max(0, Math.min(end, len))
    );
  }
  getLines() {
    return this.element.value.split("\n");
  }
  offsetToLineCol(offset) {
    const text = this.element.value;
    const clampedOffset = Math.max(0, Math.min(offset, text.length));
    let line = 0;
    let remaining = clampedOffset;
    const lines = this.getLines();
    for (let i = 0; i < lines.length; i++) {
      const lineLen = lines[i].length + (i < lines.length - 1 ? 1 : 0);
      if (remaining <= lines[i].length) {
        return { line: i, column: remaining };
      }
      remaining -= lineLen;
      line = i + 1;
    }
    const lastLine = lines.length - 1;
    return { line: lastLine, column: lines[lastLine].length };
  }
  lineColToOffset(line, column) {
    const lines = this.getLines();
    const clampedLine = Math.max(0, Math.min(line, lines.length - 1));
    const clampedCol = Math.max(0, Math.min(column, lines[clampedLine].length));
    let offset = 0;
    for (let i = 0; i < clampedLine; i++) {
      offset += lines[i].length + 1;
    }
    return offset + clampedCol;
  }
  getLineCount() {
    return this.getLines().length;
  }
  getLine(line) {
    const lines = this.getLines();
    const clamped = Math.max(0, Math.min(line, lines.length - 1));
    return lines[clamped];
  }
  dispose() {
  }
};
var ContentEditableAdapter = class {
  element;
  constructor(element) {
    this.element = element;
  }
  getText() {
    return this.element.innerText ?? "";
  }
  setText(text) {
    this.element.innerText = text;
    dispatchInputEvents(this.element);
  }
  getCursorPosition() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    return this.rangeToOffset(sel.getRangeAt(0), true);
  }
  setCursorPosition(pos) {
    const { node, offset } = this.offsetToNodePosition(pos);
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  getSelectionRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
    const range = sel.getRangeAt(0);
    return {
      start: this.rangeToOffset(range, true),
      end: this.rangeToOffset(range, false)
    };
  }
  setSelectionRange(start, end) {
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
  offsetToLineCol(offset) {
    const text = this.getText();
    const clamped = Math.max(0, Math.min(offset, text.length));
    const lines = text.split("\n");
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
  lineColToOffset(line, column) {
    const lines = this.getText().split("\n");
    const clampedLine = Math.max(0, Math.min(line, lines.length - 1));
    const clampedCol = Math.max(0, Math.min(column, lines[clampedLine].length));
    let offset = 0;
    for (let i = 0; i < clampedLine; i++) {
      offset += lines[i].length + 1;
    }
    return offset + clampedCol;
  }
  getLineCount() {
    return this.getText().split("\n").length;
  }
  getLine(line) {
    const lines = this.getText().split("\n");
    const clamped = Math.max(0, Math.min(line, lines.length - 1));
    return lines[clamped];
  }
  dispose() {
  }
  // ---- Private helpers for Selection/Range <-> offset conversion ----
  /**
   * Walk all text nodes under this.element in DOM order,
   * converting a Selection range endpoint to a linear character offset.
   */
  rangeToOffset(range, useStart) {
    const targetNode = useStart ? range.startContainer : range.endContainer;
    const targetOffset = useStart ? range.startOffset : range.endOffset;
    let charCount = 0;
    const walker = document.createTreeWalker(this.element, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      if (node === targetNode) {
        return charCount + targetOffset;
      }
      charCount += node.textContent?.length ?? 0;
    }
    if (targetNode === this.element) {
      return targetOffset === 0 ? 0 : this.getText().length;
    }
    return charCount;
  }
  /**
   * Convert a linear character offset to a { node, offset } pair
   * suitable for Range.setStart / Range.setEnd.
   */
  offsetToNodePosition(offset) {
    const text = this.getText();
    const clampedOffset = Math.max(0, Math.min(offset, text.length));
    const walker = document.createTreeWalker(this.element, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    let node;
    while (node = walker.nextNode()) {
      const len = node.textContent?.length ?? 0;
      if (charCount + len >= clampedOffset) {
        return { node, offset: clampedOffset - charCount };
      }
      charCount += len;
    }
    return { node: this.element, offset: 0 };
  }
};
function createTextAdapter(element) {
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    const textTypes = ["text", "search", "url", "tel", "password", "email", ""];
    if (textTypes.includes(type)) {
      return new InputAdapter(element);
    }
    return null;
  }
  if (element instanceof HTMLTextAreaElement) {
    return new TextareaAdapter(element);
  }
  const ceAttr = element.getAttribute("contenteditable");
  if (element.isContentEditable || element.contentEditable === "true" || ceAttr === "true" || ceAttr === "") {
    return new ContentEditableAdapter(element);
  }
  return null;
}

// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/dom/cursor-renderer.ts
var CURSOR_CLASS = "vimfields-block-cursor";
var CursorRenderer = class {
  cursorEl = null;
  measureSpan = null;
  mode = "normal";
  adapter = null;
  animFrameId = null;
  /** Attach cursor rendering to a field via its TextAdapter. */
  attach(adapter) {
    this.adapter = adapter;
    this.createElements();
    this.update();
  }
  detach() {
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
  setMode(mode) {
    this.mode = mode;
    this.update();
  }
  /** Call after cursor movement or text change. */
  update() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.animFrameId = requestAnimationFrame(() => {
      this.animFrameId = null;
      this.render();
    });
  }
  // ---------- Private ----------
  createElements() {
    if (this.cursorEl) return;
    this.cursorEl = document.createElement("div");
    this.cursorEl.className = CURSOR_CLASS;
    this.cursorEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.cursorEl);
    this.measureSpan = document.createElement("span");
    this.measureSpan.className = "vimfields-measure";
    this.measureSpan.style.position = "absolute";
    this.measureSpan.style.visibility = "hidden";
    this.measureSpan.style.whiteSpace = "pre";
    this.measureSpan.style.pointerEvents = "none";
    this.measureSpan.textContent = "X";
    document.body.appendChild(this.measureSpan);
  }
  render() {
    if (!this.cursorEl || !this.adapter) return;
    if (this.mode === "insert") {
      this.cursorEl.style.display = "none";
      return;
    }
    const el = this.adapter.element;
    const pos = this.adapter.getCursorPosition();
    const text = this.adapter.getText();
    const charAtCursor = pos < text.length ? text[pos] : " ";
    const computed = window.getComputedStyle(el);
    if (this.measureSpan) {
      this.measureSpan.style.font = computed.font;
      this.measureSpan.style.letterSpacing = computed.letterSpacing;
      this.measureSpan.textContent = charAtCursor === "\n" ? " " : charAtCursor;
    }
    const charRect = this.getCharRect(el, pos, computed);
    if (!charRect) {
      this.cursorEl.style.display = "none";
      return;
    }
    const charWidth = this.measureSpan?.getBoundingClientRect().width ?? 8;
    const charHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;
    this.cursorEl.style.display = "block";
    this.cursorEl.style.left = `${charRect.x}px`;
    this.cursorEl.style.top = `${charRect.y}px`;
    this.cursorEl.style.width = `${charWidth}px`;
    this.cursorEl.style.height = `${charHeight}px`;
    this.cursorEl.dataset.mode = this.mode;
  }
  /**
   * Approximate the character rectangle by using the element's bounding rect
   * and computing offsets from the text content.
   */
  getCharRect(el, pos, computed) {
    const rect = el.getBoundingClientRect();
    if (el.isContentEditable) {
      return this.getContentEditableCharPos(el, pos);
    }
    const text = el.value ?? "";
    const paddingLeft = parseFloat(computed.paddingLeft) || 0;
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const borderLeft = parseFloat(computed.borderLeftWidth) || 0;
    const borderTop = parseFloat(computed.borderTopWidth) || 0;
    const scrollLeft = el.scrollLeft ?? 0;
    const scrollTop = el.scrollTop ?? 0;
    const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;
    if (el instanceof HTMLTextAreaElement) {
      const lines = text.substring(0, pos).split("\n");
      const currentLine = lines.length - 1;
      const colText = lines[currentLine];
      const colWidth = this.measureText(colText, computed);
      return {
        x: rect.left + borderLeft + paddingLeft + colWidth - scrollLeft,
        y: rect.top + borderTop + paddingTop + currentLine * lineHeight - scrollTop
      };
    }
    const beforeCursor = text.substring(0, pos);
    const textWidth = this.measureText(beforeCursor, computed);
    return {
      x: rect.left + borderLeft + paddingLeft + textWidth - scrollLeft,
      y: rect.top + borderTop + paddingTop
    };
  }
  getContentEditableCharPos(el, pos) {
    const text = el.innerText ?? "";
    if (text.length === 0) {
      const rect = el.getBoundingClientRect();
      const computed = window.getComputedStyle(el);
      return {
        x: rect.left + (parseFloat(computed.paddingLeft) || 0),
        y: rect.top + (parseFloat(computed.paddingTop) || 0)
      };
    }
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    let node;
    while (node = walker.nextNode()) {
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
  measureText(text, computed) {
    if (!this.measureSpan) return 0;
    this.measureSpan.style.font = computed.font;
    this.measureSpan.style.letterSpacing = computed.letterSpacing;
    this.measureSpan.textContent = text || "\u200B";
    const width = this.measureSpan.getBoundingClientRect().width;
    return text ? width : 0;
  }
};

// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/dom/status-bar.ts
var STATUS_CLASS = "vimfields-status-bar";
var STYLE_ID = "vimfields-injected-styles";
var MODE_LABELS = {
  normal: "-- NORMAL --",
  insert: "-- INSERT --",
  visual: "-- VISUAL --"
};
var StatusBar = class {
  el = null;
  modeSpan = null;
  bufferSpan = null;
  targetElement = null;
  resizeObserver = null;
  constructor() {
    this.injectStyles();
  }
  /** Show the status bar anchored to a field element. */
  attach(target) {
    this.targetElement = target;
    this.createElement();
    this.position();
    this.resizeObserver = new ResizeObserver(() => this.position());
    this.resizeObserver.observe(target);
  }
  detach() {
    this.el?.remove();
    this.el = null;
    this.modeSpan = null;
    this.bufferSpan = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.targetElement = null;
  }
  setMode(mode) {
    if (this.modeSpan) {
      this.modeSpan.textContent = MODE_LABELS[mode];
    }
    if (this.el) {
      this.el.dataset.mode = mode;
    }
  }
  setCommandBuffer(buffer) {
    if (this.bufferSpan) {
      this.bufferSpan.textContent = buffer;
    }
  }
  /** Reposition relative to the target element. */
  position() {
    if (!this.el || !this.targetElement) return;
    const rect = this.targetElement.getBoundingClientRect();
    this.el.style.left = `${rect.right - this.el.offsetWidth - 4}px`;
    this.el.style.top = `${rect.bottom - this.el.offsetHeight - 4}px`;
  }
  // ---------- Private ----------
  createElement() {
    if (this.el) return;
    this.el = document.createElement("div");
    this.el.className = STATUS_CLASS;
    this.el.setAttribute("aria-live", "polite");
    this.el.setAttribute("role", "status");
    this.el.dataset.mode = "normal";
    this.modeSpan = document.createElement("span");
    this.modeSpan.className = "vimfields-status-mode";
    this.modeSpan.textContent = MODE_LABELS.normal;
    this.bufferSpan = document.createElement("span");
    this.bufferSpan.className = "vimfields-status-buffer";
    this.el.appendChild(this.modeSpan);
    this.el.appendChild(this.bufferSpan);
    document.body.appendChild(this.el);
  }
  injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = getInlineStyles();
    document.head.appendChild(style);
  }
};
function getInlineStyles() {
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

// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/vim/mode-manager.ts
var ModeManager = class {
  currentMode = "normal" /* Normal */;
  listeners = [];
  get mode() {
    return this.currentMode;
  }
  onModeChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }
  enterNormal() {
    this.transition("normal" /* Normal */);
  }
  enterInsert() {
    this.transition("insert" /* Insert */);
  }
  enterVisual() {
    this.transition("visual" /* Visual */);
  }
  enterVisualLine() {
    this.transition("visual-line" /* VisualLine */);
  }
  transition(to) {
    if (this.currentMode === to) return;
    const from = this.currentMode;
    this.currentMode = to;
    const event = { from, to };
    for (const cb of this.listeners) {
      cb(event);
    }
  }
};

// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/vim/command-parser.ts
var OPERATORS = /* @__PURE__ */ new Set(["d", "c", "y"]);
var MOTIONS = /* @__PURE__ */ new Set(["h", "j", "k", "l", "w", "b", "e", "0", "$", "G"]);
var CHAR_MOTIONS = /* @__PURE__ */ new Set(["f", "t"]);
var ACTIONS = /* @__PURE__ */ new Set([
  "i",
  "a",
  "I",
  "A",
  "o",
  "O",
  // insert entry points
  "p",
  "P",
  // paste
  "x",
  // delete char
  "J",
  // join lines
  "u",
  // undo
  "v",
  "V"
  // visual mode
]);
var CommandParser = class {
  buffer = [];
  /**
   * Feed a key into the parser. Returns the parse result.
   */
  feed(key) {
    this.buffer.push(key);
    const seq = this.buffer.join("");
    const result = this.tryParse(seq);
    if (result.status !== "pending") {
      this.buffer = [];
    }
    return result;
  }
  /** Reset the parser state */
  reset() {
    this.buffer = [];
  }
  /** Get the current buffer contents */
  getBuffer() {
    return this.buffer.join("");
  }
  tryParse(seq) {
    let i = 0;
    let countStr = "";
    while (i < seq.length && seq[i] >= "1" && seq[i] <= "9") {
      countStr += seq[i];
      i++;
    }
    while (i < seq.length && seq[i] >= "0" && seq[i] <= "9") {
      countStr += seq[i];
      i++;
    }
    const count1 = countStr ? parseInt(countStr, 10) : 1;
    if (i >= seq.length) return { status: "pending" };
    if (seq[i] === "") {
      return {
        status: "action",
        action: "ctrl-r",
        count: count1
      };
    }
    if (seq[i] === "\x1B" || seq[i] === "") {
      return {
        status: "action",
        action: "escape",
        count: 1
      };
    }
    if (seq[i] === "r") {
      if (i + 1 >= seq.length) return { status: "pending" };
      return {
        status: "action",
        action: "r",
        count: count1,
        charArg: seq[i + 1]
      };
    }
    if (seq[i] === "g") {
      if (i + 1 >= seq.length) return { status: "pending" };
      if (seq[i + 1] === "g") {
        return {
          status: "complete",
          command: { count: count1, operator: null, motion: "gg", linewise: false }
        };
      }
      return { status: "invalid" };
    }
    if (ACTIONS.has(seq[i])) {
      return {
        status: "action",
        action: seq[i],
        count: count1
      };
    }
    if (MOTIONS.has(seq[i])) {
      return {
        status: "complete",
        command: { count: count1, operator: null, motion: seq[i], linewise: false }
      };
    }
    if (CHAR_MOTIONS.has(seq[i])) {
      const motionKey = seq[i];
      if (i + 1 >= seq.length) return { status: "pending" };
      return {
        status: "complete",
        command: {
          count: count1,
          operator: null,
          motion: motionKey,
          charArg: seq[i + 1],
          linewise: false
        }
      };
    }
    if (OPERATORS.has(seq[i])) {
      const op = seq[i];
      i++;
      if (i >= seq.length) return { status: "pending" };
      if (seq[i] === op) {
        return {
          status: "complete",
          command: { count: count1, operator: op, motion: null, linewise: true }
        };
      }
      let countStr2 = "";
      while (i < seq.length && seq[i] >= "1" && seq[i] <= "9") {
        countStr2 += seq[i];
        i++;
      }
      while (i < seq.length && seq[i] >= "0" && seq[i] <= "9") {
        countStr2 += seq[i];
        i++;
      }
      const count2 = countStr2 ? parseInt(countStr2, 10) : 1;
      const totalCount = count1 * count2;
      if (i >= seq.length) return { status: "pending" };
      if (seq[i] === "g") {
        if (i + 1 >= seq.length) return { status: "pending" };
        if (seq[i + 1] === "g") {
          return {
            status: "complete",
            command: { count: totalCount, operator: op, motion: "gg", linewise: false }
          };
        }
        return { status: "invalid" };
      }
      if (MOTIONS.has(seq[i])) {
        return {
          status: "complete",
          command: {
            count: totalCount,
            operator: op,
            motion: seq[i],
            linewise: false
          }
        };
      }
      if (CHAR_MOTIONS.has(seq[i])) {
        const motionKey = seq[i];
        if (i + 1 >= seq.length) return { status: "pending" };
        return {
          status: "complete",
          command: {
            count: totalCount,
            operator: op,
            motion: motionKey,
            charArg: seq[i + 1],
            linewise: false
          }
        };
      }
      return { status: "invalid" };
    }
    return { status: "invalid" };
  }
};

// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/vim/motions.ts
function clamp(pos, text) {
  if (text.length === 0) return 0;
  return Math.max(0, Math.min(pos, text.length - 1));
}
function charLeft(text, cursor) {
  return clamp(cursor - 1, text);
}
function charRight(text, cursor) {
  return clamp(cursor + 1, text);
}
function lineStartOf(text, cursor) {
  const prev = text.lastIndexOf("\n", cursor - 1);
  return prev === -1 ? 0 : prev + 1;
}
function lineEndOf(text, cursor) {
  const next = text.indexOf("\n", cursor);
  return next === -1 ? text.length : next;
}
function columnOf(text, cursor) {
  return cursor - lineStartOf(text, cursor);
}
function lineDown(text, cursor) {
  const col = columnOf(text, cursor);
  const currentLineEnd = lineEndOf(text, cursor);
  if (currentLineEnd >= text.length) return cursor;
  const nextLineStart = currentLineEnd + 1;
  const nextLineEnd = lineEndOf(text, nextLineStart);
  const nextLineLen = nextLineEnd - nextLineStart;
  const maxCol = nextLineLen > 0 ? nextLineLen - 1 : 0;
  return nextLineStart + Math.min(col, maxCol);
}
function lineUp(text, cursor) {
  const col = columnOf(text, cursor);
  const currentLineStart = lineStartOf(text, cursor);
  if (currentLineStart === 0) return cursor;
  const prevLineEnd = currentLineStart - 1;
  const prevLineStart = lineStartOf(text, prevLineEnd);
  const prevLineLen = prevLineEnd - prevLineStart;
  const maxCol = prevLineLen > 0 ? prevLineLen - 1 : 0;
  return prevLineStart + Math.min(col, maxCol);
}
function lineStart(text, cursor) {
  return lineStartOf(text, cursor);
}
function lineEnd(text, cursor) {
  const end = lineEndOf(text, cursor);
  const start = lineStartOf(text, cursor);
  if (end === start) return start;
  return end - 1;
}
function isWordChar(ch) {
  return /[\w]/.test(ch);
}
function isWhitespace(ch) {
  return /\s/.test(ch);
}
function wordForward(text, cursor) {
  let i = cursor;
  const len = text.length;
  if (i >= len) return clamp(len - 1, text);
  if (isWordChar(text[i])) {
    while (i < len && isWordChar(text[i])) i++;
  } else if (!isWhitespace(text[i])) {
    while (i < len && !isWordChar(text[i]) && !isWhitespace(text[i])) i++;
  }
  while (i < len && isWhitespace(text[i])) i++;
  return clamp(i, text);
}
function wordBackward(text, cursor) {
  let i = cursor;
  if (i <= 0) return 0;
  i--;
  while (i > 0 && isWhitespace(text[i])) i--;
  if (i >= 0 && isWordChar(text[i])) {
    while (i > 0 && isWordChar(text[i - 1])) i--;
  } else if (i >= 0 && !isWhitespace(text[i])) {
    while (i > 0 && !isWordChar(text[i - 1]) && !isWhitespace(text[i - 1])) i--;
  }
  return Math.max(0, i);
}
function wordEnd(text, cursor) {
  let i = cursor;
  const len = text.length;
  if (i >= len - 1) return clamp(len - 1, text);
  i++;
  while (i < len && isWhitespace(text[i])) i++;
  if (i < len && isWordChar(text[i])) {
    while (i + 1 < len && isWordChar(text[i + 1])) i++;
  } else if (i < len) {
    while (i + 1 < len && !isWordChar(text[i + 1]) && !isWhitespace(text[i + 1])) i++;
  }
  return clamp(i, text);
}
function documentStart(_text, _cursor) {
  return 0;
}
function documentEnd(text, _cursor) {
  return clamp(text.length - 1, text);
}
function findCharForward(text, cursor, ch) {
  const end = lineEndOf(text, cursor);
  for (let i = cursor + 1; i < end; i++) {
    if (text[i] === ch) return i;
  }
  return cursor;
}
function tillCharForward(text, cursor, ch) {
  const found = findCharForward(text, cursor, ch);
  if (found === cursor) return cursor;
  return found - 1;
}
function executeMotion(motionKey, text, cursor, charArg) {
  switch (motionKey) {
    case "h":
      return charLeft(text, cursor);
    case "l":
      return charRight(text, cursor);
    case "j":
      return lineDown(text, cursor);
    case "k":
      return lineUp(text, cursor);
    case "0":
      return lineStart(text, cursor);
    case "$":
      return lineEnd(text, cursor);
    case "w":
      return wordForward(text, cursor);
    case "b":
      return wordBackward(text, cursor);
    case "e":
      return wordEnd(text, cursor);
    case "gg":
      return documentStart(text, cursor);
    case "G":
      return documentEnd(text, cursor);
    case "f":
      return charArg ? findCharForward(text, cursor, charArg) : cursor;
    case "t":
      return charArg ? tillCharForward(text, cursor, charArg) : cursor;
    default:
      return cursor;
  }
}

// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/vim/registers.ts
var Registers = class {
  store = /* @__PURE__ */ new Map();
  get(name) {
    return this.store.get(name) ?? { text: "", linewise: false };
  }
  set(name, content) {
    this.store.set(name, content);
  }
  /**
   * Record a yank operation: populates unnamed (") and register 0.
   * If an explicit register name is given, also populates that register.
   */
  recordYank(text, linewise, register) {
    const content = { text, linewise };
    this.set('"', content);
    this.set("0", content);
    if (register) {
      this.set(register, content);
    }
  }
  /**
   * Record a delete operation: populates unnamed ("), shifts numbered
   * registers 1-9 (large deletes) or small delete register (-).
   * If an explicit register name is given, also populates that register.
   */
  recordDelete(text, linewise, register) {
    const content = { text, linewise };
    this.set('"', content);
    if (register) {
      this.set(register, content);
    }
    if (!linewise && !text.includes("\n")) {
      this.set("-", content);
    } else {
      for (let i = 9; i >= 2; i--) {
        const prev = this.store.get(String(i - 1));
        if (prev) {
          this.store.set(String(i), prev);
        }
      }
      this.set("1", content);
    }
  }
  /**
   * Get the content to paste. Reads from the given register or unnamed.
   */
  getPaste(register) {
    return this.get(register ?? '"');
  }
  clear() {
    this.store.clear();
  }
};

// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/vim/operators.ts
function lineStartOf2(text, pos) {
  const prev = text.lastIndexOf("\n", pos - 1);
  return prev === -1 ? 0 : prev + 1;
}
function lineEndOf2(text, pos) {
  const next = text.indexOf("\n", pos);
  return next === -1 ? text.length : next;
}
function fullLineRange(text, pos) {
  const start = lineStartOf2(text, pos);
  let end = lineEndOf2(text, pos);
  if (end < text.length) end++;
  return [start, end];
}
function motionRange(text, cursor, cmd) {
  if (cmd.linewise) {
    let [start2, end2] = fullLineRange(text, cursor);
    for (let i = 1; i < cmd.count; i++) {
      if (end2 < text.length) {
        end2 = lineEndOf2(text, end2);
        if (end2 < text.length) end2++;
      }
    }
    return [start2, end2, true];
  }
  let target = cursor;
  for (let i = 0; i < cmd.count; i++) {
    target = executeMotion(cmd.motion, text, target, cmd.charArg);
  }
  const start = Math.min(cursor, target);
  const rawEnd = Math.max(cursor, target);
  const exclusiveMotions = /* @__PURE__ */ new Set(["w", "b", "0"]);
  const end = exclusiveMotions.has(cmd.motion) ? rawEnd : rawEnd + 1;
  return [start, end, false];
}
function deleteOp(text, cursor, cmd, registers2, register) {
  const [start, end, linewise] = motionRange(text, cursor, cmd);
  const deleted = text.slice(start, end);
  registers2.recordDelete(deleted, linewise, register);
  const newText = text.slice(0, start) + text.slice(end);
  let newCursor = start;
  if (newText.length > 0 && newCursor >= newText.length) {
    newCursor = newText.length - 1;
  }
  if (newText.length === 0) newCursor = 0;
  return { text: newText, cursor: newCursor };
}
function changeOp(text, cursor, cmd, registers2, register) {
  const [start, end, linewise] = motionRange(text, cursor, cmd);
  const deleted = text.slice(start, end);
  registers2.recordDelete(deleted, linewise, register);
  let newText;
  let newCursor;
  if (linewise) {
    const lineS = lineStartOf2(text, cursor);
    const lineE = lineEndOf2(text, cursor);
    newText = text.slice(0, lineS) + text.slice(lineE);
    newCursor = lineS;
  } else {
    newText = text.slice(0, start) + text.slice(end);
    newCursor = start;
  }
  return { text: newText, cursor: newCursor, enterInsert: true };
}
function yankOp(text, cursor, cmd, registers2, register) {
  const [start, end, linewise] = motionRange(text, cursor, cmd);
  const yanked = text.slice(start, end);
  registers2.recordYank(yanked, linewise, register);
  return { text, cursor: start };
}
function deleteChar(text, cursor, count, registers2, register) {
  if (text.length === 0) return { text, cursor: 0 };
  const end = Math.min(cursor + count, text.length);
  const deleted = text.slice(cursor, end);
  registers2.recordDelete(deleted, false, register);
  const newText = text.slice(0, cursor) + text.slice(end);
  let newCursor = cursor;
  if (newText.length > 0 && newCursor >= newText.length) {
    newCursor = newText.length - 1;
  }
  if (newText.length === 0) newCursor = 0;
  return { text: newText, cursor: newCursor };
}
function replaceChar(text, cursor, ch) {
  if (text.length === 0 || cursor >= text.length) return { text, cursor };
  const newText = text.slice(0, cursor) + ch + text.slice(cursor + 1);
  return { text: newText, cursor };
}
function pasteAfter(text, cursor, registers2, register) {
  const content = registers2.getPaste(register);
  if (content.text === "") return { text, cursor };
  if (content.linewise) {
    const lineE = lineEndOf2(text, cursor);
    const insertPos2 = lineE < text.length ? lineE + 1 : lineE;
    const pasteText = lineE < text.length ? content.text.endsWith("\n") ? content.text : content.text + "\n" : "\n" + (content.text.endsWith("\n") ? content.text.slice(0, -1) : content.text);
    const newText2 = text.slice(0, insertPos2) + pasteText + text.slice(insertPos2);
    const newCursor = lineE < text.length ? insertPos2 : insertPos2 + 1;
    return { text: newText2, cursor: newCursor };
  }
  const insertPos = Math.min(cursor + 1, text.length);
  const newText = text.slice(0, insertPos) + content.text + text.slice(insertPos);
  return { text: newText, cursor: insertPos + content.text.length - 1 };
}
function pasteBefore(text, cursor, registers2, register) {
  const content = registers2.getPaste(register);
  if (content.text === "") return { text, cursor };
  if (content.linewise) {
    const lineS = lineStartOf2(text, cursor);
    const pasteText = content.text.endsWith("\n") ? content.text : content.text + "\n";
    const newText2 = text.slice(0, lineS) + pasteText + text.slice(lineS);
    return { text: newText2, cursor: lineS };
  }
  const newText = text.slice(0, cursor) + content.text + text.slice(cursor);
  return { text: newText, cursor: cursor + content.text.length - 1 };
}
function joinLines(text, cursor) {
  const lineE = lineEndOf2(text, cursor);
  if (lineE >= text.length) return { text, cursor };
  let nextStart = lineE + 1;
  while (nextStart < text.length && (text[nextStart] === " " || text[nextStart] === "	")) {
    nextStart++;
  }
  const newText = text.slice(0, lineE) + " " + text.slice(nextStart);
  return { text: newText, cursor: lineE };
}
function deleteSelection(text, start, end, linewise, registers2, register) {
  let delStart;
  let delEnd;
  if (linewise) {
    [delStart, delEnd] = fullLineRange(text, Math.min(start, end));
    const [, endLine] = fullLineRange(text, Math.max(start, end));
    delEnd = endLine;
  } else {
    delStart = Math.min(start, end);
    delEnd = Math.max(start, end) + 1;
  }
  const deleted = text.slice(delStart, delEnd);
  registers2.recordDelete(deleted, linewise, register);
  const newText = text.slice(0, delStart) + text.slice(delEnd);
  let newCursor = delStart;
  if (newText.length > 0 && newCursor >= newText.length) {
    newCursor = newText.length - 1;
  }
  if (newText.length === 0) newCursor = 0;
  return { text: newText, cursor: newCursor };
}
function yankSelection(text, start, end, linewise, registers2, register) {
  let yankStart;
  let yankEnd;
  if (linewise) {
    [yankStart, yankEnd] = fullLineRange(text, Math.min(start, end));
    const [, endLine] = fullLineRange(text, Math.max(start, end));
    yankEnd = endLine;
  } else {
    yankStart = Math.min(start, end);
    yankEnd = Math.max(start, end) + 1;
  }
  const yanked = text.slice(yankStart, yankEnd);
  registers2.recordYank(yanked, linewise, register);
  return { text, cursor: Math.min(start, end) };
}
function changeSelection(text, start, end, linewise, registers2, register) {
  const edit = deleteSelection(text, start, end, linewise, registers2, register);
  return { ...edit, enterInsert: true };
}

// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/content.ts
var config = { ...DEFAULT_CONFIG };
var activeAdapter = null;
var activeElement = null;
var visualAnchor = 0;
var modeManager = new ModeManager();
var parser = new CommandParser();
var registers = new Registers();
var cursorRenderer = new CursorRenderer();
var statusBar = new StatusBar();
var fieldDetector = new FieldDetector(onFieldFound);
var undoStacks = /* @__PURE__ */ new WeakMap();
function pushUndo(el, text) {
  let stack = undoStacks.get(el);
  if (!stack) {
    stack = [];
    undoStacks.set(el, stack);
  }
  stack.push(text);
  if (stack.length > 100) stack.shift();
}
function popUndo(el) {
  return undoStacks.get(el)?.pop();
}
var escapeRemapBuffer = "";
var escapeRemapTimeout = null;
function toRendererMode(mode) {
  switch (mode) {
    case "normal" /* Normal */:
      return "normal";
    case "insert" /* Insert */:
      return "insert";
    case "visual" /* Visual */:
    case "visual-line" /* VisualLine */:
      return "visual";
  }
}
function isSiteDisabled() {
  const host = window.location.hostname;
  return config.disabledSites.some(
    (pattern) => host === pattern || host.endsWith("." + pattern)
  );
}
function onFieldFound(element) {
  element.addEventListener("focus", () => onFieldFocus(element));
  element.addEventListener("blur", () => onFieldBlur(element));
}
function onFieldFocus(element) {
  if (!config.enabled || isSiteDisabled()) return;
  const adapter = createTextAdapter(element);
  if (!adapter) return;
  activeAdapter = adapter;
  activeElement = element;
  modeManager.enterInsert();
  const mode = toRendererMode(modeManager.mode);
  cursorRenderer.attach(adapter);
  cursorRenderer.setMode(mode);
  statusBar.attach(element);
  statusBar.setMode(mode);
  parser.reset();
  escapeRemapBuffer = "";
}
function onFieldBlur(_element) {
  cursorRenderer.detach();
  statusBar.detach();
  activeAdapter = null;
  activeElement = null;
  parser.reset();
  escapeRemapBuffer = "";
}
function handleKeyDown(e) {
  if (!config.enabled || isSiteDisabled()) return;
  if (!activeAdapter || !activeElement) return;
  const mode = modeManager.mode;
  if (mode === "insert" /* Insert */) {
    handleInsertKey(e);
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  const key = mapKey(e);
  if (!key) return;
  if (mode === "visual" /* Visual */ || mode === "visual-line" /* VisualLine */) {
    handleVisualKey(key);
  } else {
    handleNormalKey(key);
  }
}
function mapKey(e) {
  if (e.key === "Escape") return "\x1B";
  if (e.ctrlKey && e.key === "c") return "";
  if (e.ctrlKey && e.key === "r") return "";
  if (e.key.length === 1) return e.key;
  return null;
}
function handleInsertKey(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    exitInsertMode();
    return;
  }
  if (e.ctrlKey && e.key === "c") {
    e.preventDefault();
    exitInsertMode();
    return;
  }
  if (config.escapeRemap && e.key.length === 1) {
    const remap = config.escapeRemap;
    escapeRemapBuffer += e.key;
    if (escapeRemapBuffer === remap) {
      e.preventDefault();
      if (activeAdapter) {
        const text = activeAdapter.getText();
        const cursor = activeAdapter.getCursorPosition();
        const newText = text.slice(0, cursor - 1) + text.slice(cursor);
        activeAdapter.setText(newText);
        activeAdapter.setCursorPosition(cursor - 1);
      }
      escapeRemapBuffer = "";
      if (escapeRemapTimeout) clearTimeout(escapeRemapTimeout);
      exitInsertMode();
      return;
    }
    if (remap.startsWith(escapeRemapBuffer)) {
      if (escapeRemapTimeout) clearTimeout(escapeRemapTimeout);
      escapeRemapTimeout = setTimeout(() => {
        escapeRemapBuffer = "";
      }, 300);
      return;
    }
    escapeRemapBuffer = "";
    if (escapeRemapTimeout) clearTimeout(escapeRemapTimeout);
  }
}
function exitInsertMode() {
  modeManager.enterNormal();
  const mode = toRendererMode(modeManager.mode);
  cursorRenderer.setMode(mode);
  statusBar.setMode(mode);
  parser.reset();
  if (activeAdapter) {
    const pos = activeAdapter.getCursorPosition();
    if (pos > 0) {
      activeAdapter.setCursorPosition(pos - 1);
    }
    cursorRenderer.update();
  }
}
function handleNormalKey(key) {
  if (!activeAdapter || !activeElement) return;
  const result = parser.feed(key);
  statusBar.setCommandBuffer(parser.getBuffer());
  processParseResult(result);
}
function handleVisualKey(key) {
  if (!activeAdapter || !activeElement) return;
  if (key === "\x1B" || key === "") {
    modeManager.enterNormal();
    updateModeUI();
    return;
  }
  const text = activeAdapter.getText();
  const cursor = activeAdapter.getCursorPosition();
  const isLinewise = modeManager.mode === "visual-line" /* VisualLine */;
  switch (key) {
    case "d": {
      pushUndo(activeElement, text);
      const edit = deleteSelection(text, visualAnchor, cursor, isLinewise, registers);
      activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      modeManager.enterNormal();
      updateModeUI();
      return;
    }
    case "y": {
      yankSelection(text, visualAnchor, cursor, isLinewise, registers);
      modeManager.enterNormal();
      activeAdapter.setCursorPosition(Math.min(visualAnchor, cursor));
      updateModeUI();
      return;
    }
    case "c": {
      pushUndo(activeElement, text);
      const edit = changeSelection(text, visualAnchor, cursor, isLinewise, registers);
      activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      modeManager.enterInsert();
      updateModeUI();
      return;
    }
  }
  const motionKeys = /* @__PURE__ */ new Set(["h", "j", "k", "l", "w", "b", "e", "0", "$", "G"]);
  if (motionKeys.has(key)) {
    const newCursor = executeMotion(key, text, cursor);
    activeAdapter.setCursorPosition(newCursor);
    const selStart = Math.min(visualAnchor, newCursor);
    const selEnd = Math.max(visualAnchor, newCursor) + 1;
    activeAdapter.setSelectionRange(selStart, selEnd);
    cursorRenderer.update();
  }
}
function processParseResult(result) {
  if (!activeAdapter || !activeElement) return;
  if (result.status === "pending" || result.status === "invalid") {
    if (result.status === "invalid") parser.reset();
    return;
  }
  const text = activeAdapter.getText();
  const cursor = activeAdapter.getCursorPosition();
  if (result.status === "action") {
    handleAction(result.action, result.count, text, cursor, result.charArg);
    return;
  }
  if (result.status === "complete") {
    const cmd = result.command;
    if (cmd.operator === null) {
      let newCursor = cursor;
      for (let i = 0; i < cmd.count; i++) {
        newCursor = executeMotion(cmd.motion, text, newCursor, cmd.charArg);
      }
      activeAdapter.setCursorPosition(newCursor);
    } else {
      pushUndo(activeElement, text);
      let edit;
      switch (cmd.operator) {
        case "d":
          edit = deleteOp(text, cursor, cmd, registers);
          break;
        case "c":
          edit = changeOp(text, cursor, cmd, registers);
          break;
        case "y":
          edit = yankOp(text, cursor, cmd, registers);
          break;
        default:
          return;
      }
      if (edit.text !== text) {
        activeAdapter.setText(edit.text);
      }
      activeAdapter.setCursorPosition(edit.cursor);
      if (edit.enterInsert) {
        modeManager.enterInsert();
        updateModeUI();
      }
    }
    cursorRenderer.update();
    statusBar.setCommandBuffer("");
  }
}
function handleAction(action, count, text, cursor, charArg) {
  if (!activeAdapter || !activeElement) return;
  switch (action) {
    case "escape":
      modeManager.enterNormal();
      updateModeUI();
      break;
    case "i":
      modeManager.enterInsert();
      updateModeUI();
      break;
    case "a":
      activeAdapter.setCursorPosition(Math.min(cursor + 1, text.length));
      modeManager.enterInsert();
      updateModeUI();
      break;
    case "I": {
      const lineStart2 = text.lastIndexOf("\n", cursor - 1) + 1;
      let pos = lineStart2;
      while (pos < text.length && (text[pos] === " " || text[pos] === "	")) pos++;
      activeAdapter.setCursorPosition(pos);
      modeManager.enterInsert();
      updateModeUI();
      break;
    }
    case "A": {
      let lineEnd2 = text.indexOf("\n", cursor);
      if (lineEnd2 === -1) lineEnd2 = text.length;
      activeAdapter.setCursorPosition(lineEnd2);
      modeManager.enterInsert();
      updateModeUI();
      break;
    }
    case "o": {
      pushUndo(activeElement, text);
      let lineEnd2 = text.indexOf("\n", cursor);
      if (lineEnd2 === -1) lineEnd2 = text.length;
      const newText = text.slice(0, lineEnd2) + "\n" + text.slice(lineEnd2);
      activeAdapter.setText(newText);
      activeAdapter.setCursorPosition(lineEnd2 + 1);
      modeManager.enterInsert();
      updateModeUI();
      break;
    }
    case "O": {
      pushUndo(activeElement, text);
      const lineStart2 = text.lastIndexOf("\n", cursor - 1) + 1;
      const newText = text.slice(0, lineStart2) + "\n" + text.slice(lineStart2);
      activeAdapter.setText(newText);
      activeAdapter.setCursorPosition(lineStart2);
      modeManager.enterInsert();
      updateModeUI();
      break;
    }
    case "x": {
      pushUndo(activeElement, text);
      const edit = deleteChar(text, cursor, count, registers);
      activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      cursorRenderer.update();
      break;
    }
    case "r": {
      if (charArg) {
        pushUndo(activeElement, text);
        const edit = replaceChar(text, cursor, charArg);
        activeAdapter.setText(edit.text);
        activeAdapter.setCursorPosition(edit.cursor);
        cursorRenderer.update();
      }
      break;
    }
    case "p": {
      pushUndo(activeElement, text);
      const edit = pasteAfter(text, cursor, registers);
      activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      cursorRenderer.update();
      break;
    }
    case "P": {
      pushUndo(activeElement, text);
      const edit = pasteBefore(text, cursor, registers);
      activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      cursorRenderer.update();
      break;
    }
    case "J": {
      pushUndo(activeElement, text);
      const edit = joinLines(text, cursor);
      activeAdapter.setText(edit.text);
      activeAdapter.setCursorPosition(edit.cursor);
      cursorRenderer.update();
      break;
    }
    case "u": {
      const prev = popUndo(activeElement);
      if (prev !== void 0) {
        activeAdapter.setText(prev);
        activeAdapter.setCursorPosition(Math.min(cursor, prev.length - 1));
        cursorRenderer.update();
      }
      break;
    }
    case "ctrl-r":
      break;
    case "v":
      visualAnchor = cursor;
      modeManager.enterVisual();
      updateModeUI();
      break;
    case "V":
      visualAnchor = cursor;
      modeManager.enterVisualLine();
      updateModeUI();
      break;
  }
}
function updateModeUI() {
  const mode = toRendererMode(modeManager.mode);
  cursorRenderer.setMode(mode);
  statusBar.setMode(mode);
  cursorRenderer.update();
}
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case "toggle-enabled" /* ToggleEnabled */: {
      const payload = message.payload;
      config = { ...config, enabled: payload.enabled };
      if (!payload.enabled) {
        cursorRenderer.detach();
        statusBar.detach();
        activeAdapter = null;
        activeElement = null;
      }
      break;
    }
    case "config-updated" /* ConfigUpdated */: {
      config = message.payload;
      if (!config.enabled || isSiteDisabled()) {
        cursorRenderer.detach();
        statusBar.detach();
        activeAdapter = null;
        activeElement = null;
      }
      break;
    }
  }
});
async function init() {
  try {
    const savedConfig = await chrome.runtime.sendMessage({ type: "get-config" /* GetConfig */ });
    if (savedConfig) {
      config = savedConfig;
    }
  } catch {
  }
  if (!config.enabled || isSiteDisabled()) return;
  document.addEventListener("keydown", handleKeyDown, true);
  fieldDetector.start();
}
init();
//# sourceMappingURL=content.js.map
