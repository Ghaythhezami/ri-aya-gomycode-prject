import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { SmtpMailService } from './smtp-mail.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const TOKEN = 'a'.repeat(64);
const ACCEPT_URL = `https://app.riaya.test/accept-invite?token=${TOKEN}&organizationId=org-1&clinicId=clinic-1&role=DOCTOR`;

const ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'] as const;

describe('SMTP invitation delivery (AC-046)', () => {
  const original: Record<string, string | undefined> = {};
  const sendMail = jest.fn();
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeAll(() => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
    process.env.SMTP_HOST = 'sandbox.smtp.mailtrap.test';
    process.env.SMTP_PORT = '2525';
    process.env.SMTP_USER = 'mailtrap-user';
    process.env.SMTP_PASSWORD = 'mailtrap-pass';
    process.env.MAIL_FROM = "RI'AYA <no-reply@riaya.test>";
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({});
    (createTransport as jest.Mock).mockReset();
    (createTransport as jest.Mock).mockReturnValue({ sendMail });
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('AC-046: sends through SMTP configured from environment variables and never logs the token', async () => {
    const service = new SmtpMailService();

    const outcome = await service.sendInvitation({
      email: 'invitee@riaya.test',
      acceptUrl: ACCEPT_URL,
      clinicName: 'Bright Clinic',
      role: 'DOCTOR',
      locale: 'en',
    });

    expect(outcome).toEqual({ status: 'SENT' });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'sandbox.smtp.mailtrap.test',
        port: 2525,
        secure: false,
        auth: { user: 'mailtrap-user', pass: 'mailtrap-pass' },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "RI'AYA <no-reply@riaya.test>",
        to: 'invitee@riaya.test',
        html: expect.stringContaining(ACCEPT_URL.replace(/&/g, '&amp;')),
        text: expect.stringContaining(ACCEPT_URL),
      }),
    );

    // A provider failure is reported as an outcome, not thrown, and the token
    // must never leak into the log line.
    sendMail.mockRejectedValueOnce(new Error('SMTP auth failed'));
    await expect(
      service.sendInvitation({
        email: 'invitee@riaya.test',
        acceptUrl: ACCEPT_URL,
        clinicName: 'Bright Clinic',
        role: 'DOCTOR',
        locale: 'en',
      }),
    ).resolves.toEqual({ status: 'FAILED', error: 'SMTP auth failed' });

    const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((value) => String(value))
      .join(' ');
    expect(logged).not.toContain(TOKEN);
  });
});
