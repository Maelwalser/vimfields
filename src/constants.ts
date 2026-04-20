import { VimMode, type VimConfig } from "./types";

export const MODE_NAMES: Record<VimMode, string> = {
  [VimMode.Normal]: "NORMAL",
  [VimMode.Insert]: "INSERT",
  [VimMode.Visual]: "VISUAL",
  [VimMode.VisualLine]: "V-LINE",
};

export const CSS_CLASSES = {
  cursor: "vimfields-cursor",
  statusBar: "vimfields-status-bar",
  modeIndicator: "vimfields-mode",
  activeField: "vimfields-active",
  visualHighlight: "vimfields-visual-highlight",
} as const;

export const DEFAULT_CONFIG: VimConfig = {
  enabled: true,
  escapeRemap: "jk",
  disabledSites: [],
  useMonospaceFont: true,
};

export const MONOSPACE_FONT_STACK =
  '"JetBrains Mono", "Fira Code", "SF Mono", "Menlo", "Monaco", "Consolas", "Liberation Mono", monospace';

export const STORAGE_KEYS = {
  config: "vimfields-config",
  enabled: "vimfields-enabled",
} as const;

export const DEFAULT_KEYMAPS = {
  normal: {
    i: "enter-insert",
    a: "enter-insert-after",
    A: "enter-insert-end",
    I: "enter-insert-start",
    o: "open-below",
    O: "open-above",
    v: "enter-visual",
    V: "enter-visual-line",
    h: "move-left",
    j: "move-down",
    k: "move-up",
    l: "move-right",
    w: "move-word",
    b: "move-word-back",
    e: "move-word-end",
    "0": "move-line-start",
    $: "move-line-end",
    "^": "move-first-non-blank",
    g: "prefix-g",
    G: "move-end",
    x: "delete-char",
    X: "delete-char-before",
    d: "operator-delete",
    c: "operator-change",
    y: "operator-yank",
    p: "paste-after",
    P: "paste-before",
    u: "undo",
    ".": "repeat",
    "/": "search",
    n: "search-next",
    N: "search-prev",
  },
  visual: {
    Escape: "exit-visual",
    d: "visual-delete",
    c: "visual-change",
    y: "visual-yank",
    h: "move-left",
    j: "move-down",
    k: "move-up",
    l: "move-right",
    w: "move-word",
    b: "move-word-back",
    e: "move-word-end",
    "0": "move-line-start",
    $: "move-line-end",
  },
} as const;
