// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  InputAdapter,
  TextareaAdapter,
  ContentEditableAdapter,
  createTextAdapter,
  applyMonospaceFont,
  restoreFont,
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

  // ---------------------------------------------------------------------------
  // insertLineBreak — used by the `o` / `O` commands. Must work without
  // destroying the editor's DOM or losing the newline under any pipeline.
  // ---------------------------------------------------------------------------

  it('insertLineBreak on a plain contenteditable appends a <br> at the position', () => {
    adapter.setText('hello');
    const after = adapter.insertLineBreak(5);
    expect(adapter.getText()).toBe('hello\n');
    expect(after).toBe(6);
  });

  it('insertLineBreak mid-line opens a new line, cursor on the blank line (o semantic)', () => {
    // Simulate: text = "abc\ndef", cursor somewhere in "abc".
    // `o` will call insertLineBreak(lineEnd=3) and setCursorPosition(after).
    adapter.setText('abc\ndef');
    const after = adapter.insertLineBreak(3); // end of line 1
    expect(adapter.getText()).toBe('abc\n\ndef');
    expect(after).toBe(4);
  });

  it('insertLineBreak at line start opens a new line above (O semantic)', () => {
    // Text = "abc\ndef", cursor mid-line in "def" (lineStart = 4).
    adapter.setText('abc\ndef');
    adapter.insertLineBreak(4);
    expect(adapter.getText()).toBe('abc\n\ndef');
  });

  it('insertLineBreak preserves j/k compatibility — lineDown lands on the new blank line', async () => {
    const { lineDown } = await import('../../src/vim/motions.js');
    adapter.setText('abc\ndef');
    const after = adapter.insertLineBreak(3); // o from line 1
    const text = adapter.getText();
    // Cursor on the blank line (after). k should go back to 'a' (col 0, line 0),
    // but what we really want to assert is that lineDown from the blank line
    // reaches "def" and lineUp from "def" reaches the blank line.
    expect(lineDown(text, after)).toBe(5); // "def" line, col 0 clamped
  });
});

// ---------------------------------------------------------------------------
// Walker hardening — U+2028 / U+2029 in text nodes, trailing-break marker.
// These exercise the patterns that rich editors (ProseMirror, Lexical) emit
// in the wild and that our walker previously ignored.
// ---------------------------------------------------------------------------

