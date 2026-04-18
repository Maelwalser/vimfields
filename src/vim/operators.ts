import { TextEdit, Command, RegisterContent } from './types.js';
import { executeMotion, applyMotionRepeated, EXCLUSIVE_MOTIONS } from './motions.js';
import { textObjectRange } from './text-objects.js';
import { Registers } from './registers.js';

// ─── Helpers ─────────────────────────────────────────────────────

export function lineStartOf(text: string, pos: number): number {
  const prev = text.lastIndexOf('\n', pos - 1);
  return prev === -1 ? 0 : prev + 1;
}

export function lineEndOf(text: string, pos: number): number {
  const next = text.indexOf('\n', pos);
  return next === -1 ? text.length : next;
}

/** Get the full line range including the trailing newline if present */
function fullLineRange(text: string, pos: number): [number, number] {
  const start = lineStartOf(text, pos);
  let end = lineEndOf(text, pos);
  if (end < text.length) end++; // include the '\n'
  return [start, end];
}

// ─── Range calculation ───────────────────────────────────────────

/**
 * Compute the [start, end) range for a motion-based or text-object operator.
 * The third tuple element indicates whether the range is linewise.
 */
function motionRange(
  text: string,
  cursor: number,
  cmd: Command,
): [number, number, boolean] {
  if (cmd.linewise) {
    // dd, yy, cc — operate on whole lines
    let [start, end] = fullLineRange(text, cursor);
    for (let i = 1; i < cmd.count; i++) {
      if (end < text.length) {
        end = lineEndOf(text, end);
        if (end < text.length) end++; // include '\n'
      }
    }
    return [start, end, true];
  }

  // Text object: range comes directly from the text-object module.
  if (cmd.textObject) {
    const range = textObjectRange(cmd.textObject.kind, cmd.textObject.around, text, cursor);
    if (!range) return [cursor, cursor, false];
    return [range[0], range[1], false];
  }

  // Motion-based range
  const target = applyMotionRepeated(
    cmd.motion!, text, cursor, cmd.count, cmd.charArg, cmd.isCharMotionRepeat ?? false,
  );

  const start = Math.min(cursor, target);
  const rawEnd = Math.max(cursor, target);

  // For "w" specifically when used with an operator, Vim shrinks the range
  // to NOT include trailing whitespace on the final word (well-known dw
  // behaviour). The word motion already lands on the start of the next
  // word past whitespace, so we just back up past the whitespace.
  // For other exclusive motions: range is [start, target).
  // For inclusive motions (e, $, f, t, F, T, G, gg, %): range is [start, target].
  const end = EXCLUSIVE_MOTIONS.has(cmd.motion!) ? rawEnd : rawEnd + 1;
  return [start, end, false];
}

// ─── Operator implementations ────────────────────────────────────

/** d — delete */
export function deleteOp(
  text: string,
  cursor: number,
  cmd: Command,
  registers: Registers,
  register?: string,
): TextEdit {
  const [start, end, linewise] = motionRange(text, cursor, cmd);
  const deleted = text.slice(start, end);
  registers.recordDelete(deleted, linewise, register);

  const newText = text.slice(0, start) + text.slice(end);

  if (linewise) {
    // Vim moves the cursor to the first non-blank of the line that now
    // occupies the deleted line's position (or the previous line if the
    // last line was deleted). Do NOT clamp to the last char of the line
    // above — that "teleport to end of previous line" bug is what makes
    // dd feel unlike a real code-line delete.
    return { text: newText, cursor: firstNonBlankAfterDelete(newText, start) };
  }

  let newCursor = start;
  if (newText.length > 0 && newCursor >= newText.length) {
    newCursor = newText.length - 1;
  }
  if (newText.length === 0) newCursor = 0;

  return { text: newText, cursor: newCursor };
}

/**
 * After a linewise delete that removed `[start, end)`, pick the cursor
 * position Vim would use:
 *   • The line at `start` if it still exists (i.e. a middle/first line was
 *     deleted) — land on its first non-blank character.
 *   • Otherwise the previous line (the last line was deleted) — same rule.
 *   • Empty buffer → 0.
 */
function firstNonBlankAfterDelete(newText: string, deletedLineStart: number): number {
  if (newText.length === 0) return 0;

  let lineStart: number;
  if (deletedLineStart < newText.length) {
    // A line still lives at this offset — that's the "next" line after the
    // delete, which Vim moves to.
    lineStart = deletedLineStart;
  } else {
    // Deleted the last line; fall back to the new last line.
    lineStart = lineStartOf(newText, newText.length - 1);
  }

  let pos = lineStart;
  while (
    pos < newText.length &&
    newText[pos] !== '\n' &&
    (newText[pos] === ' ' || newText[pos] === '\t')
  ) {
    pos++;
  }
  // All whitespace (or empty line) → stay at line start.
  if (pos >= newText.length || newText[pos] === '\n') {
    return lineStart;
  }
  return pos;
}

