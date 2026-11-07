import type { AssistantChatInput, AssistantPersona, AssistantStatus } from '@riaya/shared';

/** The floating launcher is shown only when the server says the staff assistant is usable. */
export function launcherVisible(status: AssistantStatus | undefined | null): boolean {
  return Boolean(status?.enabled && (status.persona === 'staff' || status.persona === 'doctor'));
}

export function staffPersona(status: AssistantStatus | undefined | null): AssistantPersona {
  return status?.persona === 'doctor' ? 'doctor' : 'staff';
}

const PATIENT_ROUTE = /^\/patients\/([^/]+)\/?$/;
const SCHEDULING_ROUTE = /^\/(calendar|appointments|scheduling|waiting-list)(\/|$)|^\/$/;

/** Page context sent with each message: the patient being viewed, or today on scheduling pages. */
export function pageContext(pathname: string, today: string): AssistantChatInput['context'] {
  const patient = PATIENT_ROUTE.exec(pathname);
  if (patient && patient[1] !== 'new') return { patientId: decodeURIComponent(patient[1]!) };
  if (SCHEDULING_ROUTE.test(pathname)) return { date: today };
  return undefined;
}

export type AssistantErrorKind =
  'unavailable' | 'consent' | 'verification' | 'budget' | 'network' | 'generic';

/** Classify a stream/HTTP error code for the panel's error states. */
export function classifyError(code: string, status = 0): AssistantErrorKind {
  if (code === 'AI_UNAVAILABLE' || status === 503) return 'unavailable';
  if (code === 'CONSENT_REQUIRED') return 'consent';
  if (code === 'VERIFICATION_REQUIRED') return 'verification';
  if (code === 'AI_BUDGET_EXCEEDED') return 'budget';
  if (code === 'NETWORK_ERROR' || status === 0) return 'network';
  return 'generic';
}
