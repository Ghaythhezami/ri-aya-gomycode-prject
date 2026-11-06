import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Everything `main.ts` (long-running server) and `serverless.ts` (Vercel
 * function) share, so the two runtimes cannot drift: global prefix, security
 * headers, body limits, CORS allow-list, validation, error shape and Swagger.
 */
export function configureApp(app: INestApplication): void {
  // FR-001 / NFR-004: every Nest Logger call writes through pino.
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  // QA-2: request size limits.
  // Requires NestFactory.create(..., { bodyParser: false }) so these are the only parsers.
  const express = app as NestExpressApplication;
  express.useBodyParser('json', { limit: '256kb' });
  express.useBodyParser('urlencoded', { extended: false, limit: '64kb' });

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
    .setDescription(
      'Clinic operations API: auth, tenancy, patients, doctors, appointments, queue, smart scheduling, analytics, notifications, settings and chat.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger), {
    useGlobalPrefix: false,
    swaggerOptions: { persistAuthorization: true },
  });
}
