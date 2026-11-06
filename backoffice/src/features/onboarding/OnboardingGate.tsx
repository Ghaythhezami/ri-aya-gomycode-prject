import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  isOnboardingSeen,
  markOnboardingSeen,
  shouldRedirectToOnboarding,
} from '../../lib/onboardingSeen';
import { useOnboardingQuery } from './api';
import { OnboardingStatusContext } from './status';

/**
 * Sends a signed-in user to the wizard once per tab session while onboarding is open.
 * The redirect is remembered (sessionStorage) before it happens, so finishing, skipping or
 * navigating away never bounces the user back, even if the refetch is still in flight.
 * A failed state request never redirects.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { data } = useOnboardingQuery();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const completed = data?.completed;

  useEffect(() => {
    if (shouldRedirectToOnboarding({ completed, pathname, seen: isOnboardingSeen() })) {
      markOnboardingSeen();
      navigate('/onboarding', { replace: true });
    }
  }, [completed, pathname, navigate]);

  return (
    <OnboardingStatusContext.Provider value={data ? { completed: data.completed } : null}>
      {children}
    </OnboardingStatusContext.Provider>
  );
}
