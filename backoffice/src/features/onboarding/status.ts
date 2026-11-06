import { createContext, useContext } from 'react';

/** Whether the signed-in user still has onboarding to finish; null until it is known. */
export const OnboardingStatusContext = createContext<{ completed: boolean } | null>(null);

export function useOnboardingStatus() {
  return useContext(OnboardingStatusContext);
}