/** c — change (delete then enter insert) */
export function changeOp(
  text: string,
  cursor: number,
  cmd: Command,
  registers: Registers,
  register?: string,
): TextEdit {
  const [start, end, linewise] = motionRange(text, cursor, cmd);
  const deleted = text.slice(start, end);
  registers.recordDelete(deleted, linewise, register);

  let newText: string;
  let newCursor: number;

  if (linewise) {
    // For cc, replace line content with empty line ready for insert
    const lineS = lineStartOf(text, cursor);
    const lineE = lineEndOf(text, cursor);
    newText = text.slice(0, lineS) + text.slice(lineE);
    newCursor = lineS;
  } else {
    newText = text.slice(0, start) + text.slice(end);
    newCursor = start;
  }

  return { text: newText, cursor: newCursor, enterInsert: true };
}

/** y — yank */
export function yankOp(
  text: string,
  cursor: number,
  cmd: Command,
  registers: Registers,
  register?: string,
): TextEdit {
  const [start, end, linewise] = motionRange(text, cursor, cmd);
  const yanked = text.slice(start, end);
  registers.recordYank(yanked, linewise, register);

  // Yank doesn't modify text; cursor goes to start of range
  return { text, cursor: start };
}

/** x — delete character under cursor */
export function deleteChar(
  text: string,
  cursor: number,
  count: number,
  registers: Registers,
  register?: string,
): TextEdit {
  if (text.length === 0) return { text, cursor: 0 };
  const end = Math.min(cursor + count, text.length);
  const deleted = text.slice(cursor, end);
  registers.recordDelete(deleted, false, register);

  const newText = text.slice(0, cursor) + text.slice(end);
  let newCursor = cursor;
  if (newText.length > 0 && newCursor >= newText.length) {
    newCursor = newText.length - 1;
  }
  if (newText.length === 0) newCursor = 0;

  return { text: newText, cursor: newCursor };
}

/** r — replace character under cursor */
export function replaceChar(
  text: string,
  cursor: number,
  ch: string,
): TextEdit {
  if (text.length === 0 || cursor >= text.length) return { text, cursor };
  const newText = text.slice(0, cursor) + ch + text.slice(cursor + 1);
  return { text: newText, cursor };
}

/** p — paste after cursor */
export function pasteAfter(
  text: string,
  cursor: number,
  registers: Registers,
  register?: string,
): TextEdit {
  const content = registers.getPaste(register);
  if (content.text === '') return { text, cursor };

  if (content.linewise) {
    const lineE = lineEndOf(text, cursor);
    const insertPos = lineE < text.length ? lineE + 1 : lineE;
    const pasteText = lineE < text.length
      ? content.text.endsWith('\n') ? content.text : content.text + '\n'
      : '\n' + (content.text.endsWith('\n') ? content.text.slice(0, -1) : content.text);
    const newText = text.slice(0, insertPos) + pasteText + text.slice(insertPos);
    // Cursor goes to first character of pasted text
    const newCursor = lineE < text.length ? insertPos : insertPos + 1;
    return { text: newText, cursor: newCursor };
  }

  // Character-wise paste: insert after cursor
  const insertPos = Math.min(cursor + 1, text.length);
  const newText = text.slice(0, insertPos) + content.text + text.slice(insertPos);
  return { text: newText, cursor: insertPos + content.text.length - 1 };
}

/** P — paste before cursor */
export function pasteBefore(
  text: string,
  cursor: number,
  registers: Registers,
  register?: string,
): TextEdit {
  const content = registers.getPaste(register);
  if (content.text === '') return { text, cursor };

  if (content.linewise) {
    const lineS = lineStartOf(text, cursor);
    const pasteText = content.text.endsWith('\n') ? content.text : content.text + '\n';
    const newText = text.slice(0, lineS) + pasteText + text.slice(lineS);
    return { text: newText, cursor: lineS };
  }

  const newText = text.slice(0, cursor) + content.text + text.slice(cursor);
  return { text: newText, cursor: cursor + content.text.length - 1 };
}

/** J — join current line with next line */
export function joinLines(
  text: string,
  cursor: number,
): TextEdit {
  const lineE = lineEndOf(text, cursor);
  if (lineE >= text.length) return { text, cursor }; // no next line

  // Remove the newline and leading whitespace of next line, replace with single space
  let nextStart = lineE + 1;
  while (nextStart < text.length && (text[nextStart] === ' ' || text[nextStart] === '\t')) {
    nextStart++;
  }

  const newText = text.slice(0, lineE) + ' ' + text.slice(nextStart);
  return { text: newText, cursor: lineE };
}

