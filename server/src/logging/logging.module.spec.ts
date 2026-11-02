/**
 * End-to-end tests for the structured logging middleware (BP-003).
 *
 * The application under test is the real `AppModule` — only a probe controller
 * is added — so the pino-http middleware, its serialisers, the redact list and
 * the global `HttpExceptionFilter` are all the production ones.
 *
 * Capturing the sink
 * ------------------
 * These criteria describe what is *written*, so the tests read the records
 * back. Two things shape how:
 *
 * 1. `nestjs-pino` 5.x builds pino-http once via `pinoHttp(...)`, so a
 *    `stream`/`destination` option is not read from `LoggerModule.forRoot`.
 *    The stream is decided by the pino transport instead — see
 *    `app-log-stream.ts` for the file this suite collects into.
 * 2. That transport is spawned by pino asynchronously, so the file has to exist
 *    and be flushed before the first assertion. `waitForTransport` does that,
 *    and it also waits at the end so a record written during teardown is not
 *    left half-written.
 *
 * `LOG_LEVEL` is set before `LoggingModule` is first imported because EC-004
 * silences logging under NODE_ENV=test; the module resolves the level once, at
 * definition. Jest isolates modules per file, so the level holds for the file.
 */
import {
  Controller,
  Get,
  HttpException,
  INestApplication,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Logger as PinoLogger } from 'nestjs-pino';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { AppLogStream, readAppLog } from './app-log-stream';

/** Chosen so every level under test is emitted (AC-003 logs at info). */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'debug';
process.env.LOG_TRANSPORT_TARGET = AppLogStream.path;

/** How long to wait for the transport to spawn, open the file and flush. */
const FLUSH_TIMEOUT_MS = 10_000;
const FLUSH_INTERVAL_MS = 50;

/**
 * Resolves once `read` reports new content, or rejects on timeout.
 *
 * Used instead of a bare `setTimeout` so a slow Windows filesystem cannot turn
 * a real pass into a flake, and a genuine silence still fails quickly.
 */
async function waitForTransport<T>(
  read: () => Promise<T>,
  isReady: (value: T) => boolean,
): Promise<T> {
  const deadline = Date.now() + FLUSH_TIMEOUT_MS;
  let last = await read();

  while (!isReady(last)) {
    if (Date.now() > deadline) {
      return last;
    }

    await new Promise((resolve) => setTimeout(resolve, FLUSH_INTERVAL_MS));
    last = await read();
  }

  return last;
}

/** The request path a record was written for, or undefined for startup lines. */
function requestPath(record: Record<string, unknown>): string | undefined {
  const req = record.req;

  return req && typeof req === 'object' ? (req as RecordedLine['req'])?.url : undefined;
}

interface RecordedLine extends Record<string, unknown> {
  level?: number;
  msg?: string;
  req?: { id?: string; method?: string; url?: string };
  res?: { statusCode?: number };
}

@Controller('probe')
class ProbeController {
  private readonly logger = new Logger('ProbeController');

  /** Writes a handler line through Nest's Logger (AC-002, AC-003). */
  @Get('ok')
  ok() {
    this.logger.log('handler says hello');
    return { ok: true };
  }

  /** Throws an HttpException for the filter to handle (AC-009). */
  @Get('thrown')
  thrown() {
    throw new HttpException('nope', 404);
  }

  /** Throws a plain Error so the record is written at `error` (AC-004). */
  @Get('boom')
  boom(): never {
    throw new Error('boom');
  }

  /** Logs values that must never reach the sink (AC-003). */
  @Get('sensitive')
  sensitive() {
    this.logger.log({
      message: 'user loaded',
      user: { email: 'a@b.test', password: 'hunter2-fixture', token: 'fixture-token' },
    });
    return { ok: true };
  }
}

/** The pino instance behind the app-wide `PinoLogger`. */
function pinoInstanceOf(app: INestApplication): unknown {
  return (app.get(PinoLogger) as unknown as { logger: unknown }).logger;
}

/**
 * Waits until every record already handed to pino has reached the file.
 *
 * The transport writes on its own thread, so reading straight after a
 * response would race the worker. `flush` hands the buffered lines over and
 * the callback fires once the worker confirms the write.
 */
async function flushAppLog(logger: unknown): Promise<void> {
  const stream = (logger as Record<symbol, { flush?: (cb: (err?: Error) => void) => void }>)[
    Symbol.for('pino.stream')
  ];

  if (!stream?.flush) {
    return;
  }

  await new Promise<void>((resolve) => {
    stream.flush!(() => resolve());
  });
}

