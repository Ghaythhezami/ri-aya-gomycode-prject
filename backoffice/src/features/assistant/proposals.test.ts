import type { AssistantProposal } from '@riaya/shared';
import { appendClinicalNote, proposalOutcome, proposalToRest, type ProposalEnv } from './proposals';

const staff: ProposalEnv = { audience: 'staff', defaultReason: 'Cancelled via assistant' };
const patient: ProposalEnv = { audience: 'patient', defaultReason: '' };

const book: AssistantProposal = {
  id: '1',
  action: 'book_appointment',
  preview: 'p',
  params: { doctorId: 'd1', type: 'CONSULTATION', startsAt: '2026-11-10T09:00:00Z' },
};

describe('proposalToRest', () => {
  it('books through the staff route using the page patient', () => {
    expect(proposalToRest(book, { ...staff, contextPatientId: 'p9' })).toEqual({
      method: 'POST',
      url: '/api/appointments',
      body: {
        patientId: 'p9',
        doctorId: 'd1',
        type: 'CONSULTATION',
        startsAt: '2026-11-10T09:00:00Z',
      },
    });
  });

  it('refuses a staff booking without a patient', () => {
    expect(() => proposalToRest(book, staff)).toThrow('PATIENT_REQUIRED');
  });

  it('books through the portal route for a patient', () => {
    const call = proposalToRest(book, patient);
    expect(call.url).toBe('/api/portal/appointments');
    expect(call.body).not.toHaveProperty('patientId');
  });

  it('reschedules and cancels per audience', () => {
    const re: AssistantProposal = {
      id: '2',
      action: 'reschedule_appointment',
      preview: '',
      params: { appointmentId: 'a1', startsAt: 'x' },
    };
    expect(proposalToRest(re, staff)).toMatchObject({
      method: 'PATCH',
      url: '/api/appointments/a1',
    });
    expect(proposalToRest(re, patient).url).toBe('/api/portal/appointments/a1/reschedule');
    const cancel: AssistantProposal = {
      id: '3',
      action: 'cancel_appointment',
      preview: '',
      params: { appointmentId: 'a1' },
    };
    expect(proposalToRest(cancel, staff).body).toEqual({ reason: 'Cancelled via assistant' });
    expect(proposalToRest(cancel, patient).url).toBe('/api/portal/appointments/a1/cancel');
  });

  it('maps check-in, summaries and clinical notes', () => {
    expect(
      proposalToRest(
        { id: '4', action: 'check_in', preview: '', params: { appointmentId: 'a1' } },
        staff,
      ),
    ).toEqual({ method: 'POST', url: '/api/queue/check-in', body: { appointmentId: 'a1' } });
    expect(
      proposalToRest(
        {
          id: '5',
          action: 'save_summary',
          preview: '',
          params: { patientId: 'p1', content: 'c', visibleToPatient: false },
        },
        staff,
      ),
    ).toEqual({
      method: 'POST',
      url: '/api/patients/p1/summaries',
      body: { content: 'c', visibleToPatient: false },
    });
    const note = proposalToRest(
      { id: '6', action: 'add_clinical_note', preview: '', params: { patientId: 'p1', note: 'n' } },
      staff,
    );
    expect(note.appendNote).toEqual({ patientId: 'p1', note: 'n' });
  });
});

describe('helpers', () => {
  it('appends notes with a blank line', () => {
    expect(appendClinicalNote('old', 'new')).toBe('old\n\nnew');
    expect(appendClinicalNote(null, 'new')).toBe('new');
  });

  it('classifies conflicts', () => {
    expect(proposalOutcome(409, 'SLOT_CONFLICT').kind).toBe('conflict');
    expect(proposalOutcome(500, 'X').kind).toBe('error');
  });
});
