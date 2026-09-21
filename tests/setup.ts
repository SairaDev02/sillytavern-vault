import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

// Replace global indexedDB with fake implementation for tests
globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;

// jsdom does not implement matchMedia. Components read it to honor
// prefers-reduced-motion, so provide a minimal stub.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/**
 * jsdom does not implement the Web Animations API, which Svelte uses for
 * `animate:flip` and for transitions. Without it, transitions never finish and
 * removed elements stay in the DOM. This stub completes every animation on the
 * next microtask, which matches how a zero-duration animation behaves.
 */
if (typeof Element !== 'undefined') {
  const proto = Element.prototype as unknown as Record<string, unknown>;

  proto.animate ??= function animate() {
    const animation = {
      onfinish: null as null | (() => void),
      playState: 'running' as AnimationPlayState,
      currentTime: 0,
      effect: null,
      cancel() {
        animation.playState = 'idle';
        animation.onfinish = null;
      },
      finish() {},
      play() {},
      pause() {},
    };

    queueMicrotask(() => {
      const onfinish = animation.onfinish;
      if (animation.playState === 'running' && onfinish) {
        animation.playState = 'finished';
        onfinish();
      }
    });

    return animation;
  };

  proto.getAnimations ??= function getAnimations() {
    return [];
  };
}

/**
 * jsdom ships `<dialog>` without `showModal`, `close`, or the `open` property.
 * This shim covers the parts the lightbox uses, including the asynchronous
 * `close` event that the browser fires after a dialog closes.
 */
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  Object.defineProperty(HTMLDialogElement.prototype, 'open', {
    configurable: true,
    get(this: HTMLDialogElement) {
      return this.hasAttribute('open');
    },
  });

  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };

  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
    returnValue?: string
  ) {
    this.returnValue = returnValue ?? '';
    this.removeAttribute('open');
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  };
}
