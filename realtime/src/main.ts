import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ENV, Env } from './config/env';
import { ConfiguredIoAdapter } from './io-adapter';
import { RedisClientsService } from './redis/redis-clients.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(PinoLogger));

  const env = app.get<Env>(ENV);

  app.use(helmet());
  app.enableCors({ origin: env.corsOrigins });

  // The Socket.IO server is created with its own CORS allow-list and frame
  // limit, and the Redis adapter is installed on it (FR-002, FR-006, EC-007).
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app, env, app.get(RedisClientsService)));

  app.enableShutdownHooks();

  await app.listen(env.port);
  logger.log(`Realtime service listening on port ${env.port}`);
}

void bootstrap().catch((error: unknown) => {
  // The message names a variable or a rule, never a value (NFR-017).
  process.stderr.write(
    `realtime failed to start: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exit(1);
});
