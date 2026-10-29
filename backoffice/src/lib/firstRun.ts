/**
 * Remembers, for the current tab session, that the owner has just finished the
 * registration wizard, so the workspace can greet them with a first-run state
 * instead of an empty dashboard (AC-041, T7.5).
 *
 * sessionStorage is deliberate: the state is per-session, dies with the tab, and
 * needs no API call or schema change.
 */
const FIRST_RUN_KEY = 'riaya:first-run';

export function markFirstRun(): void {
  try {
    sessionStorage.setItem(FIRST_RUN_KEY, '1');
  } catch {
    // Storage can be blocked (private mode, disabled cookies). The first-run card
    // is guidance, so failing to persist it must never break registration.
  }
}

export function isFirstRun(): boolean {
  try {
    return sessionStorage.getItem(FIRST_RUN_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearFirstRun(): void {
  try {
    sessionStorage.removeItem(FIRST_RUN_KEY);
  } catch {
    // Nothing to do: the flag simply survives until the tab closes.
  }
}
