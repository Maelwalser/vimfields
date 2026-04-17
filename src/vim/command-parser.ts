import { Command } from './types.js';
import { TEXT_OBJECT_CHARS } from './text-objects.js';

/** Result of feeding a key to the parser */
export type ParseResult =
  | { status: 'pending' }
  | { status: 'complete'; command: Command }
  | { status: 'invalid' }
  | { status: 'action'; action: string; count: number; charArg?: string };

const OPERATORS = new Set(['d', 'c', 'y']);
/** Single-char motions (no extra argument). */
const MOTIONS = new Set([
  'h', 'j', 'k', 'l',
  'w', 'b', 'e',
  'W', 'B', 'E',
  '0', '$', '^', '%',
  'G',
  ';', ',',
]);
/** Motions that require a following character. */
const CHAR_MOTIONS = new Set(['f', 't', 'F', 'T']);
const ACTIONS = new Set([
  'i', 'a', 'I', 'A', 'o', 'O',   // insert entry points
  'p', 'P',                          // paste
  'x', 'X',                          // delete char (after / before)
  's', 'S',                          // substitute char / line
  'D', 'C', 'Y',                     // line shortcuts
  'J',                               // join lines
  'u',                               // undo
  '~',                               // toggle case
  'v', 'V',                          // visual mode
]);

/**
 * Buffers incoming keystrokes and parses them into Vim commands.
 *
 * Grammar (simplified):
 *   [count] (action | motion | operator [count] (motion | text-object))
 *
 * where:
 *   motion       = h|j|k|l|w|b|e|W|B|E|0|$|^|%|G|;|,|gg|ge|gE|f{c}|t{c}|F{c}|T{c}
 *   text-object  = (i|a)(w|W|"|'|`|(|)|b|[|]|{|}|B|<|>)
 *   operator     = d | c | y | gu | gU | g~
 */
export class CommandParser {
  private buffer: string[] = [];

  /** Feed a key into the parser. Returns the parse result. */
  feed(key: string): ParseResult {
    this.buffer.push(key);
    const seq = this.buffer.join('');
    const result = this.tryParse(seq);
    if (result.status !== 'pending') {
      this.buffer = [];
    }
    return result;
  }

  reset(): void { this.buffer = []; }
  getBuffer(): string { return this.buffer.join(''); }

  private tryParse(seq: string): ParseResult {
    let i = 0;

    // Leading count
    const leadingCount = this.readCount(seq, i);
    i = leadingCount.next;
    const count1 = leadingCount.value;

    if (i >= seq.length) return { status: 'pending' };

    // Ctrl-R
    if (seq[i] === '\x12') return { status: 'action', action: 'ctrl-r', count: count1 };
    // Escape / Ctrl-C
    if (seq[i] === '\x1b' || seq[i] === '\x03') {
      return { status: 'action', action: 'escape', count: 1 };
    }

    // r{char}
    if (seq[i] === 'r') {
      if (i + 1 >= seq.length) return { status: 'pending' };
      return { status: 'action', action: 'r', count: count1, charArg: seq[i + 1] };
    }

    // g-prefixed motions and operators: gg, ge, gE, gu{m}, gU{m}, g~{m}
    if (seq[i] === 'g') {
      if (i + 1 >= seq.length) return { status: 'pending' };
      const second = seq[i + 1];

      // Motion: gg
      if (second === 'g') {
        return {
          status: 'complete',
          command: { count: count1, operator: null, motion: 'gg', linewise: false },
        };
      }

      // Motion: ge / gE
      if (second === 'e' || second === 'E') {
        return {
          status: 'complete',
          command: { count: count1, operator: null, motion: 'g' + second, linewise: false },
        };
      }

      // Operators: gu / gU / g~ (plus linewise shortcuts guu, gUU, g~~)
      if (second === 'u' || second === 'U' || second === '~') {
        // Double-char shortcut: `guu`, `gUU`, `g~~` → lowercase/uppercase/toggle current line
        if (i + 2 < seq.length && seq[i + 2] === second) {
          return {
            status: 'complete',
            command: {
              count: count1, operator: 'g' + second, motion: null, linewise: true,
            },
          };
        }
        return this.parseAfterOperator(seq, i + 2, count1, 'g' + second);
      }

      return { status: 'invalid' };
    }

    // Single-key actions
    if (ACTIONS.has(seq[i])) {
      return { status: 'action', action: seq[i], count: count1 };
    }

    // Motion-only (no operator)
    if (MOTIONS.has(seq[i])) {
      return {
        status: 'complete',
        command: { count: count1, operator: null, motion: seq[i], linewise: false },
      };
    }

    // Char-seek motion (f, t, F, T)
    if (CHAR_MOTIONS.has(seq[i])) {
      const motionKey = seq[i];
      if (i + 1 >= seq.length) return { status: 'pending' };
      return {
        status: 'complete',
        command: {
          count: count1, operator: null, motion: motionKey,
          charArg: seq[i + 1], linewise: false,
        },
      };
    }

    // Operator
    if (OPERATORS.has(seq[i])) {
      const op = seq[i];

      // Double operator: dd, yy, cc — linewise
      if (i + 1 < seq.length && seq[i + 1] === op) {
        return {
          status: 'complete',
          command: { count: count1, operator: op, motion: null, linewise: true },
        };
      }

      return this.parseAfterOperator(seq, i + 1, count1, op);
    }

    return { status: 'invalid' };
  }

