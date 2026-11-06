import {
  clearOnboardingSeen,
  isOnboardingSeen,
  markOnboardingSeen,
  shouldRedirectToOnboarding,
} from './onboardingSeen';

describe('onboarding redirect rule', () => {
  it('redirects only while open, unseen and outside the wizard', () => {
    const base = { completed: false, pathname: '/', seen: false };
    expect(shouldRedirectToOnboarding(base)).toBe(true);
    expect(shouldRedirectToOnboarding({ ...base, completed: true })).toBe(false);
    expect(shouldRedirectToOnboarding({ ...base, completed: undefined })).toBe(false);
    expect(shouldRedirectToOnboarding({ ...base, pathname: '/onboarding' })).toBe(false);
    expect(shouldRedirectToOnboarding({ ...base, pathname: '/patients', seen: true })).toBe(false);
  });

  it('remembers and clears the flag', () => {
    clearOnboardingSeen();
    expect(isOnboardingSeen()).toBe(false);
    markOnboardingSeen();
    expect(isOnboardingSeen()).toBe(true);
    clearOnboardingSeen();
    expect(isOnboardingSeen()).toBe(false);
  });
});
