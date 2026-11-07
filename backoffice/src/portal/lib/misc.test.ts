import { buildIcs, foldLine, icsDate, icsEscape } from './ics';
import { canLeaveStep, nextStep, onboardingRedirect, previousStep, stepNumber } from './onboarding';
import { changeGate, pickNext, statusTone } from './appointments';
import { MAX_UPLOAD_BYTES, validateUpload } from './documents';
import { parseRichText } from './richText';

describe('ICS generation', () => {
  const event = {
    uid: 'appt-1',
    title: 'Visit with Dr. Amal, Cardiology',
    startsAt: '2026-03-02T09:00:00+04:00',
    endsAt: '2026-03-02T09:30:00+04:00',
    location: 'Clinic; Main St',
    description: 'Line one\nLine two',
  };

  it('formats UTC dates', () => {
    expect(icsDate('2026-03-02T09:00:00+04:00')).toBe('20260302T050000Z');
  });

  it('escapes text and uses CRLF with a calendar envelope', () => {
    const ics = buildIcs(event, new Date('2026-03-01T00:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20260302T050000Z');
    expect(ics).toContain('DTEND:20260302T053000Z');
    expect(ics).toContain('SUMMARY:Visit with Dr. Amal\\, Cardiology');
    expect(ics).toContain('LOCATION:Clinic\\; Main St');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('folds long lines at 75 octets', () => {
    const folded = foldLine(`SUMMARY:${'x'.repeat(200)}`);
    for (const line of folded.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'x'.repeat(200)}`);
    expect(icsEscape('a\\b')).toBe('a\\\\b');
  });
});

describe('onboarding steps', () => {
  it('walks profile, preferences, assistant, appointment, done and clamps at the ends', () => {
    expect(nextStep('profile')).toBe('preferences');
    expect(nextStep('assistant')).toBe('appointment');
    expect(nextStep('done')).toBe('done');
    expect(previousStep('profile')).toBe('profile');
    expect(previousStep('done')).toBe('appointment');
    expect(stepNumber('appointment')).toBe(4);
    expect(stepNumber('done')).toBe(4);
  });

  it('only gates the profile step', () => {
    expect(canLeaveStep('profile', { hasName: false, phoneValid: true })).toBe(false);
    expect(canLeaveStep('profile', { hasName: true, phoneValid: false })).toBe(false);
    expect(canLeaveStep('profile', { hasName: true, phoneValid: true })).toBe(true);
    expect(canLeaveStep('assistant', { hasName: false, phoneValid: false })).toBe(true);
  });

  it('redirects to the welcome flow until onboarding is complete', () => {
    expect(onboardingRedirect({ onboardingCompleted: false }, '/portal')).toBe('/portal/welcome');
    expect(onboardingRedirect({ onboardingCompleted: false }, '/portal/welcome')).toBeNull();
    expect(onboardingRedirect({ onboardingCompleted: true }, '/portal/welcome')).toBeNull();
    expect(onboardingRedirect({ onboardingCompleted: true }, '/portal/book')).toBeNull();
    expect(onboardingRedirect(null, '/portal')).toBeNull();
  });
});

describe('canChange UI gating', () => {
  it('allows only open statuses the API says can change', () => {
    expect(changeGate({ status: 'CONFIRMED', canChange: true })).toBe('allowed');
    expect(changeGate({ status: 'SCHEDULED', canChange: true })).toBe('allowed');
  });
  it('explains a closed notice window instead of allowing the action', () => {
    expect(changeGate({ status: 'CONFIRMED', canChange: false })).toBe('tooLate');
  });
  it('treats finished and cancelled visits as closed even if canChange is true', () => {
    expect(changeGate({ status: 'COMPLETED', canChange: true })).toBe('closed');
    expect(changeGate({ status: 'CANCELLED', canChange: true })).toBe('closed');
    expect(changeGate({ status: 'CHECKED_IN', canChange: true })).toBe('closed');
  });
  it('maps statuses to badge tones and picks the next visit', () => {
    expect(statusTone('CANCELLED')).toBe('error');
    expect(statusTone('COMPLETED')).toBe('success');
    const base = {
      id: '',
      code: '',
      doctor: { id: '', name: '', specialty: '', initials: '' },
      type: '',
      typeName: '',
      canChange: true,
      reason: null,
    };
    const list = [
      {
        ...base,
        id: 'late',
        status: 'CONFIRMED',
        startsAt: '2026-05-02T09:00:00Z',
        endsAt: '2026-05-02T09:30:00Z',
      },
      {
        ...base,
        id: 'cancelled',
        status: 'CANCELLED',
        startsAt: '2026-05-01T09:00:00Z',
        endsAt: '2026-05-01T09:30:00Z',
      },
      {
        ...base,
        id: 'soon',
        status: 'SCHEDULED',
        startsAt: '2026-05-01T12:00:00Z',
        endsAt: '2026-05-01T12:30:00Z',
      },
    ];
    expect(pickNext(list, new Date('2026-05-01T08:00:00Z'))?.id).toBe('soon');
  });
});

describe('document upload check', () => {
  it('accepts PDF, JPEG and PNG up to 10 MB', () => {
    expect(validateUpload({ type: 'application/pdf', size: 1000 })).toBeNull();
    expect(validateUpload({ type: 'image/png', size: MAX_UPLOAD_BYTES })).toBeNull();
    expect(validateUpload({ type: 'image/gif', size: 1000 })).toBe('type');
    expect(validateUpload({ type: 'image/jpeg', size: MAX_UPLOAD_BYTES + 1 })).toBe('size');
    expect(validateUpload({ type: 'image/jpeg', size: 0 })).toBe('empty');
  });
});

describe('rich text', () => {
  it('parses paragraphs and lists and leaves HTML as inert text', () => {
    const blocks = parseRichText('Hello <b>x</b>\nsecond line\n\n- one\n- two\n\n1. a\n2. b');
    expect(blocks).toEqual([
      { type: 'p', text: 'Hello <b>x</b> second line' },
      { type: 'ul', items: ['one', 'two'] },
      { type: 'ol', items: ['a', 'b'] },
    ]);
  });
});
