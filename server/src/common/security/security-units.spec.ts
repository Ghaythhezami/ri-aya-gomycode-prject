import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import pinoHttp from 'pino-http';
import { CLINIC_ERROR_CODES, ERROR_MESSAGES, SUPPORTED_LOCALES, type Locale } from '@riaya/shared';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { REDACT_CENSOR, REDACT_PATHS, pathOnly } from '../../logging/logging.config';
import { resolveJwtSecret } from '../../auth/jwt-secret';
import { LoginDto } from '../../auth/dto/login.dto';
import { RegisterDto } from '../../tenancy/dto/register.dto';
import { BulkActionDto } from '../../appointments/dto/appointment.dto';
import { PaginationQueryDto } from '../pagination';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn((_code: number) => ({ json }));
  const response = { status, getHeader: () => undefined };
  const request = { method: 'GET', url: '/probe?search=Jane', headers: {}, id: 'req-1' };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return {
    status: status.mock.calls[0]![0],
    body: json.mock.calls[0]![0] as { code: string; message: string; details: unknown },
  };
}

class FakePrismaError extends Error {
  constructor(
    name: string,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = name;
  }
}

describe('HttpExceptionFilter hardening', () => {
  const leak =
    'Invalid `prisma.patient.create()` invocation: SELECT "patients"."phone" ... +962790000000';

  it('maps P2025 to 404 NOT_FOUND', () => {
    const { status, body } = run(
      new FakePrismaError('PrismaClientKnownRequestError', 'P2025', leak),
    );
    expect(status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(JSON.stringify(body)).not.toContain('prisma');
  });

  it('maps P2002 to 409 CONFLICT without the constraint details', () => {
    const { status, body } = run(
      new FakePrismaError('PrismaClientKnownRequestError', 'P2002', leak),
    );
    expect(status).toBe(409);
    expect(body.code).toBe('CONFLICT');
    expect(JSON.stringify(body)).not.toContain('962790000000');
  });

  it('maps any other Prisma or driver error to a generic 500 INTERNAL_ERROR', () => {
    for (const name of ['PrismaClientKnownRequestError', 'PrismaClientValidationError']) {
      const { status, body } = run(new FakePrismaError(name, 'P2022', leak));
      expect(status).toBe(500);
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(body.message).toBe(ERROR_MESSAGES.en.INTERNAL_ERROR);
      expect(body.details).toBeNull();
      expect(JSON.stringify(body)).not.toMatch(/SELECT|prisma|patients/i);
    }
    const plain = run(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    expect(plain.status).toBe(500);
    expect(JSON.stringify(plain.body)).not.toContain('ECONNREFUSED');
  });

  it('maps the throttler exception to 429 RATE_LIMITED', () => {
    const { status, body } = run(new ThrottlerException());
    expect(status).toBe(429);
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.message).toBe(ERROR_MESSAGES.en.RATE_LIMITED);
  });

  it('localises validation failures', () => {
    const { status, body } = run(new BadRequestException(['email must be an email']));
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe(ERROR_MESSAGES.en.VALIDATION_ERROR);
  });
});

describe('error catalogue', () => {
  const required: string[] = [
    ...CLINIC_ERROR_CODES,
    'VALIDATION_ERROR',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'CONFLICT',
    'UNAUTHENTICATED',
    'INVALID_CREDENTIALS',
    'ACCOUNT_LOCKED',
    'INVALID_TOKEN',
    'SECURITY_STATE_UNAVAILABLE',
    'SIGNUP_RETIRED',
    'UNAUTHORIZED',
  ];

  it.each(SUPPORTED_LOCALES as readonly Locale[])('has every code in %s', (locale) => {
    for (const code of required) {
      expect(ERROR_MESSAGES[locale][code]).toBeTruthy();
    }
  });
});

describe('log redaction (NFR: no personal data in logs)', () => {
  it('censors credentials and patient identifiers at any depth in req/res', () => {
    const lines: string[] = [];
    const { logger } = pinoHttp({ redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR } }, {
      write: (line: string) => lines.push(line),
    } as never);
    logger.info({
      req: {
        headers: { authorization: 'Bearer abc', cookie: 'refresh_token=xyz' },
        body: { password: 'hunter2', phone: '+962790000000' },
      },
      res: { headers: { 'set-cookie': ['refresh_token=xyz'] } },
      patient: { phone: '+962790000000', email: 'jane@example.com', dateOfBirth: '1990-01-01' },
      nested: { a: { clinicalNotes: 'diagnosis X', password: 'p' } },
    });
    const out = lines.join('');
    for (const secret of [
      'Bearer abc',
      'refresh_token=xyz',
      'hunter2',
      '962790000000',
      'jane@example.com',
      '1990-01-01',
      'diagnosis X',
    ]) {
      expect(out).not.toContain(secret);
    }
  });

  it('drops the query string (search terms) from logged URLs', () => {
    expect(pathOnly('/api/patients?search=Jane%20Doe&phone=0790')).toBe('/api/patients');
    expect(pathOnly('/api/health')).toBe('/api/health');
  });
});

describe('JWT secret', () => {
  const config = (values: Record<string, string>) => ({
    get: (key: string) => values[key],
  });

  it('refuses a missing, default or short secret in production', () => {
    const dev = 'dev-access-secret-change-me-32chars';
    expect(() => resolveJwtSecret(config({ NODE_ENV: 'production' }) as never)).toThrow();
    expect(() =>
      resolveJwtSecret(config({ NODE_ENV: 'production', JWT_ACCESS_SECRET: dev }) as never),
    ).toThrow();
    expect(() =>
      resolveJwtSecret(config({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'short' }) as never),
    ).toThrow();
    expect(
      resolveJwtSecret(
        config({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'x'.repeat(40) }) as never,
      ),
    ).toBe('x'.repeat(40));
  });
});

describe('DTO limits', () => {
  it('rejects oversized credentials (argon2 DoS) and names', async () => {
    const login = plainToInstance(LoginDto, { email: 'a@b.co', password: 'p'.repeat(129) });
    expect((await validate(login)).length).toBeGreaterThan(0);

    const register = plainToInstance(RegisterDto, {
      email: 'a@b.co',
      password: 'Sup3rSecret!!',
      firstName: 'x'.repeat(101),
      lastName: 'Doe',
      organizationName: 'Org',
      clinicName: 'Clinic',
    });
    expect((await validate(register)).map((e) => e.property)).toContain('firstName');
  });

  it('caps bulk ids and the page size', async () => {
    const bulk = plainToInstance(BulkActionDto, {
      ids: Array.from({ length: 101 }, () => 'id'),
      action: 'CONFIRM',
    });
    expect((await validate(bulk)).map((e) => e.property)).toContain('ids');

    const page = plainToInstance(PaginationQueryDto, { limit: '101' });
    expect((await validate(page)).map((e) => e.property)).toContain('limit');
  });
});
