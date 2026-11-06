import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  // FR-001: bufferLogs holds bootstrap messages until the pino logger is attached.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  configureApp(app);
  const port = Number(app.get(ConfigService).get('PORT') ?? 4000);
  await app.listen(port);
}

void bootstrap();
