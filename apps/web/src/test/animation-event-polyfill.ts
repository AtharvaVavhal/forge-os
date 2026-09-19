/**
 * jsdom has no `AnimationEvent` global. React feature-detects it at module
 * init time to decide whether to register `animationend`/`animationstart`/
 * `animationiteration` listeners at all (see react-dom's
 * `getVendorPrefixedEventName`) — without this, `onAnimationEnd` handlers
 * never fire in tests, even via `fireEvent.animationEnd`. Must load before
 * any module imports react-dom, hence its own entry in `setupFiles` (ESM
 * import hoisting would otherwise run react-dom's init first if this lived
 * inside `setup.ts`, which itself imports `@testing-library/react`).
 */
if (typeof globalThis.AnimationEvent === "undefined") {
  class AnimationEventPolyfill extends Event {
    readonly animationName: string;
    readonly elapsedTime: number;
    readonly pseudoElement: string;

    constructor(type: string, init: AnimationEventInit = {}) {
      super(type, init);
      this.animationName = init.animationName ?? "";
      this.elapsedTime = init.elapsedTime ?? 0;
      this.pseudoElement = init.pseudoElement ?? "";
    }
  }

  Object.defineProperty(globalThis, "AnimationEvent", {
    value: AnimationEventPolyfill,
    writable: true,
    configurable: true,
  });
}
