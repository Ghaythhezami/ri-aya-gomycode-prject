// Migration behaviour for BP-002 (database-schema-and-migrations).
//
// AC-002, AC-003 and AC-004 are claims about what happens to a real PostgreSQL
// database when the migration runs, so they run against one - a scratch database
// created and dropped per file. They are skipped, not failed, when the compose stack
// is not running: an unavailable database is a missing prerequisite, not a defect in
// the migration.
//
// Run: node --test test/database-schema-and-migrations
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  CLINICAL_MIGRATION,
  INIT_MIGRATION,
  migrateDeploy,
  migrateResolveApplied,
  migrationsDir,
  postgresAvailable,
  psql,
  psqlFile,
  readMigration,
  recreateDatabase,
  testDatabase,
  timed,
} from './helpers.mjs';

const DB = testDatabase('mig');
const skip = postgresAvailable()
  ? false
  : 'PostgreSQL is not reachable - start it with `docker compose up -d postgres`';

// AC-002 and NFR-001 both need a fresh database migrated once. Doing it once and
// sharing the measurement keeps the suite from paying for two deploy runs.
let deployRun = null;

function deployOnce() {
  if (!deployRun) {
    recreateDatabase(DB);
    deployRun = timed(() => migrateDeploy(DB));
  }

  return deployRun;
}

const tableExists = (table) =>
  psql(`SELECT to_regclass('public.${table}') IS NOT NULL`, DB).trim() === 't';

test('TEST-006 AC-002: migrate deploy applies every migration to an empty database', { skip }, () => {
  const { output } = deployOnce();

  assert.match(output, /All migrations have been successfully applied|migrations have been applied/i);

  for (const table of ['patients', 'doctors', 'appointments', 'clinics', 'users']) {
    assert.ok(tableExists(table), `expected table ${table} after deploy`);
  }

  const unfinished = psql(
    'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL',
    DB,
  ).trim();
  assert.equal(unfinished, '0', 'every migration record must be finished');

  const applied = psql('SELECT count(*) FROM _prisma_migrations', DB).trim();
  assert.equal(applied, '2', `expected both migrations recorded, got ${applied}`);
});

test('TEST-007 NFR-001: migrate deploy finishes well inside the 60 second budget', { skip }, () => {
  const { elapsedMs } = deployOnce();

  assert.ok(
    elapsedMs < 60_000,
    `migrate deploy took ${elapsedMs}ms, over the 60s CI budget (NFR-001)`,
  );
});

test('TEST-008 AC-004: running the migrations again is a no-op', { skip }, () => {
  const before = psql('SELECT count(*) FROM _prisma_migrations', DB).trim();
  const beforePatients = psql('SELECT count(*) FROM patients', DB).trim();

  const output = migrateDeploy(DB);

  assert.match(output, /No pending migrations|already been applied/i, output);
  assert.equal(psql('SELECT count(*) FROM _prisma_migrations', DB).trim(), before);
  assert.equal(psql('SELECT count(*) FROM patients', DB).trim(), beforePatients);
});

test('TEST-009 AC-003: the migration is additive and preserves existing rows', { skip }, () => {
  // The clinical migration must not rewrite or remove an existing table, which is what
  // makes it safe to run against a populated database (NFR-002). Comments are stripped
  // first: the file explains that it contains none of these statements, and a naive
  // search would match that explanation.
  const clinical = readMigration(CLINICAL_MIGRATION)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');

  for (const statement of ['DROP TABLE', 'TRUNCATE', 'DROP COLUMN', 'ALTER COLUMN', 'DROP TYPE']) {
    assert.ok(
      !new RegExp(statement, 'i').test(clinical),
      `the clinical migration must not contain "${statement}"`,
    );
  }

  const populated = testDatabase('additive');
  recreateDatabase(populated);

  // Build the pre-clinical state by hand: apply the tenancy migration, then tell Prisma
  // it is already applied so `deploy` only runs the clinical one.
  psqlFile(path.join(migrationsDir, INIT_MIGRATION, 'migration.sql'), populated);
  migrateResolveApplied(populated, INIT_MIGRATION);

  psql(
    `INSERT INTO "organizations" ("id", "name", "slug", "updatedAt")
     VALUES ('org-ac003', 'AC-003 Org', 'ac-003-org', now());
     INSERT INTO "clinics" ("id", "organizationId", "name", "updatedAt")
     VALUES ('clinic-ac003', 'org-ac003', 'AC-003 Clinic', now());
     INSERT INTO "users" ("id", "email", "passwordHash", "firstName", "lastName", "updatedAt")
     VALUES ('user-ac003', 'ac003@riaya.local', 'not-a-real-hash', 'Existing', 'User', now());`,
    populated,
  );

  migrateDeploy(populated);

  // The rows that existed before the clinical tables were created are still here.
  assert.equal(psql('SELECT name FROM clinics WHERE id = \'clinic-ac003\'', populated).trim(), 'AC-003 Clinic');
  assert.equal(psql('SELECT email FROM users WHERE id = \'user-ac003\'', populated).trim(), 'ac003@riaya.local');

  // And the clinical tables arrived alongside them.
  assert.equal(
    psql("SELECT to_regclass('public.appointments') IS NOT NULL", populated).trim(),
    't',
  );
  assert.equal(psql('SELECT count(*) FROM clinics', populated).trim(), '1');
});
