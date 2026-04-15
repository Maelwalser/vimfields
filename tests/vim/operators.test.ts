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

    it('pastes linewise after current line', () => {
      reg.recordYank('new\n', true);
      const result = pasteAfter('hello\nworld', 2, reg);
      expect(result.text).toBe('hello\nnew\nworld');
      expect(result.cursor).toBe(6);
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
});
