/**
 * Pure text-object range computations.
 *
 * A text object returns a `[start, end)` half-open range over the text.
 * `i<x>` = inner (exclude delimiters/surrounding whitespace);
 * `a<x>` = around (include delimiters or trailing whitespace).
 *
 * Operators consume the range directly — deletion is `text.slice(0, start) + text.slice(end)`.
 */

import { isWordChar, isWhitespace } from './motions.js';

/** A text object's computed range; null means "no valid object at cursor". */
export type TextObjectRange = [number, number] | null;

// ─── Word / WORD ─────────────────────────────────────────────────

function isWORDChar(ch: string): boolean {
  return !isWhitespace(ch);
}

type CharPred = (ch: string) => boolean;

/**
 * Generic word-like text object. `wordPred` decides what counts as part
 * of the word; everything else (including whitespace) is a separator.
 *
 * - Inner: span of matching chars containing the cursor. If the cursor is on
 *   whitespace, select the whitespace run instead (Vim behaviour).
 * - Around: word plus trailing whitespace; if no trailing whitespace,
 *   include the leading whitespace instead.
 */
function wordLikeObject(
  text: string,
  cursor: number,
  around: boolean,
  wordPred: CharPred,
): TextObjectRange {
  if (text.length === 0) return null;
  if (cursor >= text.length) return null;

  const ch = text[cursor];
  const len = text.length;

  // Helpers bound to this predicate
  const classify = (c: string): 'word' | 'nonword' | 'ws' => {
    if (isWhitespace(c)) return 'ws';
    return wordPred(c) ? 'word' : 'nonword';
  };

  const startClass = classify(ch);

  // Find the run [start, end) of chars with the same class as the cursor.
  let start = cursor;
  while (start > 0 && classify(text[start - 1]) === startClass) start--;
  let end = cursor + 1;
  while (end < len && classify(text[end]) === startClass) end++;

  if (!around) return [start, end];

  // `a<word>` rules:
  //   * on a word/non-word run: extend through trailing whitespace;
  //     if there is none, extend through leading whitespace instead.
  //   * on whitespace: extend through the following word run (Vim's `aw` on WS).
  if (startClass === 'ws') {
    let wEnd = end;
    while (wEnd < len && !isWhitespace(text[wEnd])) wEnd++;
    return [start, wEnd];
  }

  let wsEnd = end;
  while (wsEnd < len && isWhitespace(text[wsEnd])) wsEnd++;
  if (wsEnd > end) return [start, wsEnd];

  let wsStart = start;
  while (wsStart > 0 && isWhitespace(text[wsStart - 1])) wsStart--;
  return [wsStart, end];
}

export function wordObject(text: string, cursor: number, around: boolean): TextObjectRange {
  // A "word" for `iw`/`aw` is a maximal run of word-chars OR a maximal run
  // of non-word-non-whitespace chars. `wordLikeObject` handles both by
  // classifying into {word, nonword, ws}.
  return wordLikeObject(text, cursor, around, isWordChar);
}

export function WORDObject(text: string, cursor: number, around: boolean): TextObjectRange {
  return wordLikeObject(text, cursor, around, isWORDChar);
}

// ─── Quoted strings ──────────────────────────────────────────────

/**
 * `i"` / `a"`: the string between the pair of quote chars on the *current line*.
 *
 * Algorithm: scan the line; pair quotes in order of appearance. The cursor's
 * enclosing pair is the one whose range covers it. If the cursor is not
 * inside any pair but sits before a pair, select that pair (Vim behaviour).
 */
export function quoteObject(
  text: string,
  cursor: number,
  around: boolean,
  quote: string,
): TextObjectRange {
  // Restrict to the current line
  const lineStart = (() => {
    const p = text.lastIndexOf('\n', cursor - 1);
    return p === -1 ? 0 : p + 1;
  })();
  const lineEnd = (() => {
    const p = text.indexOf('\n', cursor);
    return p === -1 ? text.length : p;
  })();

  // Collect quote positions on this line (ignoring escaped quotes).
  const quotes: number[] = [];
  for (let i = lineStart; i < lineEnd; i++) {
    if (text[i] === quote && text[i - 1] !== '\\') quotes.push(i);
  }
  if (quotes.length < 2) return null;

  // Pair them: (quotes[0], quotes[1]), (quotes[2], quotes[3]), ...
  for (let p = 0; p + 1 < quotes.length; p += 2) {
    const open = quotes[p];
    const close = quotes[p + 1];
    if (cursor >= open && cursor <= close) {
      return around ? [open, close + 1] : [open + 1, close];
    }
  }

  // Cursor before any pair — select the first pair after it
  for (let p = 0; p + 1 < quotes.length; p += 2) {
    const open = quotes[p];
    const close = quotes[p + 1];
    if (cursor < open) {
      return around ? [open, close + 1] : [open + 1, close];
    }
  }

  return null;
}

// ─── Bracket pairs ───────────────────────────────────────────────

const BRACKET_PAIRS: Record<string, [string, string]> = {
  '(': ['(', ')'], ')': ['(', ')'], 'b': ['(', ')'],
  '[': ['[', ']'], ']': ['[', ']'],
  '{': ['{', '}'], '}': ['{', '}'], 'B': ['{', '}'],
  '<': ['<', '>'], '>': ['<', '>'],
};

export function bracketObject(
  text: string,
  cursor: number,
  around: boolean,
  kind: string,
): TextObjectRange {
  const pair = BRACKET_PAIRS[kind];
  if (!pair) return null;
  const [open, close] = pair;

  // Find the enclosing open bracket (scanning backwards with depth tracking).
  let depth = 0;
  let openPos = -1;
  // If cursor is ON an open bracket, treat that as the opening.
  if (text[cursor] === open) {
    openPos = cursor;
  } else {
    for (let i = cursor - 1; i >= 0; i--) {
      const c = text[i];
      if (c === close) depth++;
      else if (c === open) {
        if (depth === 0) { openPos = i; break; }
        depth--;
      }
    }
  }
  if (openPos === -1) return null;

  // Find the matching close bracket from openPos.
  depth = 1;
  let closePos = -1;
  for (let i = openPos + 1; i < text.length; i++) {
    const c = text[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) { closePos = i; break; }
    }
  }
  if (closePos === -1) return null;

  return around ? [openPos, closePos + 1] : [openPos + 1, closePos];
}

// ─── Dispatcher ──────────────────────────────────────────────────

/**
 * Text object dispatcher.
 * `kind` is the character after `i`/`a` (w, W, ", ', `, (, ), b, {, }, B, [, ], <, >).
 */
export function textObjectRange(
  kind: string,
  around: boolean,
  text: string,
  cursor: number,
): TextObjectRange {
  switch (kind) {
    case 'w': return wordObject(text, cursor, around);
    case 'W': return WORDObject(text, cursor, around);
    case '"':
    case "'":
    case '`': return quoteObject(text, cursor, around, kind);
    case '(': case ')': case 'b':
    case '[': case ']':
    case '{': case '}': case 'B':
    case '<': case '>':
      return bracketObject(text, cursor, around, kind);
    default:
      return null;
  }
}

/** Characters that follow `i`/`a` to form a text object. */
export const TEXT_OBJECT_CHARS = new Set([
  'w', 'W', '"', "'", '`',
  '(', ')', 'b',
  '[', ']',
  '{', '}', 'B',
  '<', '>',
]);
