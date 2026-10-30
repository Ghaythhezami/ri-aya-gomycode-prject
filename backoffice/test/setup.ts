// Registers the jest-dom matchers (toBeInTheDocument, toHaveValue, ...).
import '@testing-library/jest-dom/vitest';

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
