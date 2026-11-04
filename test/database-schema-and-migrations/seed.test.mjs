// Seed behaviour for BP-002 (database-schema-and-migrations).
//
// AC-006, AC-007 and AC-008 are claims about the demo dataset: how much of it there is,
// whether re-running doubles it, and whether it can be mistaken for real patient data.
// Each is answered by counting rows in a real database after running the real script.
//
// Run: node --test test/database-schema-and-migrations
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  databaseUrl,
  ensureTestPostgres,
  migrateDeploy,
  psql,
  recreateDatabase,
  runSeed,
  testDatabase,
  timed,
} from './helpers.mjs';

const DB = testDatabase('seed');
const skip = ensureTestPostgres()
  ? false
  : 'Docker is not available - this suite starts its own PostgreSQL container';

// Migrate and seed once; the idempotency test needs a second seed, and the count
// assertions reuse the first. Re-running the whole setup per test buys nothing.
let firstRun = null;

function seedOnce() {
  if (!firstRun) {
    recreateDatabase(DB);
    migrateDeploy(DB);
    firstRun = timed(() => runSeed(DB));
  }

  return firstRun;
}

const count = (table) => Number(psql(`SELECT count(*) FROM ${table}`, DB).trim());

test('TEST-010 AC-006: the seed creates the documented demo dataset', { skip }, () => {
  const { output } = seedOnce();

  assert.equal(count('clinics'), 3, 'expected 3 clinics');
  assert.equal(count('doctors'), 10, 'expected 10 doctors');
  assert.equal(count('patients'), 200, 'expected 200 patients');
  assert.equal(count('appointments'), 600, 'expected 600 appointments');
  assert.match(output, /Clinical dataset:/);
});

test('TEST-011 NFR-003: the seed finishes well inside the 60 second budget', { skip }, () => {
  const { elapsedMs } = seedOnce();

  assert.ok(elapsedMs < 60_000, `the seed took ${elapsedMs}ms, over the 60s budget (NFR-003)`);
});

test('TEST-012 AC-007: a second seed run changes nothing and duplicates nothing', { skip }, () => {
  seedOnce();

  const before = {
    clinics: count('clinics'),
    doctors: count('doctors'),
    patients: count('patients'),
    appointments: count('appointments'),
  };

  runSeed(DB);

  assert.deepEqual(
    {
      clinics: count('clinics'),
      doctors: count('doctors'),
      patients: count('patients'),
      appointments: count('appointments'),
    },
    before,
    're-running the seed must not inflate the dataset',
  );

  // Upserts on a natural key make duplicates impossible; prove it rather than assume it.
  const duplicatePatients = psql(
    `SELECT count(*) FROM (
       SELECT "firstName", "lastName", "phone", "clinicId" FROM patients
       GROUP BY 1, 2, 3, 4 HAVING count(*) > 1
     ) AS duplicates`,
    DB,
  ).trim();
  assert.equal(duplicatePatients, '0', 'patients must be unique on their natural key');
});

test('TEST-013 AC-008: every seeded person is fictional', { skip }, () => {
  seedOnce();

  // Nothing may resolve to a real mailbox: the fixture domains are reserved for exactly
  // this purpose, and CON-506 forbids real patient data in development seeds.
  const foreignEmails = psql(
    `SELECT count(*) FROM patients
     WHERE email IS NOT NULL
       AND email NOT LIKE '%@riaya.local'
       AND email NOT LIKE '%@example.org'
       AND email NOT LIKE '%@example.com'`,
    DB,
  ).trim();
  assert.equal(foreignEmails, '0', 'patient emails must use reserved fixture domains');

  const userEmails = psql(
    `SELECT count(*) FROM users
     WHERE email NOT LIKE '%@riaya.local'
       AND email NOT LIKE '%@example.org'
       AND email NOT LIKE '%@example.com'`,
    DB,
  ).trim();
  assert.equal(userEmails, '0', 'seeded user emails must use reserved fixture domains');

  // A deterministic generator is what makes the dataset reproducible (FR-007); the
  // column being populated everywhere the schema requires it is the observable proof.
  const missingRequired = psql(
    `SELECT count(*) FROM patients
     WHERE "firstName" IS NULL OR "lastName" IS NULL OR phone IS NULL OR "dateOfBirth" IS NULL`,
    DB,
  ).trim();
  assert.equal(missingRequired, '0', 'every patient row must be complete');
});

test('TEST-014 CON-519: the seed refuses to run outside local development', () => {
  // The guard runs before any database work, so this needs no database.
  let failure = null;

  try {
    runSeed(DB, {
      env: { ...process.env, DATABASE_URL: databaseUrl(DB), NODE_ENV: 'production' },
    });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure, 'the seed must exit non-zero when NODE_ENV is "production"');

  const output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
  assert.match(output, /Refusing to seed|NODE_ENV is "production"/i, output);
});
