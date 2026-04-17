import { describe, it, expect } from 'vitest';
import {
  wordObject,
  WORDObject,
  quoteObject,
  bracketObject,
  textObjectRange,
} from '../../src/vim/text-objects.js';

describe('text objects', () => {
  describe('iw / aw (word)', () => {
    it('iw selects the word under cursor', () => {
      // cursor on 'e' in "hello world"
      expect(wordObject('hello world', 1, false)).toEqual([0, 5]);
    });

    it('iw selects the word when cursor is on first char', () => {
      expect(wordObject('hello world', 0, false)).toEqual([0, 5]);
    });

    it('iw selects the word when cursor is on last char', () => {
      expect(wordObject('hello world', 4, false)).toEqual([0, 5]);
    });

    it('aw includes trailing whitespace', () => {
      expect(wordObject('hello world', 1, true)).toEqual([0, 6]);
    });

    it('aw falls back to leading whitespace if no trailing', () => {
      // "hello world" — cursor on last word, no trailing whitespace
      expect(wordObject('hello world', 8, true)).toEqual([5, 11]);
    });

    it('iw on whitespace selects the whitespace run', () => {
      expect(wordObject('hello   world', 6, false)).toEqual([5, 8]);
    });

    it('iw on punctuation selects the punctuation run', () => {
      expect(wordObject('foo.,.bar', 3, false)).toEqual([3, 6]);
    });
  });

  describe('iW / aW (WORD)', () => {
    it('iW treats punctuation as part of WORD', () => {
      expect(WORDObject('foo.bar baz', 0, false)).toEqual([0, 7]);
    });

    it('aW includes trailing whitespace', () => {
      expect(WORDObject('foo.bar baz', 0, true)).toEqual([0, 8]);
    });
  });

  describe('i" / a" (quotes)', () => {
    it('i" selects contents between double quotes', () => {
      // cursor inside the string "hello"
      expect(quoteObject('say "hello" world', 6, false, '"')).toEqual([5, 10]);
    });

    it('a" includes the quotes', () => {
      expect(quoteObject('say "hello" world', 6, true, '"')).toEqual([4, 11]);
    });

    it('i\' works for single quotes', () => {
      // cursor inside 'nice'
      expect(quoteObject("say 'nice' here", 6, false, "'")).toEqual([5, 9]);
    });

    it('i` works for backticks', () => {
      expect(quoteObject('run `cmd` now', 6, false, '`')).toEqual([5, 8]);
    });

    it('returns null with only one quote on line', () => {
      expect(quoteObject('one " only', 5, false, '"')).toBeNull();
    });

    it('selects next pair when cursor is before it', () => {
      expect(quoteObject('abc "def" xyz', 0, false, '"')).toEqual([5, 8]);
    });

    it('ignores escaped quotes', () => {
      expect(quoteObject('say "he\\"llo" there', 6, false, '"')).toEqual([5, 12]);
    });
  });

  describe('i( / a( (parens)', () => {
    it('i( selects contents of parens', () => {
      // "foo(bar baz)" — cursor on 'a' in bar
      expect(bracketObject('foo(bar baz)', 5, false, '(')).toEqual([4, 11]);
    });

    it('a( includes the parens', () => {
      expect(bracketObject('foo(bar baz)', 5, true, '(')).toEqual([3, 12]);
    });

    it('ib alias works for parens', () => {
      expect(bracketObject('(hello)', 3, false, 'b')).toEqual([1, 6]);
    });

    it('handles nested parens — picks innermost', () => {
      // "(a (b) c)" — cursor on 'b'
      expect(bracketObject('(a (b) c)', 4, false, '(')).toEqual([4, 5]);
    });

    it('works when cursor is on opening bracket', () => {
      expect(bracketObject('(hello)', 0, false, '(')).toEqual([1, 6]);
    });

    it('returns null when not inside parens', () => {
      expect(bracketObject('no parens here', 3, false, '(')).toBeNull();
    });
  });

  describe('i{ / a{ (braces)', () => {
    it('i{ selects contents of braces', () => {
      expect(bracketObject('if { x = 1; }', 6, false, '{')).toEqual([4, 12]);
    });

    it('iB alias works for braces', () => {
      expect(bracketObject('{ foo }', 3, false, 'B')).toEqual([1, 6]);
    });
  });

  describe('i[ / a[ (brackets)', () => {
    it('i[ selects contents of brackets', () => {
      expect(bracketObject('arr[0]', 4, false, '[')).toEqual([4, 5]);
    });
  });

  describe('i< / a< (angle brackets)', () => {
    it('i< selects contents of angle brackets', () => {
      expect(bracketObject('<tag>', 2, false, '<')).toEqual([1, 4]);
    });
  });

  describe('dispatcher', () => {
    it('dispatches to wordObject for "w"', () => {
      expect(textObjectRange('w', false, 'hello world', 1)).toEqual([0, 5]);
    });

    it('dispatches to quoteObject for \'"\'', () => {
      expect(textObjectRange('"', false, 'say "hi" now', 5, )).toEqual([5, 7]);
    });

    it('dispatches to bracketObject for "("', () => {
      expect(textObjectRange('(', true, '(x)', 1)).toEqual([0, 3]);
    });

    it('returns null for unknown kind', () => {
      expect(textObjectRange('z', false, 'text', 0)).toBeNull();
    });
  });
});
