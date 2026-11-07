import type { AssistantPersona } from '@riaya/shared';

/**
 * Prompt templates offered in the assistant, per persona. Text lives in the i18n catalogue
 * (`assistant.templates.<persona>.<id>`); a template whose prompt holds a `[blank]` is put in
 * the composer with the first blank selected, a complete one is sent as is.
 */
export type TemplateCategory =
  'today' | 'booking' | 'patients' | 'day' | 'writing' | 'appointments' | 'health' | 'clinic';

export interface PromptTemplate {
  id: string;
  category: TemplateCategory;
  /** Shown only when the page gives a patient context (doctor on a patient profile). */
  needsPatientContext?: boolean;
  /** Hidden when the page gives a patient context (a "this patient" variant replaces it). */
  hideWithPatientContext?: boolean;
}

const CATALOGUE: Record<AssistantPersona, PromptTemplate[]> = {
  staff: [
    { id: 'waiting', category: 'today' },
    { id: 'queue', category: 'today' },
    { id: 'schedule', category: 'today' },
    { id: 'alerts', category: 'today' },
    { id: 'slot', category: 'booking' },
    { id: 'book', category: 'booking' },
    { id: 'reschedule', category: 'booking' },
    { id: 'cancel', category: 'booking' },
    { id: 'find', category: 'patients' },
    { id: 'checkIn', category: 'patients' },
    { id: 'optimize', category: 'patients' },
  ],
  doctor: [
    { id: 'thisPatient', category: 'patients', needsPatientContext: true },
    { id: 'thisPatientLab', category: 'patients', needsPatientContext: true },
    { id: 'summarize', category: 'patients', hideWithPatientContext: true },
    { id: 'lastLab', category: 'patients', hideWithPatientContext: true },
    { id: 'medications', category: 'patients' },
    { id: 'history', category: 'patients' },
    { id: 'schedule', category: 'day' },
    { id: 'tomorrow', category: 'day' },
    { id: 'note', category: 'writing' },
    { id: 'patientSummary', category: 'writing' },
  ],
  patient: [
    { id: 'next', category: 'appointments' },
    { id: 'book', category: 'appointments' },
    { id: 'reschedule', category: 'appointments' },
    { id: 'cancel', category: 'appointments' },
    { id: 'explain', category: 'health' },
    { id: 'documents', category: 'health' },
    { id: 'prepare', category: 'health' },
    { id: 'hours', category: 'clinic' },
    { id: 'doctors', category: 'clinic' },
  ],
};

export interface TemplateGroup {
  category: TemplateCategory;
  templates: PromptTemplate[];
}

/** Templates for a persona, grouped by category in catalogue order. */
export function templatesFor(
  persona: AssistantPersona,
  hasPatientContext: boolean,
): TemplateGroup[] {
  const groups: TemplateGroup[] = [];
  for (const t of CATALOGUE[persona]) {
    if (t.needsPatientContext && !hasPatientContext) continue;
    if (t.hideWithPatientContext && hasPatientContext) continue;
    let group = groups.find((g) => g.category === t.category);
    if (!group) {
      group = { category: t.category, templates: [] };
      groups.push(group);
    }
    group.templates.push(t);
  }
  return groups;
}

const BLANK = /\[[^\]\n]+\]/;

/** True when the prompt still has a `[blank]` for the user to fill. */
export function hasBlank(prompt: string): boolean {
  return BLANK.test(prompt);
}

/** Range of the first `[blank]` (brackets included), or null. */
export function firstBlank(prompt: string): { start: number; end: number } | null {
  const match = BLANK.exec(prompt);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}
