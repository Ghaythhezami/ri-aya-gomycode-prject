import { fireEvent, render, screen } from '@testing-library/react';
import type { AssistantProposal } from '@riaya/shared';
import { ProposalCard } from './ProposalCard';
import { proposalToRest } from './proposals';

const note: AssistantProposal = {
  id: 'n1',
  action: 'add_clinical_note',
  preview: 'Add a note',
  params: { patientId: 'p1', note: 'Line one\nLine two' },
  warning: 'patient_supplied_content',
};
const summary: AssistantProposal = {
  id: 's1',
  action: 'save_summary',
  preview: 'Save',
  params: {
    patientId: 'p1',
    content: 'Clinician text',
    patientContent: 'Patient text',
    visibleToPatient: false,
  },
};

const noop = () => undefined;
const card = (proposal: AssistantProposal, onConfirm = jest.fn()) => {
  render(
    <ProposalCard
      state={{ proposal, status: 'pending' }}
      onConfirm={onConfirm}
      onDismiss={noop}
      onSuggest={noop}
    />,
  );
  return onConfirm;
};

describe('ProposalCard', () => {
  it('shows the exact payload and blocks Confirm until the warning is acknowledged', () => {
    const onConfirm = card(note);
    expect(screen.getByRole('alert').textContent).toContain(
      'assistant.proposal.patientContentWarning',
    );
    expect(screen.getByText(/Line one/).textContent).toBe('Line one\nLine two');
    const confirm = screen.getByRole('button', { name: 'assistant.proposal.confirm' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('assistant.proposal.reviewed'));
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('publishes to the patient only when the box is ticked', () => {
    const onConfirm = card(summary);
    const box = screen.getByLabelText('assistant.proposal.publish') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'assistant.proposal.confirm' }));
    expect(onConfirm).toHaveBeenLastCalledWith({ publishToPatient: false });
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: 'assistant.proposal.confirm' }));
    expect(onConfirm).toHaveBeenLastCalledWith({ publishToPatient: true });
  });
});

describe('save_summary visibility', () => {
  const env = { audience: 'staff' as const, defaultReason: '' };
  it('is never visible unless explicitly published', () => {
    expect(proposalToRest(summary, env).body?.visibleToPatient).toBe(false);
    expect(proposalToRest(summary, { ...env, publishToPatient: true }).body?.visibleToPatient).toBe(
      true,
    );
  });
});
