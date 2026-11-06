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
  // Behind Vercel's edge (or any reverse proxy) `req.ip` is the proxy unless the
  // first hop is trusted; rate limits and lockouts key on it.
  if (process.env.VERCEL || config.get<string>('TRUST_PROXY') === 'true') {
    (app as NestExpressApplication).set('trust proxy', 1);
  }
  // JSON API: no CSP needed, but HSTS must be on (also set by helmet's defaults;
  // pinned here so a helmet upgrade cannot silently drop it).
  app.use(
    helmet({
      hsts: { maxAge: 31_536_000, includeSubDomains: true },
    }),
  );
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
    // A wildcard would defeat the credentialed allow-list, so it is dropped.
    .filter((origin) => origin !== '' && origin !== '*');

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 600,
    exposedHeaders: ['Retry-After', 'X-Request-Id'],
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
