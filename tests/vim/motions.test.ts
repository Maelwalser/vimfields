import { describe, it, expect } from 'vitest';
import {
  charLeft,
  charRight,
  lineDown,
  lineUp,
  lineStart,
  lineEnd,
  wordForward,
  wordBackward,
  wordEnd,
  documentStart,
  documentEnd,
  findCharForward,
  tillCharForward,
  findCharBackward,
  tillCharBackward,
  WORDForward,
  WORDBackward,
  WORDEnd,
  firstNonBlank,
  matchingBracket,
  wordEndBackward,
  executeMotion,
  applyMotionRepeated,
} from '../../src/vim/motions.js';

describe('motions', () => {
  describe('h/l — character movement', () => {
    it('h moves left', () => {
      expect(charLeft('hello', 3)).toBe(2);
    });

    it('h clamps at 0', () => {
      expect(charLeft('hello', 0)).toBe(0);
    });

    it('l moves right', () => {
      expect(charRight('hello', 2)).toBe(3);
    });

    it('l clamps at end', () => {
      expect(charRight('hello', 4)).toBe(4);
    });

    it('handles empty string', () => {
      expect(charLeft('', 0)).toBe(0);
      expect(charRight('', 0)).toBe(0);
    });
  });

  describe('j/k — line movement', () => {
    const text = 'hello\nworld\nfoo';

    it('j moves down preserving column', () => {
      expect(lineDown(text, 2)).toBe(8); // 'l' in hello -> 'r' in world
    });

    it('j clamps to shorter line', () => {
      expect(lineDown(text, 10)).toBe(14); // 'd' in world (col 4) -> 'o' in foo (col 2, clamped)
    });

    it('j stays on last line', () => {
      expect(lineDown(text, 12)).toBe(12);
    });

    it('k moves up preserving column', () => {
      expect(lineUp(text, 8)).toBe(2); // 'r' in world -> 'l' in hello
    });

    it('k stays on first line', () => {
      expect(lineUp(text, 2)).toBe(2);
    });

    it('k preserves column on longer line', () => {
      expect(lineUp(text, 14)).toBe(8); // 'o' in foo (col 2) -> 'r' in world (col 2)
    });
  });

  describe('0/$ — line start/end', () => {
    const text = 'hello\nworld';

    it('0 goes to line start', () => {
      expect(lineStart(text, 3)).toBe(0);
      expect(lineStart(text, 8)).toBe(6);
    });

    it('$ goes to last character of line', () => {
      expect(lineEnd(text, 0)).toBe(4);
      expect(lineEnd(text, 6)).toBe(10);
    });

    it('$ on empty line stays at line start', () => {
      const t = 'a\n\nb';
      expect(lineEnd(t, 2)).toBe(2); // empty line
    });
  });

  describe('w — word forward', () => {
    it('moves to start of next word', () => {
      expect(wordForward('hello world', 0)).toBe(6);
    });

    it('skips punctuation as word boundary', () => {
      expect(wordForward('foo.bar', 0)).toBe(3);
    });

    it('clamps at end', () => {
      const text = 'hi';
      const result = wordForward(text, 1);
      expect(result).toBeLessThanOrEqual(text.length - 1);
    });
  });

  describe('b — word backward', () => {
    it('moves to start of previous word', () => {
      expect(wordBackward('hello world', 8)).toBe(6);
    });

    it('moves to start of current word from mid-word', () => {
      expect(wordBackward('hello world', 7)).toBe(6);
    });

    it('clamps at 0', () => {
      expect(wordBackward('hello', 0)).toBe(0);
    });
  });

  describe('e — word end', () => {
    it('moves to end of current/next word', () => {
      expect(wordEnd('hello world', 0)).toBe(4);
    });

    it('moves to end of next word when at end of current', () => {
      expect(wordEnd('hello world', 4)).toBe(10);
    });
  });

  describe('gg/G — document start/end', () => {
    it('gg goes to 0', () => {
      expect(documentStart('hello', 3)).toBe(0);
    });

    it('G goes to last character', () => {
      expect(documentEnd('hello', 0)).toBe(4);
    });

    it('G on empty string returns 0', () => {
      expect(documentEnd('', 0)).toBe(0);
    });
  });

  describe('f/t — character seek', () => {
    const text = 'hello world';

    it('f finds char forward', () => {
      expect(findCharForward(text, 0, 'o')).toBe(4);
    });

    it('f returns cursor if not found', () => {
      expect(findCharForward(text, 0, 'z')).toBe(0);
    });

    it('t goes one before found char', () => {
      expect(tillCharForward(text, 0, 'o')).toBe(3);
    });

    it('t returns cursor if not found', () => {
      expect(tillCharForward(text, 0, 'z')).toBe(0);
    });
  });

  describe('F/T — backward character seek', () => {
    const text = 'hello world';

    it('F finds char backward', () => {
      expect(findCharBackward(text, 10, 'l')).toBe(9);
    });

    it('F returns cursor when not found', () => {
      expect(findCharBackward(text, 4, 'z')).toBe(4);
    });

    it('F stops at start of line', () => {
      const t = 'abc\ndef';
      // cursor in "def", looking for 'a' — should stay because 'a' is on a different line
      expect(findCharBackward(t, 5, 'a')).toBe(5);
    });

    it('T stops one after the found char', () => {
      expect(tillCharBackward(text, 10, 'l')).toBe(10);
    });
  });

  describe('W/B/E — WORD motions', () => {
    it('W jumps over punctuation (WORD = whitespace-separated)', () => {
      expect(WORDForward('foo.bar baz', 0)).toBe(8);
    });

    it('B goes back by WORDs', () => {
      expect(WORDBackward('foo.bar baz', 8)).toBe(0);
    });

    it('E goes to end of current WORD', () => {
      expect(WORDEnd('foo.bar baz', 0)).toBe(6);
    });
  });

  describe('^ — first non-blank char', () => {
    it('moves to first non-blank on current line', () => {
      expect(firstNonBlank('   hello', 5)).toBe(3);
    });

    it('returns line start when line is all whitespace', () => {
      expect(firstNonBlank('   ', 1)).toBe(3);
    });
  });

  describe('ge — end of previous word', () => {
    it('moves back to end of previous word', () => {
      expect(wordEndBackward('hello world', 8)).toBe(4);
    });

    it('clamps at start', () => {
      expect(wordEndBackward('hello', 0)).toBe(0);
    });
  });

  describe('% — matching bracket', () => {
    it('jumps from open to close paren', () => {
      expect(matchingBracket('(hello)', 0)).toBe(6);
    });

    it('jumps from close to open paren', () => {
      expect(matchingBracket('(hello)', 6)).toBe(0);
    });

    it('handles nested brackets', () => {
      expect(matchingBracket('(a (b) c)', 0)).toBe(8);
      expect(matchingBracket('(a (b) c)', 3)).toBe(5);
    });

    it('jumps across braces', () => {
      expect(matchingBracket('{x}', 0)).toBe(2);
    });

    it('scans forward on line if cursor is not on a bracket', () => {
      expect(matchingBracket('foo(bar)', 0)).toBe(7);
    });

    it('returns cursor when no matching bracket', () => {
      expect(matchingBracket('(hello', 0)).toBe(0);
    });
  });

  describe('executeMotion dispatcher', () => {
    it('dispatches h', () => {
      expect(executeMotion('h', 'hello', 2)).toBe(1);
    });

    it('dispatches gg', () => {
      expect(executeMotion('gg', 'hello', 3)).toBe(0);
    });

    it('dispatches f with charArg', () => {
      expect(executeMotion('f', 'hello world', 0, 'w')).toBe(6);
    });

    it('returns cursor for unknown motion', () => {
      expect(executeMotion('z', 'hello', 2)).toBe(2);
    });

    it('dispatches F with charArg', () => {
      expect(executeMotion('F', 'hello world', 10, 'l')).toBe(9);
    });

    it('dispatches W', () => {
      expect(executeMotion('W', 'foo.bar baz', 0)).toBe(8);
    });

    it('dispatches %', () => {
      expect(executeMotion('%', '(x)', 0)).toBe(2);
    });

    it('dispatches ^', () => {
      expect(executeMotion('^', '  hi', 3)).toBe(2);
    });
  });

  describe('applyMotionRepeated — t/T advance on repeats', () => {
    it('single t lands one before target (no advance)', () => {
      // "axbxc": tx from cursor 0 → position 0 (stuck, Vim-correct)
      expect(applyMotionRepeated('t', 'axbxc', 0, 1, 'x', false)).toBe(0);
    });

    it('; repeating tx advances to next occurrence', () => {
      // After tx at cursor 0 (stuck at 0), ; should find next x at 3 → land at 2
      expect(applyMotionRepeated('t', 'axbxc', 0, 1, 'x', true)).toBe(2);
    });

    it('counted 2tx iterates correctly', () => {
      // From cursor 0: 1st till → 0; 2nd iteration advances → lands at 2
      expect(applyMotionRepeated('t', 'axbxc', 0, 2, 'x', false)).toBe(2);
    });

    it('counted 3tx on "axbxcxdx"', () => {
      // x positions: 1, 3, 5, 7. 3tx → till 3rd x at 5 → land at 4
      expect(applyMotionRepeated('t', 'axbxcxdx', 0, 3, 'x', false)).toBe(4);
    });

    it('single f does not need advance', () => {
      // fx from 0 → x at 1
      expect(applyMotionRepeated('f', 'axbxc', 0, 1, 'x', false)).toBe(1);
    });

    it('; repeating fx advances naturally', () => {
      // From cursor 1 (after fx), ; → next x at 3
      expect(applyMotionRepeated('f', 'axbxc', 1, 1, 'x', true)).toBe(3);
    });

    it('; repeating Tx advances backward past current', () => {
      // "axbxc" cursor 4 ('c'). Tx finds x at 3, lands at 4 (stuck).
      // ; with advance should find x at 1, land at 2.
      expect(applyMotionRepeated('T', 'axbxc', 4, 1, 'x', true)).toBe(2);
    });

    it('single T lands one after target (no advance)', () => {
      // "axbxc" cursor 4. Tx finds x at 3, returns 4.
      expect(applyMotionRepeated('T', 'axbxc', 4, 1, 'x', false)).toBe(4);
    });
  });
});
