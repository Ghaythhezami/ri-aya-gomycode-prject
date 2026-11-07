import { budgetTokens } from './ai.constants';
import { AiGuardRailsService } from './ai-guard-rails.service';
import { AssistantController } from './assistant.controller';
import { PortalAssistantController } from './portal-assistant.controller';
import { AssistantSessionService } from './assistant-session.service';
import { AiBudgetExceededException } from './ai-errors';
import { renderMessages, ConversationStore } from './conversation.store';
import { runSse } from './sse';

function guard(
  opts: {
    enabled?: boolean;
    used?: number;
    clinicOn?: boolean;
    consent?: boolean;
    verified?: boolean;
    storeDown?: boolean;
  } = {},
) {
  const store = new Map<string, number>();
  if (opts.used !== undefined) {
    store.set(`ai:budget:clinic-1:${new Date().toISOString().slice(0, 10)}`, opts.used);
  }
  const counters = new Map<string, number>();
  const down = () => Promise.reject(new Error('store down'));
  const cache = {
    getStrict: jest.fn((k: string) =>
      opts.storeDown ? down() : Promise.resolve(store.get(k) ?? null),
    ),
    incrementByStrict: jest.fn((k: string, by: number) => {
      if (opts.storeDown) return down();
      store.set(k, (store.get(k) ?? 0) + by);
      return Promise.resolve(store.get(k)!);
    }),
    incrementStrict: jest.fn((k: string) => {
      if (opts.storeDown) return down();
      counters.set(k, (counters.get(k) ?? 0) + 1);
      return Promise.resolve(counters.get(k)!);
    }),
  };
  const prisma = {
    clinicSettings: {
      findUnique: jest.fn().mockResolvedValue({ aiAssistantsEnabled: opts.clinicOn ?? true }),
    },
    patientAccount: {
      findFirst: jest.fn().mockResolvedValue({
        aiConsentAt: opts.consent ? new Date() : null,
        emailVerifiedAt: (opts.verified ?? true) ? new Date() : null,
      }),
    },
  };
  const provider = { enabled: opts.enabled ?? true };
  return {
    service: new AiGuardRailsService(provider as never, prisma as never, cache as never),
    cache,
    store,
    provider,
  };
}