// ─── Visual mode operators ───────────────────────────────────────

/** Delete a visual selection */
export function deleteSelection(
  text: string,
  start: number,
  end: number,
  linewise: boolean,
  registers: Registers,
  register?: string,
): TextEdit {
  let delStart: number;
  let delEnd: number;

  if (linewise) {
    [delStart, delEnd] = fullLineRange(text, Math.min(start, end));
    const [, endLine] = fullLineRange(text, Math.max(start, end));
    delEnd = endLine;
  } else {
    delStart = Math.min(start, end);
    delEnd = Math.max(start, end) + 1;
  }

  const deleted = text.slice(delStart, delEnd);
  registers.recordDelete(deleted, linewise, register);

  const newText = text.slice(0, delStart) + text.slice(delEnd);
  let newCursor = delStart;
  if (newText.length > 0 && newCursor >= newText.length) {
    newCursor = newText.length - 1;
  }
  if (newText.length === 0) newCursor = 0;

  return { text: newText, cursor: newCursor };
}

/** Yank a visual selection */
export function yankSelection(
  text: string,
  start: number,
  end: number,
  linewise: boolean,
  registers: Registers,
  register?: string,
): TextEdit {
  let yankStart: number;
  let yankEnd: number;

  if (linewise) {
    [yankStart, yankEnd] = fullLineRange(text, Math.min(start, end));
    const [, endLine] = fullLineRange(text, Math.max(start, end));
    yankEnd = endLine;
  } else {
    yankStart = Math.min(start, end);
    yankEnd = Math.max(start, end) + 1;
  }

  const yanked = text.slice(yankStart, yankEnd);
  registers.recordYank(yanked, linewise, register);

  return { text, cursor: Math.min(start, end) };
}

/** Change a visual selection (delete + enter insert) */
export function changeSelection(
  text: string,
  start: number,
  end: number,
  linewise: boolean,
  registers: Registers,
  register?: string,
): TextEdit {
  const edit = deleteSelection(text, start, end, linewise, registers, register);
  return { ...edit, enterInsert: true };
}

// ─── Case-change operators ───────────────────────────────────────

type CaseMode = 'lower' | 'upper' | 'toggle';

function applyCase(s: string, mode: CaseMode): string {
  switch (mode) {
    case 'lower': return s.toLowerCase();
    case 'upper': return s.toUpperCase();
    case 'toggle': {
      let out = '';
      for (const ch of s) {
        const low = ch.toLowerCase();
        out += ch === low ? ch.toUpperCase() : low;
      }
      return out;
    }
  }
}

/** gu / gU / g~ — change case over a motion or text-object range. */
export function caseOp(
  text: string,
  cursor: number,
  cmd: Command,
  mode: CaseMode,
): TextEdit {
  const [start, end] = motionRange(text, cursor, cmd);
  if (start === end) return { text, cursor };
  const newText = text.slice(0, start) + applyCase(text.slice(start, end), mode) + text.slice(end);
  return { text: newText, cursor: start };
}

/** ~ — toggle case of the single character under the cursor, then advance. */
export function toggleCaseChar(text: string, cursor: number, count: number): TextEdit {
  if (text.length === 0 || cursor >= text.length) return { text, cursor };
  const end = Math.min(cursor + count, text.length);
  const newText = text.slice(0, cursor) + applyCase(text.slice(cursor, end), 'toggle') + text.slice(end);
  return { text: newText, cursor: Math.min(end, newText.length > 0 ? newText.length - 1 : 0) };
}

/** X — delete character BEFORE the cursor (the inverse of x). */
export function deleteCharBefore(
  text: string,
  cursor: number,
  count: number,
  registers: Registers,
  register?: string,
): TextEdit {
  if (cursor === 0) return { text, cursor };
  const start = Math.max(0, cursor - count);
  const deleted = text.slice(start, cursor);
  registers.recordDelete(deleted, false, register);
  const newText = text.slice(0, start) + text.slice(cursor);
  return { text: newText, cursor: start };
}

/** Apply case change directly to a visual selection. */
export function caseSelection(
  text: string,
  start: number,
  end: number,
  linewise: boolean,
  mode: CaseMode,
): TextEdit {
  let s: number;
  let e: number;
  if (linewise) {
    [s, e] = fullLineRange(text, Math.min(start, end));
    const [, endLine] = fullLineRange(text, Math.max(start, end));
    e = endLine;
  } else {
    s = Math.min(start, end);
    e = Math.max(start, end) + 1;
  }
  const newText = text.slice(0, s) + applyCase(text.slice(s, e), mode) + text.slice(e);
  return { text: newText, cursor: s };
}