  /**
   * Parse everything that follows an operator (motion, text object, or gg).
   * `startAt` is the index of the first char after the operator.
   */
  private parseAfterOperator(
    seq: string,
    startAt: number,
    count1: number,
    op: string,
  ): ParseResult {
    let i = startAt;
    if (i >= seq.length) return { status: 'pending' };

    // Optional second count
    const secondCount = this.readCount(seq, i);
    i = secondCount.next;
    const totalCount = count1 * secondCount.value;

    if (i >= seq.length) return { status: 'pending' };

    // Text object: i{x} or a{x}
    if (seq[i] === 'i' || seq[i] === 'a') {
      if (i + 1 >= seq.length) return { status: 'pending' };
      const kind = seq[i + 1];
      if (TEXT_OBJECT_CHARS.has(kind)) {
        return {
          status: 'complete',
          command: {
            count: totalCount, operator: op, motion: null,
            textObject: { kind, around: seq[i] === 'a' },
            linewise: false,
          },
        };
      }
      return { status: 'invalid' };
    }

    // gg after operator
    if (seq[i] === 'g') {
      if (i + 1 >= seq.length) return { status: 'pending' };
      const second = seq[i + 1];
      if (second === 'g') {
        return {
          status: 'complete',
          command: { count: totalCount, operator: op, motion: 'gg', linewise: false },
        };
      }
      if (second === 'e' || second === 'E') {
        return {
          status: 'complete',
          command: { count: totalCount, operator: op, motion: 'g' + second, linewise: false },
        };
      }
      return { status: 'invalid' };
    }

    if (MOTIONS.has(seq[i])) {
      return {
        status: 'complete',
        command: { count: totalCount, operator: op, motion: seq[i], linewise: false },
      };
    }

    if (CHAR_MOTIONS.has(seq[i])) {
      const motionKey = seq[i];
      if (i + 1 >= seq.length) return { status: 'pending' };
      return {
        status: 'complete',
        command: {
          count: totalCount, operator: op, motion: motionKey,
          charArg: seq[i + 1], linewise: false,
        },
      };
    }

    return { status: 'invalid' };
  }

  /**
   * Read an optional numeric count starting at `start`. In Vim, `0` is the
   * line-start motion, so a count cannot *begin* with `0` — but may contain
   * `0`s in subsequent positions.
   */
  private readCount(seq: string, start: number): { value: number; next: number } {
    let i = start;
    let str = '';
    while (i < seq.length && seq[i] >= '1' && seq[i] <= '9') {
      str += seq[i]; i++;
    }
    while (str && i < seq.length && seq[i] >= '0' && seq[i] <= '9') {
      str += seq[i]; i++;
    }
    return { value: str ? parseInt(str, 10) : 1, next: i };
  }
}
