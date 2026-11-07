import type { AssistantProposal } from '@riaya/shared';

export type Audience = 'staff' | 'patient';

export interface RestCall {
  method: 'POST' | 'PATCH';
  url: string;
  body?: Record<string, unknown>;
  /** add_clinical_note: read the current notes first and append to them. */
  appendNote?: { patientId: string; note: string };
}

export interface ProposalEnv {
  audience: Audience;
  /** Patient being viewed (staff), used when a booking proposal omits patientId. */
  contextPatientId?: string;
  /** Reason used when the model gave none (the staff cancel route requires one). */
  defaultReason: string;
  /** save_summary: the user explicitly ticked "also publish to the portal". */
  publishToPatient?: boolean;
}

/** The REST route that executes a confirmed proposal, with the confirming user's own token. */
export function proposalToRest(p: AssistantProposal, env: ProposalEnv): RestCall {
  const patient = env.audience === 'patient';
  switch (p.action) {
    case 'book_appointment': {
      const { patientId, ...rest } = p.params;
      if (patient) return { method: 'POST', url: '/api/portal/appointments', body: { ...rest } };
      const id = patientId ?? env.contextPatientId;
      if (!id) throw new Error('PATIENT_REQUIRED');
      return { method: 'POST', url: '/api/appointments', body: { patientId: id, ...rest } };
    }
    case 'reschedule_appointment': {
      const { appointmentId, ...body } = p.params;
      return patient
        ? {
            method: 'POST',
            url: `/api/portal/appointments/${appointmentId}/reschedule`,
            body: { ...body },
          }
        : { method: 'PATCH', url: `/api/appointments/${appointmentId}`, body: { ...body } };
    }
    case 'cancel_appointment':
      return patient
        ? {
            method: 'POST',
            url: `/api/portal/appointments/${p.params.appointmentId}/cancel`,
            body: p.params.reason ? { reason: p.params.reason } : {},
          }
        : {
            method: 'POST',
            url: `/api/appointments/${p.params.appointmentId}/cancel`,
            body: { reason: p.params.reason || env.defaultReason },
          };
    case 'check_in':
      return {
        method: 'POST',
        url: '/api/queue/check-in',
        body: { appointmentId: p.params.appointmentId },
      };
    case 'save_summary': {
      const { patientId, ...body } = p.params;
      return {
        method: 'POST',
        url: `/api/patients/${patientId}/summaries`,
        body: { ...body, visibleToPatient: env.publishToPatient === true },
      };
    }
    case 'add_clinical_note':
      return {
        method: 'PATCH',
        url: `/api/patients/${p.params.patientId}`,
        appendNote: { patientId: p.params.patientId, note: p.params.note },
      };
  }
}

/** Append a note to existing clinical notes, separated by a blank line. */
export function appendClinicalNote(existing: string | null | undefined, note: string): string {
  return [existing?.trim(), note.trim()].filter(Boolean).join('\n\n');
}

export type ProposalOutcome =
  { kind: 'ok' } | { kind: 'conflict' } | { kind: 'consent' } | { kind: 'error' };

/** Map an HTTP failure of a confirmed proposal to the card state. */
export function proposalOutcome(status: number, code: string): ProposalOutcome {
  if (status === 409 || code === 'SLOT_CONFLICT' || code === 'SLOT_LOCKED') {
    return { kind: 'conflict' };
  }
  return { kind: 'error' };
}
