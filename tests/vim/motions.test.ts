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
  executeMotion,
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
  });
});
