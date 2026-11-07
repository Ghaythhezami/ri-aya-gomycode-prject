import en from '../../i18n/features/notifications/en.json';
import { entityPath, matchesTab, mergeById, prepareParams, renderNotification } from './templates';

const f = {
  time: (v: string) => `T(${v.slice(11, 16)})`,
  dateTime: (v: string) => `DT(${v})`,
  date: (v: string) => `D(${v})`,
};
const dict: Record<string, string> = {};
const flat = (o: Record<string, unknown>, p = '') =>
  Object.entries(o).forEach(([k, v]) =>
    typeof v === 'object'
      ? flat(v as Record<string, unknown>, `${p}${k}.`)
      : (dict[`notifications.${p}${k}`] = String(v)),
  );
flat(en);
const i18n = {
  exists: (k: string) => k in dict,
  t: (k: string, o: Record<string, unknown> = {}) =>
    dict[k]!.replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(o[n] ?? '')),
};

describe('notification templates', () => {
  it('formats ISO params before interpolation', () => {
    expect(prepareParams({ time: '2026-01-05T09:30:00Z', date: '2026-01-05', n: 3 }, f)).toEqual({
      time: 'T(09:30)',
      date: 'D(2026-01-05)',
      n: 3,
    });
  });
  it('renders title and body with params', () => {
    const r = renderNotification(
      {
        titleKey: 'notifications.templates.booked.title',
        bodyKey: 'notifications.templates.booked.body',
        params: { patient: 'Sara', doctor: 'Dr. Kim', time: '2026-01-05T09:30:00Z' },
      },
      i18n,
      f,
    );
    expect(r.title).toBe('New appointment booked');
    expect(r.body).toBe('Sara is booked with Dr. Kim at T(09:30).');
  });
  it('falls back for unknown templates', () => {
    const r = renderNotification(
      {
        titleKey: 'notifications.templates.newThing.title',
        bodyKey: 'notifications.templates.newThing.body',
        params: {},
      },
      i18n,
      f,
    );
    expect(r).toEqual({ title: 'New thing', body: '' });
  });
  it('routes, filters and merges', () => {
    expect(entityPath({ entityType: 'queue', entityId: null })).toBe('/waiting-list');
    expect(entityPath({ entityType: 'patient', entityId: 'p' })).toBe('/patients/p');
    expect(matchesTab({ category: 'AVAILABILITY', read: true }, 'system')).toBe(true);
    expect(matchesTab({ category: 'DELAY', read: false }, 'appointments')).toBe(true);
    expect(
      mergeById([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map((x) => x.id),
    ).toEqual(['a', 'b', 'c']);
  });
});

describe('localized params and missing placeholders', () => {
  it('prefers the UI-language copy of a name and hides the per-language keys', () => {
    const params = {
      patient: 'Amira Khan',
      patient__ar: 'أميرة خان',
      patient__fr: 'Amira Khan',
      n: 2,
    };
    expect(prepareParams(params, f, 'ar')).toEqual({ patient: 'أميرة خان', n: 2 });
    expect(prepareParams(params, f, 'en')).toEqual({ patient: 'Amira Khan', n: 2 });
    // Old notifications without copies keep the stored value.
    expect(prepareParams({ patient: 'Amira Khan' }, f, 'ar')).toEqual({ patient: 'Amira Khan' });
  });

  it('drops a parenthetical whose placeholder is missing', async () => {
    const { fillMissing } = await import('./templates');
    expect(fillMissing('Sarah (queue {{number}}) is late')).toBe('Sarah is late');
    expect(fillMissing('At {{time}}')).toBe('At —');
  });
});