describe('structured logging middleware', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await AppLogStream.reset();

    // Imported after LOG_LEVEL is set so the module resolves the opted-in level.
    const { AppModule } = await import('../app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useLogger(app.get(PinoLogger));
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    // Startup records prove the transport is writing before any request.
    const startup = await waitForTransport(readAppLog, (records) => records.length > 0);

    if (startup.length === 0) {
      throw new Error(
        `The pino transport did not write to ${AppLogStream.path} within ${FLUSH_TIMEOUT_MS}ms, ` +
          'so the log sink cannot be asserted on. Nothing about the criteria below was checked.',
      );
    }
  });

  afterAll(async () => {
    await app?.close();
    await AppLogStream.reset();
  });

  // The transport only appends, so each test starts from an empty file.
  // Reset happens here, before the request, because the records a reader
  // wants are written after it.
  beforeEach(async () => {
    await flushAppLog(pinoInstanceOf(app));
    await AppLogStream.reset();
  });

  /** Reads the records written during one test. */
  const recordsOf = async (path: string): Promise<RecordedLine[]> => {
    await flushAppLog(pinoInstanceOf(app));

    const records = await waitForTransport(readAppLog, (all) =>
      all.some((record) => requestPath(record) === path),
    );

    return records.filter((record) => requestPath(record) === path) as RecordedLine[];
  };

  /** Groups by request, so one test making three calls can assert on each. */
  const recordsFor = (records: RecordedLine[], path: string) =>
    records.filter((record) => record.req?.url === path);

  // TEST-001 → AC-001 (FR-001)
  it('AC-001: writes exactly one completion record carrying reqId, method, url, status code and duration', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/ok')
      .set('X-Request-Id', 'safe-id-123')
      .expect(200);

    const records = await recordsOf('/api/probe/ok');
    const completions = records.filter((record) => record.msg !== 'handler says hello');

    // Exactly one record describes the completion of this request, so a
    // duplicate middleware or a double-write would fail here.
    expect(completions).toHaveLength(1);

    const completion = completions[0]!;

    // AC-001 names `reqId` at the top level of the record.
    expect(completion).toHaveProperty('reqId', 'safe-id-123');
    expect(completion.req).toMatchObject({
      method: 'GET',
      url: '/api/probe/ok',
      id: 'safe-id-123',
    });
    expect(completion.res).toMatchObject({ statusCode: 200 });
    expect(typeof completion.responseTime).toBe('number');
    expect(completion.responseTime as number).toBeGreaterThanOrEqual(0);

    // The id the record carries is the one the caller was given back.
    expect(response.headers['x-request-id']).toBe('safe-id-123');
  });

  // TEST-002 → AC-002 (FR-002)
  it('AC-002: handler logs carry the same reqId as the request record and match the X-Request-Id header', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/ok')
      .set('X-Request-Id', 'safe-id-123')
      .expect(200);

    const records = await recordsOf('/api/probe/ok');
    const handlerLines = records.filter((record) => record.msg === 'handler says hello');
    const completions = records.filter((record) => record.msg !== 'handler says hello');

    expect(handlerLines).toHaveLength(1);
    expect(completions).toHaveLength(1);

    // AC-002: the point is that the handler line, the request record and the
    // header all agree on one value.
    expect(handlerLines[0]!.reqId).toBe('safe-id-123');
    expect(completions[0]!.reqId).toBe('safe-id-123');
    expect(response.headers['x-request-id']).toBe('safe-id-123');
  });

  // TEST-003 → AC-003 (FR-003)
  it('AC-003: never writes Authorization, Cookie or password values to the sink', async () => {
    await request(app.getHttpServer())
      .get('/api/probe/sensitive')
      .set('Authorization', 'Bearer fixture-secret-token')
      .set('Cookie', 'refresh_token=fixture-cookie-value')
      .expect(200);

    const records = await recordsOf('/api/probe/sensitive');
    const serialised = JSON.stringify(records);

    expect(serialised).not.toContain('fixture-secret-token');
    expect(serialised).not.toContain('fixture-cookie-value');
    expect(serialised).not.toContain('hunter2-fixture');
    expect(serialised).not.toContain('fixture-token');

    // Redaction replaces the value rather than dropping the record entirely,
    // and it reaches the nested user object, not only the top level.
    expect(serialised).toContain('[REDACTED]');
    expect(records.length).toBeGreaterThan(0);
  });

  // TEST-004 → AC-004 (FR-004)
  it('AC-004: maps 2xx to info, 4xx to warn and 5xx to error', async () => {
    await request(app.getHttpServer()).get('/api/probe/ok').expect(200);
    await request(app.getHttpServer()).get('/api/probe/thrown').expect(404);
    await request(app.getHttpServer()).get('/api/probe/boom').expect(500);

    await flushAppLog(pinoInstanceOf(app));

    const records = await waitForTransport(readAppLog, (all) =>
      all.some((record) => requestPath(record) === '/api/probe/boom'),
    );

    /** The completion record is the last one written for the request. */
    const levelOf = (path: string) => {
      const forPath = recordsFor(records as RecordedLine[], path);
      return forPath[forPath.length - 1]?.level;
    };

    // pino's numeric levels: info=30, warn=40, error=50.
    expect(levelOf('/api/probe/ok')).toBe(30);
    expect(levelOf('/api/probe/thrown')).toBe(40);
    expect(levelOf('/api/probe/boom')).toBe(50);
  });

  // TEST-005 → AC-009 (FR-008)
  it('AC-009: a thrown HttpException keeps its response shape and adds a matching requestId', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/thrown')
      .set('X-Request-Id', 'safe-id-123')
      .expect(404);

    // FR-008: the fields the filter already returned are still there, unrenamed.
    expect(response.body).toEqual({
      code: expect.any(String),
      message: 'nope',
      details: null,
      requestId: 'safe-id-123',
    });

    // AC-009: the body and the header carry one value, and that value is the
    // one the log record for this request carries.
    expect(response.headers['x-request-id']).toBe('safe-id-123');

    const records = await recordsOf('/api/probe/thrown');
    const completion = records.filter((record) => record.msg !== undefined).pop();

    expect(completion?.req?.id).toBe('safe-id-123');
  });
});
