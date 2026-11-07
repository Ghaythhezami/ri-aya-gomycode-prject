import {
  appointmentsSchema,
  clinicPayload,
  clinicSchema,
  hoursSchema,
  mapValidationDetails,
  remindersPayload,
  remindersSchema,
} from './forms';
import { jsonDiff } from './auditDiff';

const ok = {
  nameI18n: { en: 'C', fr: '', ar: '' },
  address: '',
  contactEmail: '',
  phone: '',
  defaultLanguage: 'en' as const,
  timezone: 'Asia/Dubai',
};
const msgs = (r: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]));

describe('settings validation', () => {
  it('gives field-level message keys', () => {
    const r = clinicSchema.safeParse({
      ...ok,
      nameI18n: { en: ' ', fr: '', ar: '' },
      contactEmail: 'x',
      phone: 'abc',
      timezone: 'Nope/Zone',
    });
    expect(msgs(r)).toEqual({
      nameI18n: 'settings.errors.required',
      contactEmail: 'settings.errors.email',
      phone: 'settings.errors.phone',
      timezone: 'settings.errors.timezone',
    });
    expect(clinicSchema.safeParse(ok).success).toBe(true);
  });
  it('requires closing after opening', () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      closed: false,
      open: '08:00',
      close: '18:00',
    }));
    days[2] = { weekday: 2, closed: false, open: '18:00', close: '08:00' };
    expect(msgs(hoursSchema.safeParse({ days }))['days.2.close']).toBe(
      'settings.errors.closeAfterOpen',
    );
  });
  it('validates numbers and unique reminders', () => {
    const a = appointmentsSchema.safeParse({
      slotMinutes: 7,
      cancellationNoticeHours: 99,
      targetWaitMinutes: NaN,
      requireCancelReason: true,
    });
    expect(Object.keys(msgs(a)).sort()).toEqual([
      'cancellationNoticeHours',
      'slotMinutes',
      'targetWaitMinutes',
    ]);
    const r = remindersSchema.safeParse({
      offsets: [{ hours: 2 }, { hours: 2 }],
      sms: true,
      email: false,
    });
    expect(msgs(r)['offsets.1.hours']).toBe('settings.errors.duplicateOffset');
  });
  it('sends only changed fields', () => {
    expect(
      clinicPayload(
        { ...ok, nameI18n: { en: 'New', fr: '', ar: 'جديد' }, phone: '+971 4 000' },
        ok,
      ),
    ).toEqual({
      clinic: { nameI18n: { en: 'New', fr: '', ar: 'جديد' } },
      phone: '+971 4 000',
    });
    const base = { offsets: [{ hours: 24 }], sms: true, email: true };
    expect(remindersPayload({ ...base, offsets: [{ hours: 24 }, { hours: 2 }] }, base)).toEqual({
      reminderOffsets: [1440, 120],
    });
  });
  it('maps server validation details to fields', () => {
    const r = mapValidationDetails(
      [
        'clinic.name must be shorter than 121 characters',
        { property: 'phone', constraints: { max: 'too long' } },
        'something else',
      ],
      ['name', 'phone'],
    );
    expect(r.fieldErrors.name).toContain('shorter');
    expect(r.fieldErrors.phone).toBe('too long');
    expect(r.general).toEqual(['something else']);
  });
  it('diffs audit snapshots', () => {
    expect(jsonDiff({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } })).toEqual([
      { path: 'b.c', before: 2, after: 3 },
    ]);
    expect(jsonDiff(null, { a: 1 })).toEqual([{ path: 'a', before: undefined, after: 1 }]);
  });
});
