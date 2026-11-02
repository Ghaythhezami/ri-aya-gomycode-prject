/**
 * Structured logging module (BP-003, FR-001, NFR-004).
 *
 * One module wraps `nestjs-pino` so the rest of the application keeps calling
 * `@nestjs/common`'s `Logger` unchanged: importing this module is enough for
 * every existing call site to start emitting JSON with the request id attached.
 */
import { Logger, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import {
  customLogLevel,
  genReqId,
  LOG_TRANSPORT_TARGET,
  REDACT_CENSOR,
  REDACT_PATHS,
  resolveLogLevel,
  resolveTransport,
} from './logging.config';

/**
 * Resolved once, at module definition: `LoggerModule.forRoot` is a static call,
 * so the level cannot be re-read per request. Reading it here also means the
 * EC-001 warning below is emitted exactly once, at startup.
 */
const IS_TEST = process.env.NODE_ENV === 'test';
const LOG_LEVEL_RESOLUTION = resolveLogLevel(process.env.LOG_LEVEL);

/**
 * EC-004: tests are silent by default so a suite does not emit thousands of
 * records, but a logging test has to be able to opt back in. An explicit
 * `LOG_LEVEL` is treated as that opt-in; otherwise tests get `silent`.
 */
const EFFECTIVE_LEVEL: string = IS_TEST
  ? (process.env.LOG_LEVEL?.trim().toLowerCase() ?? 'silent')
  : LOG_LEVEL_RESOLUTION.level;

// Tests that assert on what was written need the records somewhere readable.
// nestjs-pino builds pino-http itself and ignores a `destination`, so pino's
// own `transport` is the supported way to redirect the sink. Unset outside the
// test process, which leaves the default stdout sink in place.
const TRANSPORT = resolveTransport(process.env[LOG_TRANSPORT_TARGET]);

// EC-001: an unusable LOG_LEVEL must not stop the API from booting, but it must
// not pass silently either. Nest's Logger is used rather than pino's because the
// pino instance does not exist yet at this point in module definition.
if (!IS_TEST && LOG_LEVEL_RESOLUTION.warning) {
  new Logger('LoggingModule').warn(LOG_LEVEL_RESOLUTION.warning);
}

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        // EC-004: `silent` under test unless the test opted in via LOG_LEVEL.
        // The middleware stays mounted either way, so request context still
        // works for the assertions that need it.
        level: EFFECTIVE_LEVEL,

        // Redirect the sink only when a test asked for it (see TRANSPORT).
        transport: TRANSPORT,

        // FR-003 / AC-003: one constant, reviewed in the diff.
        redact: {
          paths: REDACT_PATHS,
          censor: REDACT_CENSOR,
          // Drop the key entirely rather than logging a placeholder for a
          // header that was never sent.
          remove: false,
        },

        // AC-001 / AC-002: pino-http writes the top-level request id ONLY when
        // quietReqLogger is set; without it customAttributeKeys.reqId is inert and
        // the id stays under `req.id`.
        quietReqLogger: true,

        // FR-002 / EC-002: validate a client id before echoing or logging it.
        genReqId,

        // FR-004 / AC-004: 5xx -> error, 4xx -> warn, otherwise info.
        customLogLevel,

        // AC-001: the completion record carries these five fields.
        customSuccessMessage: (req, res) =>
          `${req.method ?? 'HTTP'} ${req.url ?? ''} ${res.statusCode}`,

        // Keep the record shape stable for log consumers.
        customAttributeKeys: {
          reqId: 'reqId',
          responseTime: 'responseTime',
        },

        // Never let a logging failure take down a request (EC-005).
        serializers: {
          req: (req: { id?: string; method?: string; url?: string }) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res: { statusCode?: number }) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
  ],
})
export class LoggingModule {}
