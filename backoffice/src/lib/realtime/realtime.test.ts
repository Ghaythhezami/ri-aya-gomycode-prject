import { BACKOFF_MAX_MS, backoffCeiling, backoffDelay } from './backoff';
import { pollingIntervalFor } from './polling';

describe('reconnect backoff', () => {
  it('doubles from one second and caps at thirty', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(backoffCeiling)).toEqual([
      1000,
      2000,
      4000,
      8000,
      16_000,
      BACKOFF_MAX_MS,
      BACKOFF_MAX_MS,
      BACKOFF_MAX_MS,
    ]);
  });
  it('keeps the jittered delay between half and the full ceiling', () => {
    expect(backoffDelay(3, () => 0)).toBe(4000);
    expect(backoffDelay(3, () => 1)).toBe(8000);
    expect(backoffDelay(-5, () => 0)).toBe(500);
  });
});

describe('polling interval choice', () => {
  it('slows down only while the socket is connected', () => {
    expect(pollingIntervalFor('connected', 20_000, 120_000)).toBe(120_000);
    for (const status of ['connecting', 'offline', 'disabled'] as const) {
      expect(pollingIntervalFor(status, 20_000, 120_000)).toBe(20_000);
    }
  });
});
