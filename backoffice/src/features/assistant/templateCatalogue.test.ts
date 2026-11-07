import { firstBlank, hasBlank, templatesFor } from './templateCatalogue';

describe('prompt templates', () => {
  it('groups staff templates by category in catalogue order', () => {
    const groups = templatesFor('staff', false);
    expect(groups.map((g) => g.category)).toEqual(['today', 'booking', 'patients']);
    expect(groups[0]!.templates.map((t) => t.id)).toEqual([
      'waiting',
      'queue',
      'schedule',
      'alerts',
    ]);
  });

  it('swaps the doctor templates for "this patient" variants on a patient page', () => {
    const without = templatesFor('doctor', false).flatMap((g) => g.templates.map((t) => t.id));
    const withCtx = templatesFor('doctor', true).flatMap((g) => g.templates.map((t) => t.id));
    expect(without).toContain('summarize');
    expect(without).not.toContain('thisPatient');
    expect(withCtx).toContain('thisPatient');
    expect(withCtx).toContain('thisPatientLab');
    expect(withCtx).not.toContain('summarize');
  });

  it('finds the first blank to select', () => {
    const prompt = 'Book [patient name] with [doctor] tomorrow';
    expect(hasBlank(prompt)).toBe(true);
    expect(firstBlank(prompt)).toEqual({ start: 5, end: 19 });
    expect(prompt.slice(5, 19)).toBe('[patient name]');
    expect(hasBlank('Who is waiting longest?')).toBe(false);
    expect(firstBlank('Who is waiting longest?')).toBeNull();
  });
});