describe('AiGuardRailsService', () => {
  const original = process.env.AI_DAILY_TOKEN_BUDGET;
  afterEach(() => {
    if (original === undefined) delete process.env.AI_DAILY_TOKEN_BUDGET;
    else process.env.AI_DAILY_TOKEN_BUDGET = original;
    delete process.env.THROTTLE_STRICT;
  });

  it('answers 503 AI_UNAVAILABLE without an API key', () => {
    const { service } = guard({ enabled: false });
    expect(() => service.assertConfigured()).toThrow(
      expect.objectContaining({
        status: 503,
        response: expect.objectContaining({ code: 'AI_UNAVAILABLE' }),
      }),
    );
  });

  it('answers 503 when the clinic switched the assistants off', async () => {
    const { service } = guard({ clinicOn: false });
    await expect(service.assertClinicEnabled('clinic-1')).rejects.toMatchObject({ status: 503 });
  });

  it('requires AI consent for patients', async () => {
    await expect(
      guard({ consent: false }).service.assertPatientConsent('a', 'clinic-1'),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: 'CONSENT_REQUIRED' }),
    });
    await expect(
      guard({ consent: true }).service.assertPatientConsent('a', 'clinic-1'),
    ).resolves.toBeUndefined();
  });

  it('answers 429 AI_BUDGET_EXCEEDED once the daily token budget is used', async () => {
    process.env.AI_DAILY_TOKEN_BUDGET = '1000';
    const { service } = guard({ used: 1000 });
    await expect(service.assertBudget('clinic-1')).rejects.toBeInstanceOf(
      AiBudgetExceededException,
    );
    await expect(service.assertBudget('clinic-1')).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({ code: 'AI_BUDGET_EXCEEDED' }),
    });
    await expect(guard({ used: 999 }).service.assertBudget('clinic-1')).resolves.toBeUndefined();
  });

  it('reserves tokens atomically and rejects when the reserved total passes the daily limit', async () => {
    process.env.AI_DAILY_TOKEN_BUDGET = '30000';
    const { service, store } = guard();
    await expect(service.reserve('clinic-1', null, 20_000)).resolves.toMatchObject({
      tokens: 20_000,
    });
    await expect(service.reserve('clinic-1', null, 20_000)).rejects.toBeInstanceOf(
      AiBudgetExceededException,
    );
    // The failed reservation was rolled back.
    const key = [...store.keys()].find((k) => k.startsWith('ai:budget:clinic-1:'))!;
    expect(store.get(key)).toBe(20_000);
  });

  it('settles a reservation to the real usage', async () => {
    const { service, store } = guard();
    const r = await service.reserve('clinic-1', null, 20_000);
    await service.settle(r, 1_200);
    const key = [...store.keys()].find((k) => k.startsWith('ai:budget:clinic-1:'))!;
    expect(store.get(key)).toBe(1_200);
  });

  it('caps a patient account at AI_PATIENT_DAILY_TOKEN_BUDGET (default 250000) and releases the clinic share', async () => {
    const { service, store } = guard();
    expect(service.patientDailyBudget).toBe(250_000);
    await service.reserve('clinic-1', 'acc-1', 150_000);
    await expect(service.reserve('clinic-1', 'acc-1', 150_000)).rejects.toBeInstanceOf(
      AiBudgetExceededException,
    );
    const clinicKey = [...store.keys()].find((k) => k.startsWith('ai:budget:clinic-1:'))!;
    expect(store.get(clinicKey)).toBe(150_000);
    const patientKey = [...store.keys()].find((k) => k.startsWith('ai:budget:patient:acc-1:'))!;
    expect(store.get(patientKey)).toBe(150_000);
  });

  it('fails closed with 503 AI_UNAVAILABLE when the security-state store is down', async () => {
    process.env.THROTTLE_STRICT = '1';
    const { service } = guard({ storeDown: true });
    const unavailable = {
      status: 503,
      response: expect.objectContaining({ code: 'AI_UNAVAILABLE' }),
    };
    await expect(service.consumeRate('STAFF_USER:u1')).rejects.toMatchObject(unavailable);
    await expect(service.reserve('clinic-1', null, 100)).rejects.toMatchObject(unavailable);
    await expect(service.assertBudget('clinic-1')).rejects.toMatchObject(unavailable);
  });

  it('requires a clinic-verified account (VERIFICATION_REQUIRED)', async () => {
    await expect(
      guard({ verified: false }).service.assertPatientVerified('a', 'clinic-1'),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: 'VERIFICATION_REQUIRED' }),
    });
    await expect(
      guard({ verified: true }).service.assertPatientVerified('a', 'clinic-1'),
    ).resolves.toBeUndefined();
  });

  it('limits an actor to 20 chat requests per minute', async () => {
    process.env.THROTTLE_STRICT = '1';
    const { service } = guard();
    for (let i = 0; i < 20; i++) await service.consumeRate('STAFF_USER:u1');
    await expect(service.consumeRate('STAFF_USER:u1')).rejects.toMatchObject({ status: 429 });
    await expect(service.consumeRate('STAFF_USER:u2')).resolves.toBeUndefined();
  });
});

