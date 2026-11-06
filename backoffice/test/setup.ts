// Registers the jest-dom matchers (toBeInTheDocument, toHaveValue, ...).
import '@testing-library/jest-dom';
// Lets `expect(value, 'message')` carry a failure message, as Vitest does.
import 'jest-expect-message';

// Vitest's `toBeTypeOf`, which Jest lacks.
expect.extend({
  toBeTypeOf(received: unknown, expected: string) {
    const actual = typeof received;
    return {
      pass: actual === expected,
      message: () =>
        `expected ${String(received)} ${this.isNot ? 'not ' : ''}to be of type ${expected}, got ${actual}`,
    };
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeTypeOf(expected: string): R;
    }
  }
}

// jsdom does not implement matchMedia; the app's theme and language layers use it.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
