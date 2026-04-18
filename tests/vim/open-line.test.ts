import { describe, it, expect } from 'vitest';
import { lineStartOf, lineEndOf } from '../../src/vim/operators.js';

// These tests lock in the pure text math that `o` / `O` rely on:
//   • `o` inserts '\n' at `lineEndOf(text, cursor)` and positions the cursor
//     at that position + 1 (start of the new blank line).
//   • `O` inserts '\n' at `lineStartOf(text, cursor)` and keeps the cursor at
//     `lineStartOf(text, cursor)` (the new blank line moves into that spot).
// The adapter layer (insertLineBreak) handles the actual DOM mutation; these
// tests only verify the math is column-independent.

function openBelow(text: string, cursor: number): { text: string; cursor: number } {
  const end = lineEndOf(text, cursor);
  return { text: text.slice(0, end) + '\n' + text.slice(end), cursor: end + 1 };
}

function openAbove(text: string, cursor: number): { text: string; cursor: number } {
  const start = lineStartOf(text, cursor);
  return { text: text.slice(0, start) + '\n' + text.slice(start), cursor: start };
}

describe('lineStartOf / lineEndOf', () => {
  const text = 'abc\ndef\nghi';

  it('lineStartOf returns 0 for first line regardless of column', () => {
    expect(lineStartOf(text, 0)).toBe(0);
    expect(lineStartOf(text, 1)).toBe(0);
    expect(lineStartOf(text, 3)).toBe(0);
  });

  it('lineStartOf returns start of middle line regardless of column', () => {
    expect(lineStartOf(text, 4)).toBe(4);
    expect(lineStartOf(text, 5)).toBe(4);
    expect(lineStartOf(text, 7)).toBe(4);
  });

  it('lineEndOf returns the newline index on the first line', () => {
    expect(lineEndOf(text, 0)).toBe(3);
    expect(lineEndOf(text, 1)).toBe(3);
    expect(lineEndOf(text, 3)).toBe(3);
  });

  it('lineEndOf returns text.length on the last line (no trailing \\n)', () => {
    expect(lineEndOf(text, 8)).toBe(11);
    expect(lineEndOf(text, 10)).toBe(11);
  });

  it('handles empty buffer', () => {
    expect(lineStartOf('', 0)).toBe(0);
    expect(lineEndOf('', 0)).toBe(0);
  });
});

describe('o (open line below) math', () => {
  it('opens below regardless of column in a multi-line buffer', () => {
    const text = 'abc\ndef';
    // Cursor at the 'b' (column 1, first line)
    expect(openBelow(text, 1)).toEqual({ text: 'abc\n\ndef', cursor: 4 });
    // Cursor at the 'c' (column 2, first line)
    expect(openBelow(text, 2)).toEqual({ text: 'abc\n\ndef', cursor: 4 });
    // Cursor at the '\n' itself (still first line)
    expect(openBelow(text, 3)).toEqual({ text: 'abc\n\ndef', cursor: 4 });
  });

  it('opens below on the last line (no trailing newline)', () => {
    const text = 'abc\ndef';
    // Cursor at 'e' in "def"
    expect(openBelow(text, 5)).toEqual({ text: 'abc\ndef\n', cursor: 8 });
  });

  it('opens below in a single-line buffer', () => {
    expect(openBelow('hello', 0)).toEqual({ text: 'hello\n', cursor: 6 });
    expect(openBelow('hello', 3)).toEqual({ text: 'hello\n', cursor: 6 });
  });

  it('opens below in an empty buffer', () => {
    expect(openBelow('', 0)).toEqual({ text: '\n', cursor: 1 });
  });
});

describe('O (open line above) math', () => {
  it('opens above regardless of column on a middle line', () => {
    const text = 'abc\ndef\nghi';
    // Cursor at 'd' (col 0 of line 2)
    expect(openAbove(text, 4)).toEqual({ text: 'abc\n\ndef\nghi', cursor: 4 });
    // Cursor at 'e' (col 1 of line 2)
    expect(openAbove(text, 5)).toEqual({ text: 'abc\n\ndef\nghi', cursor: 4 });
    // Cursor at 'f' (col 2 of line 2)
    expect(openAbove(text, 6)).toEqual({ text: 'abc\n\ndef\nghi', cursor: 4 });
  });

  it('opens above on the first line', () => {
    const text = 'abc\ndef';
    expect(openAbove(text, 0)).toEqual({ text: '\nabc\ndef', cursor: 0 });
    expect(openAbove(text, 2)).toEqual({ text: '\nabc\ndef', cursor: 0 });
  });

  it('opens above in a single-line buffer', () => {
    expect(openAbove('hello', 0)).toEqual({ text: '\nhello', cursor: 0 });
    expect(openAbove('hello', 3)).toEqual({ text: '\nhello', cursor: 0 });
  });

  it('opens above in an empty buffer', () => {
    expect(openAbove('', 0)).toEqual({ text: '\n', cursor: 0 });
  });
});