describe('controllers', () => {
  const principal = {
    accountId: 'acc',
    patientId: 'p',
    clinicId: 'clinic-1',
    locale: 'en' as const,
  };

  it('answers the budget error directly as 429 AI_BUDGET_EXCEEDED JSON (the global filter would rename it)', async () => {
    const engine = {
      prepare: jest.fn().mockRejectedValue(new AiBudgetExceededException()),
      stream: jest.fn(),
    };
    const sessions = { patientSession: jest.fn().mockResolvedValue({}) };
    const controller = new PortalAssistantController(
      engine as never,
      sessions as never,
      {} as never,
      {} as never,
      { get: () => principal } as never,
    );
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.chat({ message: 'hi' }, res as never);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AI_BUDGET_EXCEEDED' }));
    expect(engine.stream).not.toHaveBeenCalled();
  });

  it('staff controller does the same and conversation routes answer 503 without a key', async () => {
    const engine = { prepare: jest.fn().mockRejectedValue(new AiBudgetExceededException()) };
    const sessions = { staffSession: jest.fn().mockResolvedValue({}), staffPersona: jest.fn() };
    const { service } = guard({ enabled: false });
    const tenant = { get: () => ({ clinicId: 'clinic-1', userId: 'u1' }) };
    const controller = new AssistantController(
      engine as never,
      sessions as never,
      {} as never,
      service,
      tenant as never,
    );
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.chat({ message: 'hi' }, { firstName: 'a' } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(429);
    await expect(controller.conversations()).rejects.toMatchObject({ status: 503 });
  });

  it('status explains why the assistant is off', async () => {
    const off = guard({ enabled: false });
    const sessions = new AssistantSessionService(
      {} as never,
      {} as never,
      {} as never,
      off.service,
    );
    await expect(sessions.patientStatus(principal)).resolves.toEqual({
      enabled: false,
      persona: null,
      reason: 'NOT_CONFIGURED',
    });
    const noConsent = guard({ consent: false });
    const s2 = new AssistantSessionService(
      {} as never,
      {} as never,
      {} as never,
      noConsent.service,
    );
    await expect(s2.patientStatus(principal)).resolves.toEqual({
      enabled: false,
      persona: 'patient',
      reason: 'CONSENT_REQUIRED',
    });
    const ok = guard({ consent: true });
    const s3 = new AssistantSessionService({} as never, {} as never, {} as never, ok.service);
    await expect(s3.patientStatus(principal)).resolves.toEqual({
      enabled: true,
      persona: 'patient',
      reason: null,
    });
  });

  it('staff persona: doctor by base role, or by clinical access plus a doctor profile', async () => {
    const mk = (role: string, caps: string[], profile: boolean) =>
      new AssistantSessionService(
        {
          doctor: { findFirst: jest.fn().mockResolvedValue(profile ? { id: 'd1' } : null) },
        } as never,
        { capabilitiesFor: jest.fn().mockResolvedValue(caps) } as never,
        {} as never,
        {} as never,
      ).staffPersona({ clinicId: 'c', userId: 'u', role } as never);
    expect((await mk('DOCTOR', ['viewOverview'], false)).persona).toBe('doctor');
    expect((await mk('CLINIC_ADMIN', ['readClinicalNotes', 'viewScheduling'], true)).persona).toBe(
      'doctor',
    );
    expect((await mk('CLINIC_ADMIN', ['readClinicalNotes', 'viewScheduling'], false)).persona).toBe(
      'staff',
    );
    expect((await mk('RECEPTIONIST', ['viewScheduling'], true)).persona).toBe('staff');
  });
});

describe('conversations and SSE', () => {
  it('renders tool plumbing away and merges an answer into one assistant message with its proposals', () => {
    const proposal = {
      id: 'p1',
      action: 'check_in',
      preview: 'x',
      params: { appointmentId: 'a' },
    } as never;
    const rendered = renderMessages([
      { role: 'user', content: 'check in Ann' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking. ' },
          { type: 'tool_use', id: 't', name: 'n', input: {} },
        ],
        proposals: [proposal],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: '{}' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Please confirm.' }] },
    ]);
    expect(rendered).toHaveLength(2);
    expect(rendered[1]).toEqual({
      role: 'assistant',
      text: 'Checking. \n\nPlease confirm.',
      proposals: [proposal],
    });
  });

  it('loads a conversation only for its own actor and persona (else 404)', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const store = new ConversationStore({ aiConversation: { findFirst } } as never);
    await expect(
      store.load({ clinicId: 'clinic-1', type: 'STAFF_USER', id: 'u1' }, 'staff', 'c1'),
    ).rejects.toMatchObject({ status: 404 });
    expect(findFirst.mock.calls[0]![0].where).toEqual({
      id: 'c1',
      clinicId: 'clinic-1',
      actorType: 'STAFF_USER',
      actorId: 'u1',
      persona: 'staff',
    });
  });

  it('writes SSE frames with the streaming headers and aborts the run on disconnect', async () => {
    const headers: Record<string, string> = {};
    const written: string[] = [];
    let closeHandler: () => void = () => undefined;
    const res = {
      writableEnded: false,
      status: jest.fn(),
      setHeader: (k: string, v: string) => (headers[k] = v),
      flushHeaders: jest.fn(),
      on: (_e: string, h: () => void) => (closeHandler = h),
      write: (s: string) => written.push(s),
      end: jest.fn(function (this: { writableEnded: boolean }) {
        this.writableEnded = true;
      }),
    };
    let aborted = false;
    await runSse(res as never, async (emit, signal) => {
      emit({ event: 'text', data: { delta: 'hi' } });
      closeHandler();
      aborted = signal.aborted;
      emit({ event: 'text', data: { delta: 'ignored' } });
    });
    expect(headers['Content-Type']).toContain('text/event-stream');
    expect(headers['Cache-Control']).toContain('no-cache');
    expect(headers['X-Accel-Buffering']).toBe('no');
    expect(written).toEqual(['event: text\ndata: {"delta":"hi"}\n\n']);
    expect(aborted).toBe(true);
    expect(res.end).toHaveBeenCalled();
  });
});

describe('budgetTokens', () => {
  it('counts cache reads at a tenth and everything else in full', () => {
    expect(
      budgetTokens({
        input_tokens: 100,
        cache_creation_input_tokens: 2000,
        cache_read_input_tokens: 5001,
        output_tokens: 300,
      }),
    ).toBe(100 + 2000 + 501 + 300);
    expect(budgetTokens({ input_tokens: 10, output_tokens: 5 })).toBe(15);
  });
});
