import { classifyError, launcherVisible, pageContext } from './launcherState';

describe('launcherVisible', () => {
  it('shows only for an enabled staff or doctor persona', () => {
    expect(launcherVisible(undefined)).toBe(false);
    expect(launcherVisible({ enabled: false, persona: null, reason: 'NOT_CONFIGURED' })).toBe(
      false,
    );
    expect(launcherVisible({ enabled: true, persona: 'staff', reason: null })).toBe(true);
    expect(launcherVisible({ enabled: true, persona: 'doctor', reason: null })).toBe(true);
    expect(launcherVisible({ enabled: true, persona: 'patient', reason: null })).toBe(false);
  });
});

describe('pageContext', () => {
  it('passes the patient id on a profile and the date on scheduling pages', () => {
    expect(pageContext('/patients/abc-1', '2026-11-07')).toEqual({ patientId: 'abc-1' });
    expect(pageContext('/calendar', '2026-11-07')).toEqual({ date: '2026-11-07' });
    expect(pageContext('/settings', '2026-11-07')).toBeUndefined();
    expect(pageContext('/patients', '2026-11-07')).toBeUndefined();
  });
});

describe('classifyError', () => {
  it('maps codes to states', () => {
    expect(classifyError('AI_UNAVAILABLE', 503)).toBe('unavailable');
    expect(classifyError('CONSENT_REQUIRED', 403)).toBe('consent');
    expect(classifyError('AI_BUDGET_EXCEEDED', 429)).toBe('budget');
    expect(classifyError('NETWORK_ERROR', 0)).toBe('network');
    expect(classifyError('X', 500)).toBe('generic');
  });
});
