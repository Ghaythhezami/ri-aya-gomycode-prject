import type { PortalMe } from '@riaya/shared';

export const ONBOARDING_STEPS = [
  'profile',
  'preferences',
  'assistant',
  'appointment',
  'done',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.min(i + 1, ONBOARDING_STEPS.length - 1)]!;
}

export function previousStep(step: OnboardingStep): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.max(i - 1, 0)]!;
}

/** Steps shown in the progress bar (the final "done" screen is not counted). */
export const COUNTED_STEPS = ONBOARDING_STEPS.slice(0, 4);

export function stepNumber(step: OnboardingStep): number {
  return Math.min(ONBOARDING_STEPS.indexOf(step) + 1, COUNTED_STEPS.length);
}

/** The profile step needs at least one name and a plausible phone; the rest is optional. */
export function canLeaveStep(
  step: OnboardingStep,
  profile: { hasName: boolean; phoneValid: boolean },
): boolean {
  return step === 'profile' ? profile.hasName && profile.phoneValid : true;
}

/**
 * Where a signed-in patient must be sent, or null when the current page is fine. Only the
 * "not onboarded yet" direction is automatic; the welcome page itself decides when to leave,
 * so the final "done" screen and the jump to booking are not cut short.
 */
export function onboardingRedirect(
  me: Pick<PortalMe, 'onboardingCompleted'> | null,
  pathname: string,
): string | null {
  if (!me) return null;
  if (!me.onboardingCompleted && !pathname.startsWith('/portal/welcome')) return '/portal/welcome';
  return null;
}
