import { describe, it, expect, beforeEach } from 'vitest';
import { CommandParser } from '../../src/vim/command-parser.js';

describe('CommandParser', () => {
  let parser: CommandParser;

  beforeEach(() => {
    parser = new CommandParser();
  });

  describe('simple motions', () => {
    it('parses h as motion', () => {
      const result = parser.feed('h');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: 'h', linewise: false },
      });
    });

    it('parses w as motion', () => {
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: 'w', linewise: false },
      });
    });

    it('parses $ as motion', () => {
      const result = parser.feed('$');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: '$', linewise: false },
      });
    });

    it('parses G as motion', () => {
      const result = parser.feed('G');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: 'G', linewise: false },
      });
    });
  });

  describe('counted motions', () => {
    it('parses 3w', () => {
      expect(parser.feed('3')).toEqual({ status: 'pending' });
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 3, operator: null, motion: 'w', linewise: false },
      });
    });

    it('parses 12j', () => {
      parser.feed('1');
      parser.feed('2');
      const result = parser.feed('j');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 12, operator: null, motion: 'j', linewise: false },
      });
    });
  });

  describe('gg motion', () => {
    it('parses gg', () => {
      expect(parser.feed('g')).toEqual({ status: 'pending' });
      const result = parser.feed('g');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: 'gg', linewise: false },
      });
    });
  });

  describe('char-seek motions', () => {
    it('parses fx', () => {
      expect(parser.feed('f')).toEqual({ status: 'pending' });
      const result = parser.feed('x');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: 'f', charArg: 'x', linewise: false },
      });
    });

    it('parses ta', () => {
      expect(parser.feed('t')).toEqual({ status: 'pending' });
      const result = parser.feed('a');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: 't', charArg: 'a', linewise: false },
      });
    });
  });

  describe('operator + motion', () => {
    it('parses dw', () => {
      expect(parser.feed('d')).toEqual({ status: 'pending' });
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: 'd', motion: 'w', linewise: false },
      });
    });

    it('parses y$', () => {
      parser.feed('y');
      const result = parser.feed('$');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: 'y', motion: '$', linewise: false },
      });
    });

    it('parses 2dw', () => {
      parser.feed('2');
      parser.feed('d');
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 2, operator: 'd', motion: 'w', linewise: false },
      });
    });

    it('parses d2w (count after operator)', () => {
      parser.feed('d');
      parser.feed('2');
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 2, operator: 'd', motion: 'w', linewise: false },
      });
    });

    it('parses 2d3w (both counts multiply)', () => {
      parser.feed('2');
      parser.feed('d');
      parser.feed('3');
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 6, operator: 'd', motion: 'w', linewise: false },
      });
    });

    it('parses dfw (operator + char-seek)', () => {
      parser.feed('d');
      parser.feed('f');
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: 'd', motion: 'f', charArg: 'w', linewise: false },
      });
    });

    it('parses dgg', () => {
      parser.feed('d');
      parser.feed('g');
      const result = parser.feed('g');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: 'd', motion: 'gg', linewise: false },
      });
    });
  });

  describe('double operators (linewise)', () => {
    it('parses dd', () => {
      parser.feed('d');
      const result = parser.feed('d');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: 'd', motion: null, linewise: true },
      });
    });

    it('parses yy', () => {
      parser.feed('y');
      const result = parser.feed('y');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: 'y', motion: null, linewise: true },
      });
    });

    it('parses 3dd', () => {
      parser.feed('3');
      parser.feed('d');
      const result = parser.feed('d');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 3, operator: 'd', motion: null, linewise: true },
      });
    });

    it('parses cc', () => {
      parser.feed('c');
      const result = parser.feed('c');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: 'c', motion: null, linewise: true },
      });
    });
  });

  describe('single-key actions', () => {
    it('parses i as action', () => {
      const result = parser.feed('i');
      expect(result).toEqual({ status: 'action', action: 'i', count: 1 });
    });

    it('parses A as action', () => {
      const result = parser.feed('A');
      expect(result).toEqual({ status: 'action', action: 'A', count: 1 });
    });

    it('parses o as action', () => {
      const result = parser.feed('o');
      expect(result).toEqual({ status: 'action', action: 'o', count: 1 });
    });

    it('parses x as action', () => {
      const result = parser.feed('x');
      expect(result).toEqual({ status: 'action', action: 'x', count: 1 });
    });

    it('parses p as action', () => {
      const result = parser.feed('p');
      expect(result).toEqual({ status: 'action', action: 'p', count: 1 });
    });

    it('parses P as action', () => {
      const result = parser.feed('P');
      expect(result).toEqual({ status: 'action', action: 'P', count: 1 });
    });

    it('parses J as action', () => {
      const result = parser.feed('J');
      expect(result).toEqual({ status: 'action', action: 'J', count: 1 });
    });

    it('parses u as action', () => {
      const result = parser.feed('u');
      expect(result).toEqual({ status: 'action', action: 'u', count: 1 });
    });

    it('parses v as action', () => {
      const result = parser.feed('v');
      expect(result).toEqual({ status: 'action', action: 'v', count: 1 });
    });

    it('parses V as action', () => {
      const result = parser.feed('V');
      expect(result).toEqual({ status: 'action', action: 'V', count: 1 });
    });
  });

  describe('r (replace) with char arg', () => {
    it('parses ra', () => {
      expect(parser.feed('r')).toEqual({ status: 'pending' });
      const result = parser.feed('a');
      expect(result).toEqual({ status: 'action', action: 'r', count: 1, charArg: 'a' });
    });
  });

  describe('escape / ctrl-c', () => {
    it('parses Escape', () => {
      const result = parser.feed('\x1b');
      expect(result).toEqual({ status: 'action', action: 'escape', count: 1 });
    });

    it('parses Ctrl-C', () => {
      const result = parser.feed('\x03');
      expect(result).toEqual({ status: 'action', action: 'escape', count: 1 });
    });
  });

  describe('ctrl-r (redo)', () => {
    it('parses Ctrl-R', () => {
      const result = parser.feed('\x12');
      expect(result).toEqual({ status: 'action', action: 'ctrl-r', count: 1 });
    });
  });

  describe('invalid sequences', () => {
    it('returns invalid for unknown key', () => {
      const result = parser.feed('z');
      expect(result).toEqual({ status: 'invalid' });
    });
  });

  describe('text objects', () => {
    it('parses ciw', () => {
      parser.feed('c');
      parser.feed('i');
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: {
          count: 1, operator: 'c', motion: null, linewise: false,
          textObject: { kind: 'w', around: false },
        },
      });
    });

    it('parses daw', () => {
      parser.feed('d');
      parser.feed('a');
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: {
          count: 1, operator: 'd', motion: null, linewise: false,
          textObject: { kind: 'w', around: true },
        },
      });
    });

    it('parses di"', () => {
      parser.feed('d');
      parser.feed('i');
      const result = parser.feed('"');
      expect(result).toEqual({
        status: 'complete',
        command: {
          count: 1, operator: 'd', motion: null, linewise: false,
          textObject: { kind: '"', around: false },
        },
      });
    });

    it('parses ci(', () => {
      parser.feed('c');
      parser.feed('i');
      const result = parser.feed('(');
      expect(result).toEqual({
        status: 'complete',
        command: {
          count: 1, operator: 'c', motion: null, linewise: false,
          textObject: { kind: '(', around: false },
        },
      });
    });

    it('parses yiB (yank inner braces)', () => {
      parser.feed('y');
      parser.feed('i');
      const result = parser.feed('B');
      expect(result).toEqual({
        status: 'complete',
        command: {
          count: 1, operator: 'y', motion: null, linewise: false,
          textObject: { kind: 'B', around: false },
        },
      });
    });

    it('ia without a valid object char is invalid', () => {
      parser.feed('d');
      parser.feed('i');
      const result = parser.feed('z');
      expect(result).toEqual({ status: 'invalid' });
    });
  });

  describe('backward char-seek and repeat', () => {
    it('parses F{char}', () => {
      expect(parser.feed('F')).toEqual({ status: 'pending' });
      const result = parser.feed('x');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: 'F', charArg: 'x', linewise: false },
      });
    });

    it('parses ; as a motion', () => {
      const result = parser.feed(';');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: ';', linewise: false },
      });
    });

    it('parses , as a motion', () => {
      const result = parser.feed(',');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: ',', linewise: false },
      });
    });
  });

  describe('WORD motions and extras', () => {
    it('parses W', () => {
      expect(parser.feed('W')).toMatchObject({ status: 'complete' });
    });

    it('parses ^', () => {
      const result = parser.feed('^');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: '^', linewise: false },
      });
    });

    it('parses %', () => {
      const result = parser.feed('%');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: '%', linewise: false },
      });
    });

    it('parses ge', () => {
      parser.feed('g');
      const result = parser.feed('e');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: 'ge', linewise: false },
      });
    });
  });

  describe('case-change operators', () => {
    it('parses guw', () => {
      parser.feed('g');
      parser.feed('u');
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: 'gu', motion: 'w', linewise: false },
      });
    });

    it('parses gUiw (uppercase inner word)', () => {
      parser.feed('g');
      parser.feed('U');
      parser.feed('i');
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: {
          count: 1, operator: 'gU', motion: null, linewise: false,
          textObject: { kind: 'w', around: false },
        },
      });
    });

    it('parses g~w (toggle case over word)', () => {
      parser.feed('g');
      parser.feed('~');
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: 'g~', motion: 'w', linewise: false },
      });
    });

    it('parses guu (lowercase current line)', () => {
      parser.feed('g');
      parser.feed('u');
      const result = parser.feed('u');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: 'gu', motion: null, linewise: true },
      });
    });

    it('parses gUU (uppercase current line)', () => {
      parser.feed('g');
      parser.feed('U');
      const result = parser.feed('U');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: 'gU', motion: null, linewise: true },
      });
    });

    it('parses g~~ (toggle case current line)', () => {
      parser.feed('g');
      parser.feed('~');
      const result = parser.feed('~');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: 'g~', motion: null, linewise: true },
      });
    });

    it('parses 2gUU (uppercase 2 lines)', () => {
      parser.feed('2');
      parser.feed('g');
      parser.feed('U');
      const result = parser.feed('U');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 2, operator: 'gU', motion: null, linewise: true },
      });
    });
  });

  describe('new single-key actions', () => {
    it('parses D', () => {
      expect(parser.feed('D')).toEqual({ status: 'action', action: 'D', count: 1 });
    });

    it('parses C', () => {
      expect(parser.feed('C')).toEqual({ status: 'action', action: 'C', count: 1 });
    });

    it('parses Y', () => {
      expect(parser.feed('Y')).toEqual({ status: 'action', action: 'Y', count: 1 });
    });

    it('parses s', () => {
      expect(parser.feed('s')).toEqual({ status: 'action', action: 's', count: 1 });
    });

    it('parses S', () => {
      expect(parser.feed('S')).toEqual({ status: 'action', action: 'S', count: 1 });
    });

    it('parses X', () => {
      expect(parser.feed('X')).toEqual({ status: 'action', action: 'X', count: 1 });
    });

    it('parses ~', () => {
      expect(parser.feed('~')).toEqual({ status: 'action', action: '~', count: 1 });
    });
  });

  describe('reset', () => {
    it('clears the buffer', () => {
      parser.feed('d');
      parser.reset();
      expect(parser.getBuffer()).toBe('');

      // Next key starts fresh
      const result = parser.feed('w');
      expect(result).toEqual({
        status: 'complete',
        command: { count: 1, operator: null, motion: 'w', linewise: false },
      });
    });
  });
});