describe('ContentEditableAdapter — walker hardening', () => {
  let div: HTMLDivElement;
  let adapter: ContentEditableAdapter;

  beforeEach(() => {
    div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    adapter = new ContentEditableAdapter(div);
  });

  it('treats U+2028 (LINE SEPARATOR) inside a text node as \\n', () => {
    const t = document.createTextNode('abc\u2028def');
    div.appendChild(t);
    expect(adapter.getText()).toBe('abc\ndef');
    expect(adapter.getLineCount()).toBe(2);
  });

  it('treats U+2029 (PARAGRAPH SEPARATOR) inside a text node as \\n', () => {
    const t = document.createTextNode('abc\u2029def');
    div.appendChild(t);
    expect(adapter.getText()).toBe('abc\ndef');
    expect(adapter.getLineCount()).toBe(2);
  });

  it('skips <br class="ProseMirror-trailingBreak"> when counting lines', () => {
    // Empty ProseMirror paragraphs render with a trailing-break marker purely
    // for layout. It is not a user-visible newline.
    div.innerHTML = '<p>hello<br class="ProseMirror-trailingBreak"></p>';
    expect(adapter.getText()).toBe('hello');
    expect(adapter.getLineCount()).toBe(1);
  });

  it('skips trailing-break marker even in combination with real <br>', () => {
    div.innerHTML = '<p>hello<br>world<br class="ProseMirror-trailingBreak"></p>';
    expect(adapter.getText()).toBe('hello\nworld');
    expect(adapter.getLineCount()).toBe(2);
  });

  it('also skips data-trailing-break attribute variant', () => {
    div.innerHTML = '<p>hello<br data-trailing-break=""></p>';
    expect(adapter.getText()).toBe('hello');
  });

  it('still treats a regular <br> at the end of a paragraph as a newline', () => {
    div.innerHTML = '<p>hello<br></p>';
    expect(adapter.getText()).toBe('hello\n');
  });

  // -------------------------------------------------------------------------
  // Tiptap / ProseMirror empty-paragraph pattern: after Shift+Enter the DOM
  // is `<p>the</p><p class="is-empty"><br class="ProseMirror-trailingBreak"/></p>`.
  // The user sees two lines. `getText()` must surface the trailing '\n' so
  // getLineCount, j/k, and the block cursor all agree.
  // -------------------------------------------------------------------------

  it('reports trailing \\n for Tiptap empty paragraph with trailing-break marker', () => {
    div.innerHTML = '<p>the</p><p class="is-empty"><br class="ProseMirror-trailingBreak"></p>';
    expect(adapter.getText()).toBe('the\n');
    expect(adapter.getLineCount()).toBe(2);
    expect(adapter.getLine(0)).toBe('the');
    expect(adapter.getLine(1)).toBe('');
  });

  it('consecutive empty paragraphs add one newline each', () => {
    // <p>a</p><p></p><p>b</p> — three user-visible lines ("a", "", "b").
    div.innerHTML = '<p>a</p><p><br class="ProseMirror-trailingBreak"></p><p>b</p>';
    expect(adapter.getText()).toBe('a\n\nb');
    expect(adapter.getLineCount()).toBe(3);
  });

  it('does not add a phantom trailing newline to a single-paragraph buffer', () => {
    div.innerHTML = '<p>only line</p>';
    expect(adapter.getText()).toBe('only line');
    expect(adapter.getLineCount()).toBe(1);
  });

  it('cursor lands on the Tiptap blank line (reproduces the original bug)', () => {
    // Exact DOM from Claude's Tiptap chat box after typing "the" then
    // Shift+Enter. Selection is at (emptyParagraph, 0).
    div.innerHTML = '<p>the</p><p class="is-empty"><br class="ProseMirror-trailingBreak"></p>';
    const emptyP = div.children[1] as HTMLElement;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(emptyP, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    // text is "the\n"; cursor is at position 4 — the start of the blank
    // second line, NOT past the end of a phantom 3-line buffer.
    expect(adapter.getText()).toBe('the\n');
    expect(adapter.getCursorPosition()).toBe(4);
    expect(adapter.offsetToLineCol(4)).toEqual({ line: 1, column: 0 });
  });

  it('j from line 1 reaches the Tiptap blank line at line 2', async () => {
    const { lineDown } = await import('../../src/vim/motions.js');
    div.innerHTML = '<p>the</p><p class="is-empty"><br class="ProseMirror-trailingBreak"></p>';
    const text = adapter.getText();
    // From offset 0 (col 0 of line 1), j → col 0 of line 2 (the blank line).
    expect(lineDown(text, 0)).toBe(4);
  });

  it('setCursorPosition(4) lands INSIDE the empty Tiptap paragraph', () => {
    // Without empty-block anchors, offset 4 collapses to end-of-"the" and
    // the browser caret stays on line 1. The anchor pins the cursor inside
    // the empty <p> so Chrome renders the caret on line 2.
    div.innerHTML = '<p>the</p><p class="is-empty"><br class="ProseMirror-trailingBreak"></p>';
    const emptyP = div.children[1] as HTMLElement;
    adapter.setCursorPosition(4);
    const r = window.getSelection()!.getRangeAt(0);
    expect(r.startContainer).toBe(emptyP);
    expect(r.startOffset).toBe(0);
  });

  it('round-trips the cursor between text and blank-line anchor', () => {
    div.innerHTML = '<p>the</p><p class="is-empty"><br class="ProseMirror-trailingBreak"></p>';
    adapter.setCursorPosition(4);
    expect(adapter.getCursorPosition()).toBe(4);
    adapter.setCursorPosition(2);
    expect(adapter.getCursorPosition()).toBe(2);
  });

  it('anchors also pin middle blank lines (<p>a</p><p></p><p>b</p>)', () => {
    div.innerHTML = '<p>a</p><p class="is-empty"><br class="ProseMirror-trailingBreak"></p><p>b</p>';
    expect(adapter.getText()).toBe('a\n\nb');
    const middleP = div.children[1] as HTMLElement;
    adapter.setCursorPosition(2); // offset of the middle blank line
    const r = window.getSelection()!.getRangeAt(0);
    expect(r.startContainer).toBe(middleP);
    expect(r.startOffset).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Framework-specific sentinels beyond ProseMirror.
  // -------------------------------------------------------------------------

  it('skips Slate zero-width trailing break (<br data-slate-zero-width="z">)', () => {
    // Slate marks an empty-block terminator with this attribute. Like the
    // ProseMirror trailing-break marker, it's structural and not a newline.
    div.innerHTML = '<div>hello<br data-slate-zero-width="z"></div>';
    expect(adapter.getText()).toBe('hello');
    expect(adapter.getLineCount()).toBe(1);
  });

  it('treats Lexical <br data-lexical-linebreak> as a real newline', () => {
    // Lexical emits this attribute on the <br> produced by Shift+Enter.
    // It IS a user-visible break, so the walker must count it.
    div.innerHTML = '<p>hello<br data-lexical-linebreak="true">world</p>';
    expect(adapter.getText()).toBe('hello\nworld');
    expect(adapter.getLineCount()).toBe(2);
  });

  it('does not insert a phantom newline for inline contenteditable=false widgets', () => {
    // Chat UIs render @mentions and file chips as inline spans with
    // contenteditable="false". They would otherwise look like block boundaries
    // to our walker if their display styling was block-ish.
    div.innerHTML = 'Hi <span contenteditable="false" data-mention="alice">@alice</span> there';
    // Whether the chip's textContent appears in getText depends on styling,
    // but the critical invariant is that no extra \n appears around it.
    expect(adapter.getText()).not.toContain('\n');
  });
});

// ---------------------------------------------------------------------------
// deleteBlockAtCursor — the linewise-dd primitive used by chat editors where
// the text-diff path is ambiguous across consecutive blank lines.
// ---------------------------------------------------------------------------

describe('ContentEditableAdapter — deleteBlockAtCursor', () => {
  let div: HTMLDivElement;
  let adapter: ContentEditableAdapter;

  beforeEach(() => {
    div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    adapter = new ContentEditableAdapter(div);
  });

  const placeCaret = (node: Node, offset: number): void => {
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  it('removes exactly one empty <p> out of several without touching siblings', () => {
    // ProseMirror shape: four paragraphs where the middle two are empty.
    // Buffer is "a\n\n\nb" — text + block-boundary + empty + block-boundary +
    // empty + block-boundary + text. Cursor on the second empty paragraph.
    div.innerHTML =
      '<p>a</p>' +
      '<p class="is-empty"><br class="ProseMirror-trailingBreak"></p>' +
      '<p class="is-empty"><br class="ProseMirror-trailingBreak"></p>' +
      '<p>b</p>';
    expect(adapter.getText()).toBe('a\n\n\nb');

    const targetEmptyP = div.children[2] as HTMLElement;
    placeCaret(targetEmptyP, 0);

    const ok = adapter.deleteBlockAtCursor();
    expect(ok).toBe(true);
    // Exactly three blocks remain.
    expect(div.children.length).toBe(3);
    // One blank paragraph gone: was "a\n\n\nb", now "a\n\nb".
    expect(adapter.getText()).toBe('a\n\nb');
  });

  it('removes the cursor\'s own <p> when there is regular content in it', () => {
    div.innerHTML = '<p>alpha</p><p>beta</p><p>gamma</p>';
    const betaP = div.children[1] as HTMLElement;
    placeCaret(betaP.firstChild!, 2);

    expect(adapter.deleteBlockAtCursor()).toBe(true);
    expect(div.children.length).toBe(2);
    expect(adapter.getText()).toBe('alpha\ngamma');
  });

  it('refuses when only one block exists — caller falls back to text diff', () => {
    div.innerHTML = '<p>only</p>';
    placeCaret(div.children[0].firstChild!, 1);
    expect(adapter.deleteBlockAtCursor()).toBe(false);
    expect(div.children.length).toBe(1);
  });

  it('refuses when the editor has no block structure (flat <br> separators)', () => {
    // Manually flattened plain-contenteditable content: no <p>, just text
    // and <br>s. There is no block ancestor to target, so the primitive
    // declines and the caller uses the offset-diff path.
    div.innerHTML = 'hello<br>world';
    placeCaret(div.firstChild!, 2);
    expect(adapter.deleteBlockAtCursor()).toBe(false);
  });

  it('places the caret at the start of the surviving previous sibling', () => {
    div.innerHTML = '<p>one</p><p>two</p><p>three</p>';
    const twoP = div.children[1] as HTMLElement;
    placeCaret(twoP.firstChild!, 1);

    adapter.deleteBlockAtCursor();

    // Cursor should be at offset 0 of "one" (the previous sibling) —
    // getCursorPosition returns the flat offset in the new text ("one\nthree").
    expect(adapter.getCursorPosition()).toBe(0);
  });

  it('falls back to the next sibling when cursor was in the first block', () => {
    div.innerHTML = '<p>first</p><p>second</p>';
    const firstP = div.children[0] as HTMLElement;
    placeCaret(firstP.firstChild!, 3);

    adapter.deleteBlockAtCursor();

    expect(adapter.getText()).toBe('second');
    // Caret now at start of the surviving "second" paragraph.
    expect(adapter.getCursorPosition()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// setText — destructive-rebuild guard. On a focused framework editor the
// rebuild path would replace the editor's <p> structure with a flat <br> soup.
// ---------------------------------------------------------------------------

describe('ContentEditableAdapter — setText focused-editor guard', () => {
  let div: HTMLDivElement;
  let adapter: ContentEditableAdapter;

  beforeEach(() => {
    div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    adapter = new ContentEditableAdapter(div);
  });

  it('does not tear down <p> structure when the diff path fails on a focused editor', () => {
    // Simulate a framework editor: the DOM is <p>-structured, the element
    // is focused, and there is a selection anchored inside it. We then call
    // setText with a value the diff path cannot achieve (jsdom's execCommand
    // is a no-op, so applyTextViaDiff returns false). The old behaviour
    // wiped the <p>s; the new behaviour leaves them.
    div.setAttribute('tabindex', '0');
    div.innerHTML = '<p>keep me</p><p>and me</p>';
    div.focus();
    const firstText = (div.children[0] as HTMLElement).firstChild!;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(firstText, 2);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    const pCountBefore = div.querySelectorAll('p').length;

    adapter.setText('totally different content');

    const pCountAfter = div.querySelectorAll('p').length;
    expect(pCountAfter).toBe(pCountBefore);
    // Inner markup should not have been reduced to bare text + <br>s.
    expect(div.querySelector('br')).toBeNull();
  });

  it('still rebuilds when the element is not focused (jsdom init path)', () => {
    // With no focus we have no framework editor to protect — the rebuild
    // path is the only way to put text into a plain contenteditable.
    div.innerHTML = '<p>old</p>';
    // Ensure not focused
    (document.activeElement as HTMLElement | null)?.blur();

    adapter.setText('line1\nline2');

    expect(adapter.getText()).toBe('line1\nline2');
  });
});

// ---------------------------------------------------------------------------
// TextareaAdapter.insertLineBreak
// ---------------------------------------------------------------------------

describe('TextareaAdapter — insertLineBreak', () => {
  let textarea: HTMLTextAreaElement;
  let adapter: TextareaAdapter;

  beforeEach(() => {
    textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    adapter = new TextareaAdapter(textarea);
  });

  it('inserts \\n at the position and returns position + 1', () => {
    adapter.setText('abcdef');
    const after = adapter.insertLineBreak(3);
    expect(adapter.getText()).toBe('abc\ndef');
    expect(after).toBe(4);
    expect(adapter.getCursorPosition()).toBe(4);
  });

  it('inserts at start of buffer', () => {
    adapter.setText('hello');
    const after = adapter.insertLineBreak(0);
    expect(adapter.getText()).toBe('\nhello');
    expect(after).toBe(1);
  });

  it('inserts at end of buffer', () => {
    adapter.setText('hello');
    const after = adapter.insertLineBreak(5);
    expect(adapter.getText()).toBe('hello\n');
    expect(after).toBe(6);
  });

  it('clamps past-end position to the end of the buffer', () => {
    adapter.setText('abc');
    const after = adapter.insertLineBreak(99);
    expect(adapter.getText()).toBe('abc\n');
    expect(after).toBe(4);
  });

  it('fires input/change events so React/Vue controlled textareas stay in sync', () => {
    let inputFired = false;
    let changeFired = false;
    textarea.addEventListener('input', () => { inputFired = true; });
    textarea.addEventListener('change', () => { changeFired = true; });

    adapter.setText('abc');
    inputFired = false;
    changeFired = false;
    adapter.insertLineBreak(1);
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
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

// ---------------------------------------------------------------------------
// Monospace font override
// ---------------------------------------------------------------------------

describe('applyMonospaceFont / restoreFont', () => {
  it('sets font-family with !important and restores empty on clean element', () => {
    const el = document.createElement('textarea');
    document.body.appendChild(el);

    applyMonospaceFont(el);
    expect(el.style.getPropertyValue('font-family')).toContain('JetBrains Mono');
    expect(el.style.getPropertyPriority('font-family')).toBe('important');
    expect(el.style.getPropertyValue('font-variant-ligatures')).toBe('none');
    expect(el.style.getPropertyValue('font-feature-settings')).toBe('normal');

    restoreFont(el);
    expect(el.style.getPropertyValue('font-family')).toBe('');
    expect(el.style.getPropertyValue('font-variant-ligatures')).toBe('');
    expect(el.style.getPropertyValue('font-feature-settings')).toBe('');
  });

  it('preserves existing inline font styles across apply/restore', () => {
    const el = document.createElement('textarea');
    el.style.setProperty('font-family', 'Georgia, serif', 'important');
    el.style.setProperty('font-variant-ligatures', 'common-ligatures', '');
    document.body.appendChild(el);

    applyMonospaceFont(el);
    expect(el.style.getPropertyValue('font-family')).toContain('JetBrains Mono');
    expect(el.style.getPropertyPriority('font-family')).toBe('important');

    restoreFont(el);
    expect(el.style.getPropertyValue('font-family')).toBe('Georgia, serif');
    expect(el.style.getPropertyPriority('font-family')).toBe('important');
    expect(el.style.getPropertyValue('font-variant-ligatures')).toBe('common-ligatures');
    expect(el.style.getPropertyPriority('font-variant-ligatures')).toBe('');
  });

  it('is idempotent: second apply does not overwrite the stashed original', () => {
    const el = document.createElement('textarea');
    el.style.setProperty('font-family', 'Helvetica', '');
    document.body.appendChild(el);

    applyMonospaceFont(el);
    applyMonospaceFont(el);
    restoreFont(el);

    expect(el.style.getPropertyValue('font-family')).toBe('Helvetica');
  });

  it('restoreFont is a no-op when apply was never called', () => {
    const el = document.createElement('textarea');
    el.style.setProperty('font-family', 'Helvetica', '');
    document.body.appendChild(el);

    restoreFont(el);
    expect(el.style.getPropertyValue('font-family')).toBe('Helvetica');
  });
});
