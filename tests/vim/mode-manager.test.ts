import { describe, it, expect, beforeEach } from 'vitest';
import { ModeManager } from '../../src/vim/mode-manager.js';
import { VimMode } from '../../src/vim/types.js';

describe('ModeManager', () => {
  let mm: ModeManager;

  beforeEach(() => {
    mm = new ModeManager();
  });

  it('starts in normal mode', () => {
    expect(mm.mode).toBe(VimMode.Normal);
  });

  it('transitions to insert mode', () => {
    mm.enterInsert();
    expect(mm.mode).toBe(VimMode.Insert);
  });

  it('transitions to visual mode', () => {
    mm.enterVisual();
    expect(mm.mode).toBe(VimMode.Visual);
  });

  it('transitions to visual-line mode', () => {
    mm.enterVisualLine();
    expect(mm.mode).toBe(VimMode.VisualLine);
  });

  it('transitions back to normal from insert', () => {
    mm.enterInsert();
    mm.enterNormal();
    expect(mm.mode).toBe(VimMode.Normal);
  });

  it('fires mode change callback with from/to', () => {
    const events: Array<{ from: VimMode; to: VimMode }> = [];
    mm.onModeChange((e) => events.push(e));

    mm.enterInsert();
    mm.enterNormal();
    mm.enterVisual();

    expect(events).toEqual([
      { from: VimMode.Normal, to: VimMode.Insert },
      { from: VimMode.Insert, to: VimMode.Normal },
      { from: VimMode.Normal, to: VimMode.Visual },
    ]);
  });

  it('does not fire callback when mode is the same', () => {
    let callCount = 0;
    mm.onModeChange(() => callCount++);

    mm.enterNormal(); // already normal
    expect(callCount).toBe(0);
  });

  it('unsubscribes callback', () => {
    let callCount = 0;
    const unsub = mm.onModeChange(() => callCount++);

    mm.enterInsert();
    expect(callCount).toBe(1);

    unsub();
    mm.enterNormal();
    expect(callCount).toBe(1);
  });

  it('supports multiple listeners', () => {
    let a = 0;
    let b = 0;
    mm.onModeChange(() => a++);
    mm.onModeChange(() => b++);

    mm.enterInsert();
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('transitions from visual to insert', () => {
    mm.enterVisual();
    mm.enterInsert();
    expect(mm.mode).toBe(VimMode.Insert);
  });

  it('transitions from visual-line to normal', () => {
    mm.enterVisualLine();
    mm.enterNormal();
    expect(mm.mode).toBe(VimMode.Normal);
  });
});
