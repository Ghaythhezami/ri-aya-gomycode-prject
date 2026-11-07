import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { AssistantPanel } from './AssistantPanel';
import type { AssistantClient } from './client';

const send = jest.fn();
jest.mock('./useAssistantChat', () => ({
  useAssistantChat: () => ({
    messages: [],
    streaming: false,
    error: null,
    conversationId: null,
    send,
    stop: jest.fn(),
    reset: jest.fn(),
    open: jest.fn(),
    confirm: jest.fn(),
    dismiss: jest.fn(),
  }),
  useConversations: () => ({ items: [], failed: false, reload: jest.fn(), remove: jest.fn() }),
}));

const client = {} as AssistantClient;
const panel = (persona: 'staff' | 'doctor' | 'patient', patientId?: string) =>
  render(
    <MemoryRouter>
      <AssistantPanel
        persona={persona}
        client={client}
        context={patientId ? { patientId } : undefined}
      />
    </MemoryRouter>,
  );

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  send.mockReset();
});

describe('AssistantPanel prompt templates', () => {
  it('sends a complete template straight away', () => {
    panel('staff');
    fireEvent.click(screen.getByRole('button', { name: /Longest wait/ }));
    expect(send).toHaveBeenCalledWith('Who is waiting longest right now, and with which doctor?');
  });

  it('puts a template with a blank in the composer and selects the blank', () => {
    panel('staff');
    fireEvent.click(screen.getByRole('button', { name: /Find a free slot/ }));
    expect(send).not.toHaveBeenCalled();
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(box.value).toBe('Find the next free [specialty] slot this week.');
    expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe('[specialty]');
    expect(document.activeElement).toBe(box);
  });

  it('offers "this patient" templates to a doctor on a patient page', () => {
    panel('doctor', '00000000-0000-4000-8000-000000000123');
    expect(screen.getByRole('button', { name: /Summarize this patient/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Pre-visit summary/ })).toBeNull();
  });

  it('opens the template library mid-conversation from the composer', () => {
    panel('patient');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Prompt templates' }));
    });
    expect(screen.getByRole('heading', { name: 'Prompt templates' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Opening hours/ }));
    expect(send).toHaveBeenCalledWith("What are the clinic's opening hours?");
  });
});
