/** Vim mode enumeration */
export enum VimMode {
  Normal = 'normal',
  Insert = 'insert',
  Visual = 'visual',
  VisualLine = 'visual-line',
}

/** A text edit describing a mutation to apply */
export interface TextEdit {
  /** New full text content after the edit */
  text: string;
  /** New cursor position after the edit */
  cursor: number;
  /** Whether to enter insert mode after this edit */
  enterInsert?: boolean;
}

/** A parsed Vim command */
export interface Command {
  /** Repeat count (default 1) */
  count: number;
  /** Operator key (d, c, y, gu, gU, g~) or null for motion-only */
  operator: string | null;
  /** Motion key (w, b, e, $, etc.) or null for operator-only commands */
  motion: string | null;
  /** Extra character argument (for f, t, F, T, r commands) */
  charArg?: string;
  /** Whether this is a line-wise command (dd, yy, cc) */
  linewise?: boolean;
  /** Text object, if this command targets one (e.g. ciw → { kind: 'w', around: false }) */
  textObject?: { kind: string; around: boolean };
  /**
   * True when the motion originated from a ;/, repeat of f/F/t/T.
   * Signals t/T to advance past the current target before searching.
   */
  isCharMotionRepeat?: boolean;
}

/** Register name type — single char */
export type RegisterName = string;

/** Stored register content */
export interface RegisterContent {
  text: string;
  linewise: boolean;
}

/** Mode transition event */
export interface ModeChangeEvent {
  from: VimMode;
  to: VimMode;
}
