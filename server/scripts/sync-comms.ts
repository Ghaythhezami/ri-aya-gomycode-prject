/**
 * Copies notifications and staff chat from PostgreSQL into riaya-comms (MongoDB), clinic by
 * clinic, through the service's admin import (ADR 0003). Needs DATABASE_URL, COMMS_URL and
 * SERVICE_JWT_SECRET. `--reset` deletes each clinic's comms documents first.
 *
 *   npx ts-node --transpile-only scripts/sync-comms.ts [--reset]
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CommsSyncService } from '../src/services/comms-sync.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const sync = app.get(CommsSyncService);
    if (!sync.enabled) throw new Error('COMMS_URL is not set');
    const totals = await sync.syncAll({ reset: process.argv.includes('--reset') });
    console.log(JSON.stringify(totals));
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
