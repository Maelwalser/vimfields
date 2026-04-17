/**
 * FieldDetector uses MutationObserver to discover input, textarea,
 * and contenteditable elements — including dynamically added ones
 * and elements inside shadow DOM.
 */

export type FieldFoundCallback = (element: HTMLElement) => void;

export class FieldDetector {
  private observer: MutationObserver | null = null;
  private readonly attached = new WeakSet<HTMLElement>();
  private readonly onFieldFound: FieldFoundCallback;
  private readonly observedRoots = new Set<Node>();

  constructor(onFieldFound: FieldFoundCallback) {
    this.onFieldFound = onFieldFound;
  }

  /** Start observing the given root (defaults to document.body). */
  start(root: Node = document.body): void {
    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));

    // Scan existing elements
    this.scanNode(root);

    // Observe future additions
    this.observe(root);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.observedRoots.clear();
  }

  /** Check whether an element has already been attached. */
  isAttached(el: HTMLElement): boolean {
    return this.attached.has(el);
  }

  // ---------- Private ----------

  private observe(root: Node): void {
    if (!this.observer || this.observedRoots.has(root)) return;
    this.observedRoots.add(root);
    this.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['contenteditable'],
    });
  }

  private handleMutations(mutations: MutationRecord[]): void {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            this.scanNode(node);
          }
        }
      } else if (mutation.type === 'attributes') {
        if (mutation.target instanceof HTMLElement) {
          this.checkElement(mutation.target);
        }
      }
    }
  }

  private scanNode(root: Node): void {
    if (root instanceof HTMLElement) {
      this.checkElement(root);

      // Traverse into shadow DOM
      if (root.shadowRoot) {
        this.scanNode(root.shadowRoot);
        this.observe(root.shadowRoot);
      }
    }

    // Scan children
    if (root instanceof Element || root instanceof DocumentFragment) {
      const elements = root.querySelectorAll<HTMLElement>(
        'input, textarea,' +
          ' [contenteditable="true"], [contenteditable=""],' +
          ' [contenteditable="plaintext-only"]',
      );
      for (const el of elements) {
        this.checkElement(el);
      }

      // Scan shadow roots of children
      const allElements = root.querySelectorAll<HTMLElement>('*');
      for (const el of allElements) {
        if (el.shadowRoot) {
          this.scanNode(el.shadowRoot);
          this.observe(el.shadowRoot);
        }
      }
    }
  }

  private checkElement(el: HTMLElement): void {
    if (this.attached.has(el)) return;

    if (this.isEditableField(el)) {
      this.attached.add(el);
      this.onFieldFound(el);
    }
  }

  private isEditableField(el: HTMLElement): boolean {
    if (el instanceof HTMLTextAreaElement) return true;

    if (el instanceof HTMLInputElement) {
      const type = el.type.toLowerCase();
      const textTypes = ['text', 'search', 'url', 'tel', 'password', 'email', ''];
      return textTypes.includes(type);
    }

    // Only treat the element that *explicitly* carries contenteditable as an
    // editor root. Descendants inherit `isContentEditable` from an ancestor,
    // but they aren't the focus target — attaching to them would double-fire.
    // The IDL `contentEditable` returns "inherit" on descendants, so it's a
    // valid complement to the attribute check (and works in jsdom, which
    // doesn't reflect the setter back to the HTML attribute).
    const ceAttr = el.getAttribute('contenteditable');
    if (ceAttr === 'true' || ceAttr === '' || ceAttr === 'plaintext-only') {
      return true;
    }
    const ceIdl = el.contentEditable;
    return ceIdl === 'true' || ceIdl === 'plaintext-only';
  }
}
