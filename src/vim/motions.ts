/**
 * Pure motion functions: (text, cursor) => newCursor
 *
 * All motions operate on a plain string and a zero-based cursor index.
 * They return the new cursor position.
 */

/** Clamp cursor within [0, text.length - 1] (at least 0) */
function clamp(pos: number, text: string): number {
  if (text.length === 0) return 0;
  return Math.max(0, Math.min(pos, text.length - 1));
}

// ─── Character motions ───────────────────────────────────────────

/** h — move left */
export function charLeft(text: string, cursor: number): number {
  return clamp(cursor - 1, text);
}

/** l — move right */
export function charRight(text: string, cursor: number): number {
  return clamp(cursor + 1, text);
}

// ─── Line helpers ────────────────────────────────────────────────

function lineStartOf(text: string, cursor: number): number {
  const prev = text.lastIndexOf('\n', cursor - 1);
  return prev === -1 ? 0 : prev + 1;
}

function lineEndOf(text: string, cursor: number): number {
  const next = text.indexOf('\n', cursor);
  return next === -1 ? text.length : next;
}

/** Get the column (offset from line start) */
function columnOf(text: string, cursor: number): number {
  return cursor - lineStartOf(text, cursor);
}

// ─── Vertical motions ────────────────────────────────────────────

/** j — move down one line, preserving column */
export function lineDown(text: string, cursor: number): number {
  const col = columnOf(text, cursor);
  const currentLineEnd = lineEndOf(text, cursor);
  if (currentLineEnd >= text.length) return cursor; // already last line
  const nextLineStart = currentLineEnd + 1;
  const nextLineEnd = lineEndOf(text, nextLineStart);
  const nextLineLen = nextLineEnd - nextLineStart;
  const maxCol = nextLineLen > 0 ? nextLineLen - 1 : 0;
  return nextLineStart + Math.min(col, maxCol);
}

/** k — move up one line, preserving column */
export function lineUp(text: string, cursor: number): number {
  const col = columnOf(text, cursor);
  const currentLineStart = lineStartOf(text, cursor);
  if (currentLineStart === 0) return cursor; // already first line
  const prevLineEnd = currentLineStart - 1; // the '\n' character
  const prevLineStart = lineStartOf(text, prevLineEnd);
  const prevLineLen = prevLineEnd - prevLineStart;
  const maxCol = prevLineLen > 0 ? prevLineLen - 1 : 0;
  return prevLineStart + Math.min(col, maxCol);
}

// ─── Line position motions ───────────────────────────────────────

/** 0 — start of current line */
export function lineStart(text: string, cursor: number): number {
  return lineStartOf(text, cursor);
}

/** $ — end of current line (last character, not past-end) */
export function lineEnd(text: string, cursor: number): number {
  const end = lineEndOf(text, cursor);
  // In Vim, $ goes to the last character of the line, not past it
  // For an empty line, stay at line start
  const start = lineStartOf(text, cursor);
  if (end === start) return start;
  return end - 1;
}

// ─── Word motions ────────────────────────────────────────────────

function isWordChar(ch: string): boolean {
  return /[\w]/.test(ch);
}

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

/** w — word forward: move to start of next word */
export function wordForward(text: string, cursor: number): number {
  let i = cursor;
  const len = text.length;
  if (i >= len) return clamp(len - 1, text);

  // Skip current word characters or current non-word-non-whitespace
  if (isWordChar(text[i])) {
    while (i < len && isWordChar(text[i])) i++;
  } else if (!isWhitespace(text[i])) {
    while (i < len && !isWordChar(text[i]) && !isWhitespace(text[i])) i++;
  }

  // Skip whitespace
  while (i < len && isWhitespace(text[i])) i++;

  return clamp(i, text);
}

/** b — word backward: move to start of previous word */
export function wordBackward(text: string, cursor: number): number {
  let i = cursor;
  if (i <= 0) return 0;

  // Move back past whitespace
  i--;
  while (i > 0 && isWhitespace(text[i])) i--;

  // Move back through the word
  if (i >= 0 && isWordChar(text[i])) {
    while (i > 0 && isWordChar(text[i - 1])) i--;
  } else if (i >= 0 && !isWhitespace(text[i])) {
    while (i > 0 && !isWordChar(text[i - 1]) && !isWhitespace(text[i - 1])) i--;
  }

  return Math.max(0, i);
}

/** e — end of word: move to end of current/next word */
export function wordEnd(text: string, cursor: number): number {
  let i = cursor;
  const len = text.length;
  if (i >= len - 1) return clamp(len - 1, text);

  // Move forward at least one character
  i++;

  // Skip whitespace
  while (i < len && isWhitespace(text[i])) i++;

  // Move through the word to its end
  if (i < len && isWordChar(text[i])) {
    while (i + 1 < len && isWordChar(text[i + 1])) i++;
  } else if (i < len) {
    while (i + 1 < len && !isWordChar(text[i + 1]) && !isWhitespace(text[i + 1])) i++;
  }

  return clamp(i, text);
}

// ─── Document motions ────────────────────────────────────────────

/** gg — go to start of document */
export function documentStart(_text: string, _cursor: number): number {
  return 0;
}

/** G — go to end of document (last character) */
export function documentEnd(text: string, _cursor: number): number {
  return clamp(text.length - 1, text);
}

// ─── Character-seek motions ──────────────────────────────────────

/** f{char} — find char forward on current line (inclusive) */
export function findCharForward(text: string, cursor: number, ch: string): number {
  const end = lineEndOf(text, cursor);
  for (let i = cursor + 1; i < end; i++) {
    if (text[i] === ch) return i;
  }
  return cursor; // not found — stay put
}

/** t{char} — till char forward on current line (exclusive — one before) */
export function tillCharForward(text: string, cursor: number, ch: string): number {
  const found = findCharForward(text, cursor, ch);
  if (found === cursor) return cursor;
  return found - 1;
}

// ─── Motion dispatcher ──────────────────────────────────────────

/**
 * Execute a named motion, returning the new cursor position.
 * For motions requiring a char argument, pass `charArg`.
 */
export function executeMotion(
  motionKey: string,
  text: string,
  cursor: number,
  charArg?: string,
): number {
  switch (motionKey) {
    case 'h': return charLeft(text, cursor);
    case 'l': return charRight(text, cursor);
    case 'j': return lineDown(text, cursor);
    case 'k': return lineUp(text, cursor);
    case '0': return lineStart(text, cursor);
    case '$': return lineEnd(text, cursor);
    case 'w': return wordForward(text, cursor);
    case 'b': return wordBackward(text, cursor);
    case 'e': return wordEnd(text, cursor);
    case 'gg': return documentStart(text, cursor);
    case 'G': return documentEnd(text, cursor);
    case 'f': return charArg ? findCharForward(text, cursor, charArg) : cursor;
    case 't': return charArg ? tillCharForward(text, cursor, charArg) : cursor;
    default: return cursor;
  }
}
