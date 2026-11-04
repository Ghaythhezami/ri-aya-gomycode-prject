import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { REDACT_CENSOR, REDACT_PATHS, resolveLogLevel } from './logging.config';

/**
 * `LOG_LEVEL` is read once at module definition because `forRoot` is static. A
 * test process stays silent unless it opts in, matching `server`.
 */
const IS_TEST = process.env.NODE_ENV === 'test';
const LEVEL = IS_TEST
  ? (process.env.LOG_LEVEL?.trim().toLowerCase() ?? 'silent')
  : resolveLogLevel(process.env.LOG_LEVEL);

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: LEVEL,
        redact: {
          paths: REDACT_PATHS,
          censor: REDACT_CENSOR,
          remove: false,
        },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) {
            return 'error';
          }

          return res.statusCode >= 400 ? 'warn' : 'info';
        },
        serializers: {
          req: (req: { id?: string; method?: string; url?: string }) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
        },
      },
    }),
  ],
})
export class LoggingModule {}
