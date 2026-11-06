/**
 * Remembers, for this tab session, that the onboarding wizard has already been offered, so
 * the shell redirects to it at most once after sign-in and never loops (a skip or finish
 * that races the refetch of the onboarding state cannot bounce the user back).
 */
const SEEN_KEY = 'riaya:onboarding-seen';

export function markOnboardingSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Blocked storage only means the redirect may repeat once per page load.
  }
}

export function isOnboardingSeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearOnboardingSeen(): void {
  try {
    sessionStorage.removeItem(SEEN_KEY);
  } catch {
    // Nothing to do.
  }
}

/** Pure redirect rule of the onboarding gate. */
export function shouldRedirectToOnboarding(input: {
  completed: boolean | undefined;
  pathname: string;
  seen: boolean;
}): boolean {
  if (input.completed !== false) return false;
  if (input.seen) return false;
  return !input.pathname.startsWith('/onboarding');
}
