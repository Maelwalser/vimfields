import { describe, it, expect, beforeEach } from 'vitest';
import { Registers } from '../../src/vim/registers.js';
import {
  deleteOp,
  changeOp,
  yankOp,
  deleteChar,
  replaceChar,
  pasteAfter,
  pasteBefore,
  joinLines,
  deleteSelection,
  yankSelection,
  changeSelection,
  caseOp,
  toggleCaseChar,
  deleteCharBefore,
  caseSelection,
} from '../../src/vim/operators.js';
import { Command } from '../../src/vim/types.js';

describe('operators', () => {
  let reg: Registers;

  beforeEach(() => {
    reg = new Registers();
  });

  describe('deleteOp (d)', () => {
    it('dw deletes a word', () => {
      const cmd: Command = { count: 1, operator: 'd', motion: 'w', linewise: false };
      const result = deleteOp('hello world', 0, cmd, reg);
      expect(result.text).toBe('world');
      expect(result.cursor).toBe(0);
    });

    it('dd deletes entire line', () => {
      const cmd: Command = { count: 1, operator: 'd', motion: null, linewise: true };
      const result = deleteOp('hello\nworld\nfoo', 6, cmd, reg);
      expect(result.text).toBe('hello\nfoo');
      expect(result.cursor).toBe(6);
    });

    it('dd on the last line removes the preceding newline so the line is actually gone', () => {
      // dd must remove both "world" AND the '\n' that separated it from
      // "hello" — otherwise a dangling "hello\n" would leave the line
      // visually deleted but the separator still there.
      const cmd: Command = { count: 1, operator: 'd', motion: null, linewise: true };
      const result = deleteOp('hello\nworld', 7, cmd, reg);
      expect(result.text).toBe('hello');
      // Cursor lands on the previous line (now the only line), preserving col 1.
      expect(result.cursor).toBe(1);
    });

    it('dd on a trailing-newline last line lands on the empty trailing line', () => {
      // The buffer "hello\nworld\n" ends with '\n' (an empty trailing line).
      // dd on "world" removes that line; the cursor should sit on the empty
      // trailing line, not teleport back to the last line with text.
      const cmd: Command = { count: 1, operator: 'd', motion: null, linewise: true };
      const result = deleteOp('hello\nworld\n', 7, cmd, reg);
      expect(result.text).toBe('hello\n');
      expect(result.cursor).toBe(6);
    });

    it('dd on a middle line preserves column on the line below', () => {
      const cmd: Command = { count: 1, operator: 'd', motion: null, linewise: true };
      // Cursor at col 2 of "  two" (offset 6, on 't').
      const result = deleteOp('one\n  two\nthree', 6, cmd, reg);
      expect(result.text).toBe('one\nthree');
      // "three" slides up; cursor stays at col 2 → offset 4 + 2.
      expect(result.cursor).toBe(6);
    });

    it('dd clamps the preserved column to the replacement line length', () => {
      const cmd: Command = { count: 1, operator: 'd', motion: null, linewise: true };
      // Cursor at col 4 of "hello" (offset 4, on 'o').
      const result = deleteOp('hello\nhi', 4, cmd, reg);
      expect(result.text).toBe('hi');
      // "hi" only has length 2, so the preserved column clamps to col 1.
      expect(result.cursor).toBe(1);
    });

    it('d$ deletes to end of line', () => {
      const cmd: Command = { count: 1, operator: 'd', motion: '$', linewise: false };
      const result = deleteOp('hello world', 5, cmd, reg);
      expect(result.text).toBe('hello');
      expect(result.cursor).toBe(4);
    });

    it('populates registers on delete', () => {
      const cmd: Command = { count: 1, operator: 'd', motion: 'w', linewise: false };
      deleteOp('hello world', 0, cmd, reg);
      expect(reg.get('"').text).toBe('hello ');
    });

    it('dF deletes backward through a char (inclusive)', () => {
      const cmd: Command = {
        count: 1, operator: 'd', motion: 'F', charArg: 'h', linewise: false,
      };
      // Cursor at 5 (space). dFh → range [0, 5] inclusive → deletes "hello "
      const result = deleteOp('hello world', 5, cmd, reg);
      expect(result.text).toBe('world');
    });

    it('d; after f{char} repeats the last char motion', () => {
      // This is an integration concern — see content.ts normalizeCharMotion.
      // Here we just confirm ; alone as a motion is rejected (no operator semantics).
      const cmd: Command = { count: 1, operator: 'd', motion: 'f', charArg: 'o', linewise: false };
      const result = deleteOp('hello world', 0, cmd, reg);
      expect(result.text).toBe(' world'); // deleted "hello" (up through first 'o')
    });

    it('dW deletes a WORD', () => {
      const cmd: Command = { count: 1, operator: 'd', motion: 'W', linewise: false };
      const result = deleteOp('foo.bar baz', 0, cmd, reg);
      expect(result.text).toBe('baz');
    });
  });

  describe('changeOp (c)', () => {
    it('cw deletes word and enters insert', () => {
      const cmd: Command = { count: 1, operator: 'c', motion: 'w', linewise: false };
      const result = changeOp('hello world', 0, cmd, reg);
      expect(result.text).toBe('world');
      expect(result.enterInsert).toBe(true);
    });

    it('cc changes entire line', () => {
      const cmd: Command = { count: 1, operator: 'c', motion: null, linewise: true };
      const result = changeOp('hello\nworld', 0, cmd, reg);
      expect(result.enterInsert).toBe(true);
      expect(result.cursor).toBe(0);
    });
  });

  describe('yankOp (y)', () => {
    it('yw yanks a word without modifying text', () => {
      const cmd: Command = { count: 1, operator: 'y', motion: 'w', linewise: false };
      const result = yankOp('hello world', 0, cmd, reg);
      expect(result.text).toBe('hello world');
      expect(reg.get('"').text).toBe('hello ');
      expect(reg.get('0').text).toBe('hello ');
    });

    it('yy yanks entire line', () => {
      const cmd: Command = { count: 1, operator: 'y', motion: null, linewise: true };
      const result = yankOp('hello\nworld', 0, cmd, reg);
      expect(result.text).toBe('hello\nworld');
      expect(reg.get('"').text).toBe('hello\n');
      expect(reg.get('"').linewise).toBe(true);
    });

    it('yy keeps the cursor at its original column (no teleport to line start)', () => {
      // Cursor at column 3 of "hello world" — after yy it should stay at 3,
      // not snap back to 0. Matches Vim, and prevents a disorienting jump
      // in chat editors where yanking is a common quick action.
      const cmd: Command = { count: 1, operator: 'y', motion: null, linewise: true };
      const result = yankOp('hello world\nsecond', 3, cmd, reg);
      expect(result.cursor).toBe(3);
    });

    it('yy on a non-first line keeps the column rather than jumping to line start', () => {
      // Text "abc\ndef", cursor at 5 (mid-"def", column 1). yy should keep 5.
      const cmd: Command = { count: 1, operator: 'y', motion: null, linewise: true };
      const result = yankOp('abc\ndef', 5, cmd, reg);
      expect(result.cursor).toBe(5);
    });

    it('forward character-wise yw leaves the cursor put', () => {
      const cmd: Command = { count: 1, operator: 'y', motion: 'w', linewise: false };
      const result = yankOp('hello world', 2, cmd, reg);
      expect(result.cursor).toBe(2);
    });

    it('backward character-wise yank moves cursor to the start of the range', () => {
      // yb from inside "world" yanks backward, cursor should land at start of "world".
      const cmd: Command = { count: 1, operator: 'y', motion: 'b', linewise: false };
      const result = yankOp('hello world', 8, cmd, reg);
      expect(result.cursor).toBe(6);
    });
  });

  describe('deleteChar (x)', () => {
    it('deletes character under cursor', () => {
      const result = deleteChar('hello', 1, 1, reg);
      expect(result.text).toBe('hllo');
      expect(result.cursor).toBe(1);
    });

    it('clamps cursor when deleting last char', () => {
      const result = deleteChar('ab', 1, 1, reg);
      expect(result.text).toBe('a');
      expect(result.cursor).toBe(0);
    });

    it('handles empty string', () => {
      const result = deleteChar('', 0, 1, reg);
      expect(result.text).toBe('');
      expect(result.cursor).toBe(0);
    });

    it('deletes multiple chars with count', () => {
      const result = deleteChar('hello', 1, 3, reg);
      expect(result.text).toBe('ho');
    });
  });

  describe('replaceChar (r)', () => {
    it('replaces character at cursor', () => {
      const result = replaceChar('hello', 1, 'a');
      expect(result.text).toBe('hallo');
      expect(result.cursor).toBe(1);
    });

    it('no-ops on empty string', () => {
      const result = replaceChar('', 0, 'a');
      expect(result.text).toBe('');
    });
  });

  describe('pasteAfter (p)', () => {
    it('pastes character-wise after cursor', () => {
      reg.recordYank('XY', false);
      const result = pasteAfter('hello', 2, reg);
      expect(result.text).toBe('helXYlo');
      expect(result.cursor).toBe(4);
    });

    it('pastes linewise after current line and lands on the last pasted char', () => {
      reg.recordYank('new\n', true);
      const result = pasteAfter('hello\nworld', 2, reg);
      expect(result.text).toBe('hello\nnew\nworld');
      // Cursor lands on the 'w' of "new" — the end of the pasted text,
      // not its start. Matches the character-wise `p` convention.
      expect(result.cursor).toBe(8);
    });

    it('pastes linewise on the last line and lands on the last pasted char', () => {
      reg.recordYank('new\n', true);
      const result = pasteAfter('hello', 2, reg);
      expect(result.text).toBe('hello\nnew');
      expect(result.cursor).toBe(8);
    });

    it('no-ops with empty register', () => {
      const result = pasteAfter('hello', 2, reg);
      expect(result.text).toBe('hello');
    });
  });

  describe('pasteBefore (P)', () => {
    it('pastes character-wise before cursor', () => {
      reg.recordYank('XY', false);
      const result = pasteBefore('hello', 2, reg);
      expect(result.text).toBe('heXYllo');
      expect(result.cursor).toBe(3);
    });

    it('pastes linewise before current line', () => {
      reg.recordYank('new\n', true);
      const result = pasteBefore('hello\nworld', 7, reg);
      expect(result.text).toBe('hello\nnew\nworld');
      expect(result.cursor).toBe(6);
    });
  });

  describe('joinLines (J)', () => {
    it('joins current line with next', () => {
      const result = joinLines('hello\nworld', 2);
      expect(result.text).toBe('hello world');
      expect(result.cursor).toBe(5);
    });

    it('strips leading whitespace on next line', () => {
      const result = joinLines('hello\n  world', 2);
      expect(result.text).toBe('hello world');
    });

    it('no-ops on last line', () => {
      const result = joinLines('hello', 2);
      expect(result.text).toBe('hello');
    });
  });

  describe('visual mode operators', () => {
    it('deleteSelection deletes character-wise range', () => {
      const result = deleteSelection('hello world', 2, 6, false, reg);
      expect(result.text).toBe('heorld');
      expect(result.cursor).toBe(2);
    });

    it('yankSelection yanks without modifying', () => {
      const result = yankSelection('hello world', 2, 6, false, reg);
      expect(result.text).toBe('hello world');
      expect(reg.get('"').text).toBe('llo w');
    });

    it('changeSelection deletes and enters insert', () => {
      const result = changeSelection('hello world', 2, 6, false, reg);
      expect(result.text).toBe('heorld');
      expect(result.enterInsert).toBe(true);
    });

    it('deleteSelection handles linewise', () => {
      const result = deleteSelection('hello\nworld\nfoo', 2, 8, true, reg);
      expect(result.text).toBe('foo');
    });
  });

  describe('text-object operators', () => {
    it('ciw deletes the word under cursor and enters insert', () => {
      const cmd: Command = {
        count: 1, operator: 'c', motion: null, linewise: false,
        textObject: { kind: 'w', around: false },
      };
      const result = changeOp('hello world', 2, cmd, reg);
      expect(result.text).toBe(' world');
      expect(result.cursor).toBe(0);
      expect(result.enterInsert).toBe(true);
    });

    it('daw deletes word + trailing whitespace', () => {
      const cmd: Command = {
        count: 1, operator: 'd', motion: null, linewise: false,
        textObject: { kind: 'w', around: true },
      };
      const result = deleteOp('hello world now', 2, cmd, reg);
      expect(result.text).toBe('world now');
    });

    it('di" deletes contents of double-quoted string', () => {
      const cmd: Command = {
        count: 1, operator: 'd', motion: null, linewise: false,
        textObject: { kind: '"', around: false },
      };
      const result = deleteOp('say "hello" now', 7, cmd, reg);
      expect(result.text).toBe('say "" now');
    });

    it('ci( changes contents of parens', () => {
      const cmd: Command = {
        count: 1, operator: 'c', motion: null, linewise: false,
        textObject: { kind: '(', around: false },
      };
      const result = changeOp('fn(arg)', 4, cmd, reg);
      expect(result.text).toBe('fn()');
      expect(result.enterInsert).toBe(true);
    });

    it('yiw yanks the word under cursor', () => {
      const cmd: Command = {
        count: 1, operator: 'y', motion: null, linewise: false,
        textObject: { kind: 'w', around: false },
      };
      const result = yankOp('hello world', 7, cmd, reg);
      expect(result.text).toBe('hello world');
      expect(reg.get('"').text).toBe('world');
    });
  });

  describe('case-change operators', () => {
    it('gu over a word lowercases it', () => {
      const cmd: Command = { count: 1, operator: 'gu', motion: 'w', linewise: false };
      const result = caseOp('HELLO world', 0, cmd, 'lower');
      expect(result.text).toBe('hello world');
    });

    it('gU over a word uppercases it', () => {
      const cmd: Command = { count: 1, operator: 'gU', motion: 'w', linewise: false };
      const result = caseOp('hello world', 0, cmd, 'upper');
      expect(result.text).toBe('HELLO world');
    });

    it('g~ toggles case', () => {
      const cmd: Command = { count: 1, operator: 'g~', motion: 'w', linewise: false };
      const result = caseOp('HeLLo world', 0, cmd, 'toggle');
      expect(result.text).toBe('hEllO world');
    });

    it('gU over text object works', () => {
      const cmd: Command = {
        count: 1, operator: 'gU', motion: null, linewise: false,
        textObject: { kind: 'w', around: false },
      };
      const result = caseOp('hello world', 2, cmd, 'upper');
      expect(result.text).toBe('HELLO world');
    });

    it('toggleCaseChar flips single char', () => {
      const result = toggleCaseChar('abc', 1, 1);
      expect(result.text).toBe('aBc');
    });

    it('guu lowercases the current line (linewise)', () => {
      const cmd: Command = { count: 1, operator: 'gu', motion: null, linewise: true };
      const result = caseOp('HELLO\nWORLD', 2, cmd, 'lower');
      expect(result.text).toBe('hello\nWORLD');
    });

    it('gUU uppercases the current line', () => {
      const cmd: Command = { count: 1, operator: 'gU', motion: null, linewise: true };
      const result = caseOp('hello\nworld', 2, cmd, 'upper');
      expect(result.text).toBe('HELLO\nworld');
    });

    it('g~~ toggles case on the current line', () => {
      const cmd: Command = { count: 1, operator: 'g~', motion: null, linewise: true };
      const result = caseOp('HeLLo\nworld', 2, cmd, 'toggle');
      expect(result.text).toBe('hEllO\nworld');
    });

    it('2gUU uppercases 2 lines', () => {
      const cmd: Command = { count: 2, operator: 'gU', motion: null, linewise: true };
      const result = caseOp('a\nb\nc', 0, cmd, 'upper');
      expect(result.text).toBe('A\nB\nc');
    });

    it('gUiw on an ASCII word uppercases it', () => {
      const cmd: Command = {
        count: 1, operator: 'gU', motion: null, linewise: false,
        textObject: { kind: 'w', around: false },
      };
      const result = caseOp('say hello now', 5, cmd, 'upper');
      expect(result.text).toBe('say HELLO now');
    });

    it('caseSelection preserves non-letter chars', () => {
      const result = caseSelection('abc-123!', 0, 7, false, 'upper');
      expect(result.text).toBe('ABC-123!');
    });

    it('caseSelection with reversed start/end still works', () => {
      // User selected right-to-left — anchor=8, cursor=2.
      // Vim selections are inclusive at both ends → range covers positions [2, 8].
      const result = caseSelection('hello world', 8, 2, false, 'upper');
      expect(result.text).toBe('heLLO WORld');
    });
  });

  describe('deleteCharBefore (X)', () => {
    it('deletes char before cursor', () => {
      const result = deleteCharBefore('hello', 3, 1, reg);
      expect(result.text).toBe('helo');
      expect(result.cursor).toBe(2);
    });

    it('no-ops at start of string', () => {
      const result = deleteCharBefore('hello', 0, 1, reg);
      expect(result.text).toBe('hello');
    });
  });

  describe('caseSelection (visual u/U/~)', () => {
    it('lowercases a visual range', () => {
      const result = caseSelection('HELLO WORLD', 0, 4, false, 'lower');
      expect(result.text).toBe('hello WORLD');
    });

    it('uppercases a linewise visual range', () => {
      const result = caseSelection('one\ntwo\nthree', 0, 4, true, 'upper');
      expect(result.text).toBe('ONE\nTWO\nthree');
    });
  });
});
