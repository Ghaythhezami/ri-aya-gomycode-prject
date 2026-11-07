import { ConsoleMailService } from './mail.service';
import { createMailService } from './mail.module';
import {
  isDeliverable,
  MailNotDeliverableError,
  MailProviderError,
  ResendMailService,
} from './resend-mail.service';
import { appointmentEmail, asMailLocale, escapeHtml, passwordResetEmail } from './templates';
import { formatWhen } from '../notifications/appointment-mailer.service';
import { MailReminderProvider, type ReminderMessage } from '../notifications/reminder.provider';

function fakeFetch(status = 200, body: unknown = { id: 'em_1' }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('mail templates', () => {
  it('escapes every interpolated value', () => {
    const email = appointmentEmail({
      locale: 'en',
      kind: 'confirmation',
      clinicName: '<script>alert(1)</script>',
      doctorName: 'Dr. "Quote"',
      when: 'Monday',
      code: 'AP-1',
      manageUrl: 'javascript:alert(1)',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('Dr. &quot;Quote&quot;');
    // Non-http links are dropped, so no button.
    expect(email.html).not.toContain('javascript:');
    expect(escapeHtml(`a&b<'`)).toBe('a&amp;b&lt;&#39;');
  });

  it('renders Arabic right to left with the reset link and expiry', () => {
    const email = passwordResetEmail({
      locale: 'ar',
      clinicName: 'عيادة',
      resetUrl: 'https://riaya-app.vercel.app/reset-password?token=abc',
      minutes: 30,
    });
    expect(email.html).toContain('dir="rtl"');
    expect(email.html).toContain('href="https://riaya-app.vercel.app/reset-password?token=abc"');
    expect(email.subject).toContain('كلمة مرور');
    expect(email.text).toContain('30');
  });

  it('has a subject per kind and locale', () => {
    for (const kind of ['confirmation', 'reminder', 'cancelled', 'rescheduled'] as const) {
      for (const locale of ['en', 'fr', 'ar'] as const) {
        const e = appointmentEmail({
          locale,
          kind,
          clinicName: 'C',
          doctorName: 'D',
          when: 'W',
          code: 'AP-9',
        });
        expect(e.subject).toContain('W');
        expect(e.text).toContain('AP-9');
      }
    }
    expect(asMailLocale('fr-FR')).toBe('fr');
    expect(asMailLocale(undefined)).toBe('en');
  });

  it('formats the time in the clinic zone and locale', () => {
    const at = new Date('2026-11-09T06:30:00Z');
    expect(formatWhen(at, 'Asia/Dubai', 'en')).toContain('10:30');
    expect(formatWhen(at, 'Asia/Dubai', 'fr')).toContain('novembre');
    expect(formatWhen(at, 'Asia/Dubai', 'ar')).toContain('10:30');
  });
});

describe('ResendMailService', () => {
  it('posts to Resend with the key, sender, both bodies and a tag', async () => {
    const f = fakeFetch();
    const svc = new ResendMailService('re_test', "RI'AYA <noreply@riaya.test-sender.com>", f.impl);
    await svc.sendPasswordReset('reda@gmail.com', 'https://x.test/r?token=1', 'fr');
    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test');
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(['reda@gmail.com']);
    expect(body.from).toContain('noreply@');
    expect(body.subject).toContain('mot de passe');
    expect(body.html).toContain('https://x.test/r?token=1');
    expect(body.text).toContain('https://x.test/r?token=1');
    expect(body.tags).toEqual([{ name: 'category', value: 'password-reset' }]);
  });

  it('sets a stable idempotency key on appointment mails', async () => {
    const f = fakeFetch();
    const svc = new ResendMailService('re_test', undefined, f.impl);
    const m = {
      to: 'p@gmail.com',
      locale: 'en' as const,
      kind: 'reminder' as const,
      clinicName: 'C',
      doctorName: 'D',
      when: 'Mon 10:30',
      code: 'AP-1',
    };
    await svc.sendAppointmentEmail(m);
    await svc.sendAppointmentEmail(m);
    const keys = f.calls.map((c) => (c.init.headers as Record<string, string>)['idempotency-key']);
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(keys[0]).toBe(keys[1]);
  });

  it('never sends to reserved demo domains', async () => {
    const f = fakeFetch();
    const svc = new ResendMailService('re_test', undefined, f.impl);
    await expect(
      svc.sendPasswordReset('doctor@riaya.local', 'https://x.test'),
    ).rejects.toBeInstanceOf(MailNotDeliverableError);
    await expect(
      svc.sendPasswordReset('amira.khan@example.com', 'https://x.test'),
    ).rejects.toBeInstanceOf(MailNotDeliverableError);
    expect(f.calls).toHaveLength(0);
    expect(isDeliverable('ops@centralclinic.example')).toBe(false);
    expect(isDeliverable('someone@test')).toBe(false);
    expect(isDeliverable('reda.eu99@gmail.com')).toBe(true);
    expect(isDeliverable('no-at-sign')).toBe(false);
  });

  it('throws a provider error with the status when Resend rejects', async () => {
    const f = fakeFetch(403, { name: 'validation_error', message: 'domain not verified' });
    const svc = new ResendMailService('re_test', undefined, f.impl);
    const err = await svc.sendPasswordReset('a@gmail.com', 'https://x.test').catch((e) => e);
    expect(err).toBeInstanceOf(MailProviderError);
    expect((err as MailProviderError).status).toBe(403);
    expect((err as Error).message).not.toContain('a@gmail.com');
  });
});

describe('createMailService', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('uses the console transport without a key and Resend with one', () => {
    delete process.env.RESEND_API_KEY;
    expect(createMailService()).toBeInstanceOf(ConsoleMailService);
    process.env.RESEND_API_KEY = 're_x';
    expect(createMailService()).toBeInstanceOf(ResendMailService);
  });
});

describe('MailReminderProvider', () => {
  const msg = (channel: 'SMS' | 'EMAIL'): ReminderMessage => ({
    deliveryId: '0123abcd-0000-4000-8000-000000000000',
    appointmentId: 'a1',
    channel,
    to: 'p@gmail.com',
    appointmentCode: 'AP-1',
    startsAt: new Date(),
  });

  it('keeps the deterministic mock without a mail key', async () => {
    const mailer = { compose: jest.fn() };
    const provider = new MailReminderProvider(new ConsoleMailService(), mailer as never);
    await expect(provider.send(msg('EMAIL'))).resolves.toMatch(/^mock-email-/);
    expect(mailer.compose).not.toHaveBeenCalled();
  });

  it('sends e-mail reminders through Resend and fails when no address is deliverable', async () => {
    const f = fakeFetch();
    const mail = new ResendMailService('re_x', undefined, f.impl);
    const email = {
      to: 'p@gmail.com',
      locale: 'en' as const,
      kind: 'reminder' as const,
      clinicName: 'C',
      doctorName: 'D',
      when: 'W',
      code: 'AP-1',
    };
    const mailer = { compose: jest.fn().mockResolvedValueOnce(email).mockResolvedValueOnce(null) };
    const provider = new MailReminderProvider(mail, mailer as never);
    await expect(provider.send(msg('EMAIL'))).resolves.toMatch(/^resend-/);
    expect(mailer.compose).toHaveBeenCalledWith('a1', 'reminder');
    expect(f.calls).toHaveLength(1);
    await expect(provider.send(msg('EMAIL'))).rejects.toBeInstanceOf(MailNotDeliverableError);
    await expect(provider.send(msg('SMS'))).resolves.toMatch(/^mock-sms-/);
  });
});
