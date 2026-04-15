import { RegisterContent } from './types.js';

/**
 * Vim register storage.
 *
 * Supports:
 * - Unnamed register (")
 * - Numbered registers (0-9)
 * - Named registers (a-z)
 * - System clipboard register (+)
 * - Small delete register (-)
 */
export class Registers {
  private store = new Map<string, RegisterContent>();

  get(name: string): RegisterContent {
    return this.store.get(name) ?? { text: '', linewise: false };
  }

  set(name: string, content: RegisterContent): void {
    this.store.set(name, content);
  }

  /**
   * Record a yank operation: populates unnamed (") and register 0.
   * If an explicit register name is given, also populates that register.
   */
  recordYank(text: string, linewise: boolean, register?: string): void {
    const content: RegisterContent = { text, linewise };
    this.set('"', content);
    this.set('0', content);
    if (register) {
      this.set(register, content);
    }
  }

  /**
   * Record a delete operation: populates unnamed ("), shifts numbered
   * registers 1-9 (large deletes) or small delete register (-).
   * If an explicit register name is given, also populates that register.
   */
  recordDelete(text: string, linewise: boolean, register?: string): void {
    const content: RegisterContent = { text, linewise };
    this.set('"', content);

    if (register) {
      this.set(register, content);
    }

    // Small deletes (less than a line and not linewise) go to "-"
    if (!linewise && !text.includes('\n')) {
      this.set('-', content);
    } else {
      // Shift numbered registers 9 <- 8 <- ... <- 2 <- 1
      for (let i = 9; i >= 2; i--) {
        const prev = this.store.get(String(i - 1));
        if (prev) {
          this.store.set(String(i), prev);
        }
      }
      this.set('1', content);
    }
  }

  /**
   * Get the content to paste. Reads from the given register or unnamed.
   */
  getPaste(register?: string): RegisterContent {
    return this.get(register ?? '"');
  }

  clear(): void {
    this.store.clear();
  }
}
