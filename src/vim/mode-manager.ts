import { VimMode, ModeChangeEvent } from './types.js';

export type ModeChangeCallback = (event: ModeChangeEvent) => void;

/**
 * Tracks the current Vim mode and notifies listeners on transitions.
 */
export class ModeManager {
  private currentMode: VimMode = VimMode.Normal;
  private listeners: ModeChangeCallback[] = [];

  get mode(): VimMode {
    return this.currentMode;
  }

  onModeChange(callback: ModeChangeCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  enterNormal(): void {
    this.transition(VimMode.Normal);
  }

  enterInsert(): void {
    this.transition(VimMode.Insert);
  }

  enterVisual(): void {
    this.transition(VimMode.Visual);
  }

  enterVisualLine(): void {
    this.transition(VimMode.VisualLine);
  }

  private transition(to: VimMode): void {
    if (this.currentMode === to) return;
    const from = this.currentMode;
    this.currentMode = to;
    const event: ModeChangeEvent = { from, to };
    for (const cb of this.listeners) {
      cb(event);
    }
  }
}
