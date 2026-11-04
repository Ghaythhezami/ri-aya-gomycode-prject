import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ERROR_MESSAGES } from '@riaya/shared';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * TEST-091 → AC-001, TEST-092 → AC-002, TEST-093 → AC-003, TEST-094 → AC-004.
 */

function run(exception: unknown, acceptLanguage?: string) {
  const json = jest.fn();
  const response = {
    status: jest.fn(() => ({ json })),
    getHeader: () => undefined,
  };
  const request = {
    method: 'GET',
    url: '/probe',
    headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {},
    id: 'req-1',
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  };

  new HttpExceptionFilter().catch(exception, host as never);
  return json.mock.calls[0][0] as {
    code: string;
    message: string;
    details: unknown;
    requestId: string | null;
  };
}

describe('HttpExceptionFilter localization', () => {
  it('AC-001: a supported Accept-Language localizes the message and keeps the code', () => {
    const body = run(
      new ForbiddenException({ code: 'FORBIDDEN', message: 'English text' }),
      'ar-EG,ar;q=0.9,en;q=0.5',
    );

    expect(body.code).toBe('FORBIDDEN');
    expect(body.message).toBe(ERROR_MESSAGES.ar.FORBIDDEN);
    expect(body.message).not.toBe('English text');
  });

  it('AC-002: a missing or unsupported language falls back to English', () => {
    const exception = new ForbiddenException({ code: 'FORBIDDEN', message: 'English text' });

    expect(run(exception).message).toBe(ERROR_MESSAGES.en.FORBIDDEN);
    expect(run(exception, 'de').message).toBe(ERROR_MESSAGES.en.FORBIDDEN);
    expect(run(exception, 'fr-CA').message).toBe(ERROR_MESSAGES.fr.FORBIDDEN);
  });

  it('AC-003: an unknown code keeps the message the exception carried', () => {
    const body = run(
      new BadRequestException({ code: 'SOMETHING_NEW', message: 'A bespoke message' }),
      'ar',
    );

    expect(body.code).toBe('SOMETHING_NEW');
    expect(body.message).toBe('A bespoke message');
  });

  it('AC-004: a validation failure keeps its details and localizes the summary', () => {
    const body = run(
      new BadRequestException({ message: ['email must be an email', 'password too short'] }),
      'fr',
    );

    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe(ERROR_MESSAGES.fr.VALIDATION_ERROR);
    expect(body.details).toEqual(['email must be an email', 'password too short']);
  });
});
