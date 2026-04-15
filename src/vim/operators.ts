import { TextEdit, Command, RegisterContent } from './types.js';
import { executeMotion } from './motions.js';
import { Registers } from './registers.js';

// ─── Helpers ─────────────────────────────────────────────────────

function lineStartOf(text: string, pos: number): number {
  const prev = text.lastIndexOf('\n', pos - 1);
  return prev === -1 ? 0 : prev + 1;
}

function lineEndOf(text: string, pos: number): number {
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
 * Compute the [start, end) range for a motion-based operator.
 * `end` is exclusive for character-wise motions.
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

  // Motion-based range
  let target = cursor;
  for (let i = 0; i < cmd.count; i++) {
    target = executeMotion(cmd.motion!, text, target, cmd.charArg);
  }

  const start = Math.min(cursor, target);
  const rawEnd = Math.max(cursor, target);

  // Exclusive motions (w, b, 0): range is [start, target)
  // Inclusive motions (e, $, f, t, G, gg): range is [start, target]
  const exclusiveMotions = new Set(['w', 'b', '0']);
  const end = exclusiveMotions.has(cmd.motion!) ? rawEnd : rawEnd + 1;
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
  let newCursor = start;
  // Clamp cursor
  if (newText.length > 0 && newCursor >= newText.length) {
    newCursor = newText.length - 1;
  }
  if (newText.length === 0) newCursor = 0;

  return { text: newText, cursor: newCursor };
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
