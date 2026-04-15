import { Command } from './types.js';

/** Result of feeding a key to the parser */
export type ParseResult =
  | { status: 'pending' }
  | { status: 'complete'; command: Command }
  | { status: 'invalid' }
  | { status: 'action'; action: string; count: number; charArg?: string };

const OPERATORS = new Set(['d', 'c', 'y']);
const MOTIONS = new Set(['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', 'G']);
const CHAR_MOTIONS = new Set(['f', 't']);
const ACTIONS = new Set([
  'i', 'a', 'I', 'A', 'o', 'O',   // insert entry points
  'p', 'P',                         // paste
  'x',                               // delete char
  'J',                               // join lines
  'u',                               // undo
  'v', 'V',                          // visual mode
]);

/**
 * Buffers incoming keystrokes and parses them into Vim commands.
 *
 * Supports the grammar: [count][operator][count][motion]
 * And single-key actions like i, a, o, x, p, etc.
 */
export class CommandParser {
  private buffer: string[] = [];

  /**
   * Feed a key into the parser. Returns the parse result.
   */
  feed(key: string): ParseResult {
    this.buffer.push(key);

    const seq = this.buffer.join('');
    const result = this.tryParse(seq);

    if (result.status !== 'pending') {
      this.buffer = [];
    }

    return result;
  }

  /** Reset the parser state */
  reset(): void {
    this.buffer = [];
  }

  /** Get the current buffer contents */
  getBuffer(): string {
    return this.buffer.join('');
  }

  private tryParse(seq: string): ParseResult {
    let i = 0;

    // Parse optional leading count
    let countStr = '';
    while (i < seq.length && seq[i] >= '1' && seq[i] <= '9') {
      countStr += seq[i];
      i++;
    }
    // Allow '0' only in subsequent digits
    while (i < seq.length && seq[i] >= '0' && seq[i] <= '9') {
      countStr += seq[i];
      i++;
    }
    const count1 = countStr ? parseInt(countStr, 10) : 1;

    if (i >= seq.length) return { status: 'pending' };

    // Check for Ctrl-r (redo)
    if (seq[i] === '\x12') {
      return {
        status: 'action',
        action: 'ctrl-r',
        count: count1,
      };
    }

    // Check for Escape / Ctrl-C
    if (seq[i] === '\x1b' || seq[i] === '\x03') {
      return {
        status: 'action',
        action: 'escape',
        count: 1,
      };
    }

    // Check for 'r' (replace char) — needs one more char
    if (seq[i] === 'r') {
      if (i + 1 >= seq.length) return { status: 'pending' };
      return {
        status: 'action',
        action: 'r',
        count: count1,
        charArg: seq[i + 1],
      };
    }

    // Check for 'g' prefix (gg)
    if (seq[i] === 'g') {
      if (i + 1 >= seq.length) return { status: 'pending' };
      if (seq[i + 1] === 'g') {
        // gg as a motion
        return {
          status: 'complete',
          command: { count: count1, operator: null, motion: 'gg', linewise: false },
        };
      }
      return { status: 'invalid' };
    }

    // Single-key actions
    if (ACTIONS.has(seq[i])) {
      return {
        status: 'action',
        action: seq[i],
        count: count1,
      };
    }

    // Motion-only (no operator)
    if (MOTIONS.has(seq[i])) {
      return {
        status: 'complete',
        command: { count: count1, operator: null, motion: seq[i], linewise: false },
      };
    }

    // Char-seek motion (f, t)
    if (CHAR_MOTIONS.has(seq[i])) {
      const motionKey = seq[i];
      if (i + 1 >= seq.length) return { status: 'pending' };
      return {
        status: 'complete',
        command: {
          count: count1,
          operator: null,
          motion: motionKey,
          charArg: seq[i + 1],
          linewise: false,
        },
      };
    }

    // Operator
    if (OPERATORS.has(seq[i])) {
      const op = seq[i];
      i++;
      if (i >= seq.length) return { status: 'pending' };

      // Double operator: dd, yy, cc — linewise
      if (seq[i] === op) {
        return {
          status: 'complete',
          command: { count: count1, operator: op, motion: null, linewise: true },
        };
      }

      // Parse optional second count
      let countStr2 = '';
      while (i < seq.length && seq[i] >= '1' && seq[i] <= '9') {
        countStr2 += seq[i];
        i++;
      }
      while (i < seq.length && seq[i] >= '0' && seq[i] <= '9') {
        countStr2 += seq[i];
        i++;
      }
      const count2 = countStr2 ? parseInt(countStr2, 10) : 1;
      const totalCount = count1 * count2;

      if (i >= seq.length) return { status: 'pending' };

      // Check for gg motion after operator
      if (seq[i] === 'g') {
        if (i + 1 >= seq.length) return { status: 'pending' };
        if (seq[i + 1] === 'g') {
          return {
            status: 'complete',
            command: { count: totalCount, operator: op, motion: 'gg', linewise: false },
          };
        }
        return { status: 'invalid' };
      }

      if (MOTIONS.has(seq[i])) {
        return {
          status: 'complete',
          command: {
            count: totalCount,
            operator: op,
            motion: seq[i],
            linewise: false,
          },
        };
      }

      if (CHAR_MOTIONS.has(seq[i])) {
        const motionKey = seq[i];
        if (i + 1 >= seq.length) return { status: 'pending' };
        return {
          status: 'complete',
          command: {
            count: totalCount,
            operator: op,
            motion: motionKey,
            charArg: seq[i + 1],
            linewise: false,
          },
        };
      }

      return { status: 'invalid' };
    }

    return { status: 'invalid' };
  }
}
