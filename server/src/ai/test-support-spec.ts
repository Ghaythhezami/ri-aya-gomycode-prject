import type { AssistantStreamEvent } from '@riaya/shared';
import type { Capability } from '@riaya/shared';
import { AssistantToolsService } from './tools/assistant-tools.service';
import type { ToolActor } from './tools/tool-types';

/** Test doubles for the Claude streaming client (never the real API). */

export interface FakeBlock {
  type: string;
  [key: string]: unknown;
}

export interface FakeMessage {
  stop_reason: string;
  content: FakeBlock[];
  usage?: { input_tokens: number; output_tokens: number };
}

/** A scripted client: each `stream()` call plays the next message. */
export function fakeAnthropic(script: FakeMessage[]) {
  const requests: Record<string, unknown>[] = [];
  const stream = jest.fn((params: Record<string, unknown>) => {
    // Snapshot: the engine keeps appending to the same arrays between rounds.
    requests.push(JSON.parse(JSON.stringify(params)) as Record<string, unknown>);
    const message = script.shift();
    if (!message) throw new Error('script exhausted');
    const listeners: ((delta: string) => void)[] = [];
    return {
      on(event: string, cb: (delta: string) => void) {
        if (event === 'text') listeners.push(cb);
        return this;
      },
      async finalMessage() {
        for (const block of message.content) {
          if (block.type === 'text') listeners.forEach((l) => l(block.text as string));
        }
        return { usage: { input_tokens: 10, output_tokens: 5 }, ...message };
      },
      abort() {},
    };
  });
  const provider = {
    enabled: true,
    model: 'claude-test',
    client: { beta: { messages: { stream } } },
  };
  return { provider, stream, requests };
}

export const text = (t: string): FakeBlock => ({ type: 'text', text: t });
export const toolUse = (id: string, name: string, input: unknown): FakeBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
});

export function collect() {
  const events: AssistantStreamEvent[] = [];
  return { events, emit: (e: AssistantStreamEvent) => events.push(e) };
}

export function staffActor(caps: Capability[], over: Partial<ToolActor> = {}): ToolActor {
  return {
    persona: 'staff',
    clinicId: 'clinic-1',
    timezone: 'UTC',
    locale: 'en',
    capabilities: new Set(caps),
    userId: 'user-1',
    role: 'RECEPTIONIST',
    doctorId: null,
    now: new Date('2026-11-07T08:00:00Z'),
    ...over,
  };
}

export function patientActor(over: Partial<ToolActor> = {}): ToolActor {
  return {
    persona: 'patient',
    clinicId: 'clinic-1',
    timezone: 'UTC',
    locale: 'en',
    capabilities: new Set(),
    patientId: 'patient-1',
    accountId: 'account-1',
    now: new Date('2026-11-07T08:00:00Z'),
    ...over,
  };
}

/** Real tool catalogue over fake collaborators; `prisma` is whatever the test needs. */
export function toolsWith(
  prisma: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): AssistantToolsService {
  const settings = {
    get: jest.fn().mockResolvedValue({
      clinic: { name: 'Clinic', address: 'Main St', timezone: 'UTC' },
      cancellationNoticeHours: 2,
      slotMinutes: 15,
      openingHours: [],
      phone: null,
      contactEmail: null,
      defaultLanguage: 'en',
    }),
  };
  const data = {
    appointmentTypes: jest.fn().mockResolvedValue([
      { code: 'CONSULTATION', name: 'Consultation', durationMinutes: 30, isEmergency: false },
      { code: 'EMERGENCY', name: 'Emergency', durationMinutes: 20, isEmergency: true },
    ]),
    isSlotFree: jest.fn().mockResolvedValue({ free: true, doctorName: 'Dr. Who' }),
    findSlots: jest.fn().mockResolvedValue({ timezone: 'UTC', slots: [] }),
    slotToJson: jest.fn(),
    ...extra,
  };
  return new AssistantToolsService(
    prisma as never,
    data as never,
    settings as never,
    { snapshot: jest.fn() } as never,
    { list: jest.fn() } as never,
    {} as never,
    { get: jest.fn() } as never,
  );
}
