import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let ready: Promise<Handler> | null = null;

/**
 * Vercel function entry (see `api/index.js` and `vercel.json`). The Nest app is
 * created once per warm instance and reused; only the first request on a cold
 * instance pays the bootstrap cost.
 */
async function createHandler(): Promise<Handler> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  configureApp(app);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= createHandler().catch((error: unknown) => {
    ready = null;
    throw error;
  });
  const express = await ready;
  express(req, res);
}
