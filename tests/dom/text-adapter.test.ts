// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  InputAdapter,
  TextareaAdapter,
  ContentEditableAdapter,
  createTextAdapter,
} from '../../src/dom/text-adapter.js';

// ---------------------------------------------------------------------------
// InputAdapter
// ---------------------------------------------------------------------------

describe('InputAdapter', () => {
  let input: HTMLInputElement;
  let adapter: InputAdapter;

  beforeEach(() => {
    input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    adapter = new InputAdapter(input);
  });

  it('reads and writes text', () => {
    adapter.setText('hello');
    expect(adapter.getText()).toBe('hello');
  });

  it('gets and sets cursor position', () => {
    adapter.setText('abcdef');
    adapter.setCursorPosition(3);
    expect(adapter.getCursorPosition()).toBe(3);
  });

  it('clamps cursor to valid range', () => {
    adapter.setText('abc');
    adapter.setCursorPosition(99);
    expect(adapter.getCursorPosition()).toBe(3);

    adapter.setCursorPosition(-5);
    expect(adapter.getCursorPosition()).toBe(0);
  });

  it('gets and sets selection range', () => {
    adapter.setText('hello world');
    adapter.setSelectionRange(2, 7);
    const range = adapter.getSelectionRange();
    expect(range.start).toBe(2);
    expect(range.end).toBe(7);
  });

  it('clamps selection range', () => {
    adapter.setText('abc');
    adapter.setSelectionRange(-1, 100);
    const range = adapter.getSelectionRange();
    expect(range.start).toBe(0);
    expect(range.end).toBe(3);
  });

  it('always reports line 0 for offsetToLineCol', () => {
    adapter.setText('hello');
    expect(adapter.offsetToLineCol(3)).toEqual({ line: 0, column: 3 });
  });

  it('reports 1 line', () => {
    adapter.setText('anything');
    expect(adapter.getLineCount()).toBe(1);
  });

  it('returns full text for getLine', () => {
    adapter.setText('full line');
    expect(adapter.getLine(0)).toBe('full line');
  });

  it('dispatches input and change events on setText', () => {
    let inputFired = false;
    let changeFired = false;
    input.addEventListener('input', () => { inputFired = true; });
    input.addEventListener('change', () => { changeFired = true; });

    adapter.setText('new value');
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TextareaAdapter
// ---------------------------------------------------------------------------

describe('TextareaAdapter', () => {
  let textarea: HTMLTextAreaElement;
  let adapter: TextareaAdapter;

  beforeEach(() => {
    textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    adapter = new TextareaAdapter(textarea);
  });

  it('reads and writes multi-line text', () => {
    adapter.setText('line1\nline2\nline3');
    expect(adapter.getText()).toBe('line1\nline2\nline3');
  });

  it('gets and sets cursor position', () => {
    adapter.setText('hello\nworld');
    adapter.setCursorPosition(7);
    expect(adapter.getCursorPosition()).toBe(7);
  });

  it('converts offset to line/col', () => {
    adapter.setText('abc\ndef\nghi');
    // offset 0 -> line 0, col 0
    expect(adapter.offsetToLineCol(0)).toEqual({ line: 0, column: 0 });
    // offset 3 -> line 0, col 3 (the newline position)
    expect(adapter.offsetToLineCol(3)).toEqual({ line: 0, column: 3 });
    // offset 4 -> line 1, col 0
    expect(adapter.offsetToLineCol(4)).toEqual({ line: 1, column: 0 });
    // offset 7 -> line 1, col 3
    expect(adapter.offsetToLineCol(7)).toEqual({ line: 1, column: 3 });
    // offset 8 -> line 2, col 0
    expect(adapter.offsetToLineCol(8)).toEqual({ line: 2, column: 0 });
    // offset 10 -> line 2, col 2
    expect(adapter.offsetToLineCol(10)).toEqual({ line: 2, column: 2 });
  });

  it('converts line/col back to offset', () => {
    adapter.setText('abc\ndef\nghi');
    expect(adapter.lineColToOffset(0, 0)).toBe(0);
    expect(adapter.lineColToOffset(0, 3)).toBe(3);
    expect(adapter.lineColToOffset(1, 0)).toBe(4);
    expect(adapter.lineColToOffset(1, 2)).toBe(6);
    expect(adapter.lineColToOffset(2, 0)).toBe(8);
    expect(adapter.lineColToOffset(2, 3)).toBe(11);
  });

  it('clamps line/col to valid range', () => {
    adapter.setText('ab\ncd');
    // Line beyond range
    expect(adapter.lineColToOffset(99, 0)).toBe(3); // start of last line
    // Column beyond range
    expect(adapter.lineColToOffset(0, 99)).toBe(2); // end of first line
  });

  it('reports correct line count', () => {
    adapter.setText('a\nb\nc');
    expect(adapter.getLineCount()).toBe(3);
  });

  it('returns specific line content', () => {
    adapter.setText('first\nsecond\nthird');
    expect(adapter.getLine(0)).toBe('first');
    expect(adapter.getLine(1)).toBe('second');
    expect(adapter.getLine(2)).toBe('third');
  });

  it('handles empty text', () => {
    adapter.setText('');
    expect(adapter.getLineCount()).toBe(1);
    expect(adapter.getLine(0)).toBe('');
    expect(adapter.offsetToLineCol(0)).toEqual({ line: 0, column: 0 });
  });

  it('handles trailing newline', () => {
    adapter.setText('abc\n');
    expect(adapter.getLineCount()).toBe(2);
    expect(adapter.getLine(1)).toBe('');
    expect(adapter.offsetToLineCol(4)).toEqual({ line: 1, column: 0 });
  });

  it('dispatches input and change events on setText', () => {
    let inputFired = false;
    let changeFired = false;
    textarea.addEventListener('input', () => { inputFired = true; });
    textarea.addEventListener('change', () => { changeFired = true; });

    adapter.setText('new value');
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ContentEditableAdapter
// ---------------------------------------------------------------------------

describe('ContentEditableAdapter', () => {
  let div: HTMLDivElement;
  let adapter: ContentEditableAdapter;

  beforeEach(() => {
    div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    adapter = new ContentEditableAdapter(div);
  });

  it('reads and writes text', () => {
    adapter.setText('hello');
    expect(adapter.getText()).toBe('hello');
  });

  it('handles multi-line content', () => {
    adapter.setText('line1\nline2');
    expect(adapter.getLineCount()).toBe(2);
    expect(adapter.getLine(0)).toBe('line1');
    expect(adapter.getLine(1)).toBe('line2');
  });

  it('converts offset to line/col', () => {
    adapter.setText('ab\ncd');
    expect(adapter.offsetToLineCol(0)).toEqual({ line: 0, column: 0 });
    expect(adapter.offsetToLineCol(2)).toEqual({ line: 0, column: 2 });
    expect(adapter.offsetToLineCol(3)).toEqual({ line: 1, column: 0 });
    expect(adapter.offsetToLineCol(5)).toEqual({ line: 1, column: 2 });
  });

  it('converts line/col to offset', () => {
    adapter.setText('ab\ncd');
    expect(adapter.lineColToOffset(0, 0)).toBe(0);
    expect(adapter.lineColToOffset(0, 2)).toBe(2);
    expect(adapter.lineColToOffset(1, 0)).toBe(3);
    expect(adapter.lineColToOffset(1, 2)).toBe(5);
  });

  it('dispatches input and change events on setText', () => {
    let inputFired = false;
    let changeFired = false;
    div.addEventListener('input', () => { inputFired = true; });
    div.addEventListener('change', () => { changeFired = true; });

    adapter.setText('new value');
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Shift+Enter in real-world rich text editors produces either a <br> in the
  // current block or a split into two block-level siblings. Both MUST be
  // visible as a '\n' in getText() with cursor offsets on either side aligned
  // to that newline, so j/k motions can jump between lines.
  // ---------------------------------------------------------------------------

  const setSelection = (node: Node, offset: number): void => {
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    sel!.removeAllRanges();
    sel!.addRange(range);
  };

  it('treats <br> between text nodes as a newline', () => {
    // Matches what Chrome's plaintext contenteditable does on Shift+Enter.
    div.innerHTML = 'hello<br>world';
    expect(adapter.getText()).toBe('hello\nworld');
    expect(adapter.getLineCount()).toBe(2);
    expect(adapter.getLine(0)).toBe('hello');
    expect(adapter.getLine(1)).toBe('world');
  });

  it('reports cursor offset past <br> including the implicit newline', () => {
    div.innerHTML = 'hello<br>world';
    const worldText = div.childNodes[2] as Text;
    // Cursor in the middle of "world" (after 'w', before 'o')
    setSelection(worldText, 1);
    // innerText is "hello\nworld"; offset 7 lands between 'w' and 'o'.
    expect(adapter.getCursorPosition()).toBe(7);
  });

  it('places the cursor on line 2 when setCursorPosition targets past a <br>', () => {
    div.innerHTML = 'hello<br>world';
    adapter.setCursorPosition(6); // start of "world"
    const sel = window.getSelection()!;
    expect(sel.rangeCount).toBe(1);
    const r = sel.getRangeAt(0);
    expect(r.startContainer).toBe(div.childNodes[2]); // "world" text node
    expect(r.startOffset).toBe(0);
  });

  it('treats sibling block elements (like ProseMirror <p>) as newline-separated', () => {
    // This is what Claude/Gemini produce for Shift+Enter: split paragraphs.
    div.innerHTML = '<p>line one</p><p>line two</p>';
    expect(adapter.getText()).toBe('line one\nline two');
    expect(adapter.getLineCount()).toBe(2);
  });

  it('roundtrips cursor position through the synthetic newline in <p><p>', () => {
    div.innerHTML = '<p>line one</p><p>line two</p>';
    const secondP = div.children[1] as HTMLElement;
    const secondText = secondP.firstChild as Text;
    // Cursor at start of second paragraph
    setSelection(secondText, 0);
    // "line one" is 8 chars, then the synthetic '\n' → offset 9 is start of "line two"
    expect(adapter.getCursorPosition()).toBe(9);

    // And setting the cursor back to 9 should land us at the start of "line two"
    adapter.setCursorPosition(9);
    const sel = window.getSelection()!;
    const r = sel.getRangeAt(0);
    expect(r.startContainer).toBe(secondText);
    expect(r.startOffset).toBe(0);
  });

  it('does not lose line alignment when the paragraph also has <br> within it', () => {
    div.innerHTML = '<p>ab<br>cd</p><p>ef</p>';
    expect(adapter.getText()).toBe('ab\ncd\nef');
    // "ab" = 2 chars, "\n" = 1, "cd" = 2 chars, "\n" = 1, "ef" at offset 6
    adapter.setCursorPosition(6);
    const r = window.getSelection()!.getRangeAt(0);
    expect(r.startContainer).toBe((div.children[1] as HTMLElement).firstChild);
    expect(r.startOffset).toBe(0);
  });

  it('offsetToLineCol sees the newlines created by <br>', () => {
    div.innerHTML = 'hello<br>world';
    expect(adapter.offsetToLineCol(0)).toEqual({ line: 0, column: 0 });
    expect(adapter.offsetToLineCol(5)).toEqual({ line: 0, column: 5 });
    expect(adapter.offsetToLineCol(6)).toEqual({ line: 1, column: 0 });
    expect(adapter.offsetToLineCol(10)).toEqual({ line: 1, column: 4 });
  });
});

// ---------------------------------------------------------------------------
// createTextAdapter factory
// ---------------------------------------------------------------------------

describe('createTextAdapter', () => {
  it('returns InputAdapter for text input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    const adapter = createTextAdapter(input);
    expect(adapter).toBeInstanceOf(InputAdapter);
  });

  it('returns InputAdapter for search input', () => {
    const input = document.createElement('input');
    input.type = 'search';
    const adapter = createTextAdapter(input);
    expect(adapter).toBeInstanceOf(InputAdapter);
  });

  it('returns null for checkbox input', () => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    const adapter = createTextAdapter(input);
    expect(adapter).toBeNull();
  });

  it('returns TextareaAdapter for textarea', () => {
    const textarea = document.createElement('textarea');
    const adapter = createTextAdapter(textarea);
    expect(adapter).toBeInstanceOf(TextareaAdapter);
  });

  it('returns ContentEditableAdapter for contenteditable div', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    const adapter = createTextAdapter(div);
    expect(adapter).toBeInstanceOf(ContentEditableAdapter);
  });

  it('returns null for non-editable div', () => {
    const div = document.createElement('div');
    const adapter = createTextAdapter(div);
    expect(adapter).toBeNull();
  });

  it('returns InputAdapter for email input', () => {
    const input = document.createElement('input');
    input.type = 'email';
    const adapter = createTextAdapter(input);
    expect(adapter).toBeInstanceOf(InputAdapter);
  });

  it('returns InputAdapter for url input', () => {
    const input = document.createElement('input');
    input.type = 'url';
    const adapter = createTextAdapter(input);
    expect(adapter).toBeInstanceOf(InputAdapter);
  });

  it('returns InputAdapter for password input', () => {
    const input = document.createElement('input');
    input.type = 'password';
    const adapter = createTextAdapter(input);
    expect(adapter).toBeInstanceOf(InputAdapter);
  });

  it('returns null for number input', () => {
    const input = document.createElement('input');
    input.type = 'number';
    const adapter = createTextAdapter(input);
    expect(adapter).toBeNull();
  });
});
