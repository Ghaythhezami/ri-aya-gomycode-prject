import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  // FR-001: bufferLogs holds every message emitted during bootstrap until the
  // pino logger is attached below, so startup output is structured too instead
  // of leaking through Nest's default console logger.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // NFR-004: this is the whole change existing call sites need. Every
  // @nestjs/common Logger now writes through pino, with no edits at the call
  // sites themselves.
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());

  const origins = (
    config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000,http://localhost:5174'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swagger = new DocumentBuilder()
    .setTitle("RI'AYA API")
    .setDescription('Clinic operations API with Prisma, Redis caching, and JWT auth')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token')
    .addTag('auth', 'Sign in, signup, refresh, and password reset')
    .addTag('users', 'Staff provisioning')
    .addTag('health', 'Runtime status')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger), {
    useGlobalPrefix: false,
    swaggerOptions: { persistAuthorization: true },
  });

  const port = Number(config.get('PORT') ?? 4000);
  await app.listen(port);
}

void bootstrap();
