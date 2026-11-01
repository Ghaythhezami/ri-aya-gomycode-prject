// Shared plumbing for the BP-002 database tests.
//
// The suite talks to the compose PostgreSQL container rather than opening a Prisma
// connection of its own: the assertions are about what the migration did to the
// database, so psql is a more direct witness than an ORM, and it keeps the test
// dependency-free. `prisma` and the seed are invoked exactly as a developer would,
// through pnpm, so the commands under test are the documented ones.
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const serverDir = path.join(projectRoot, 'server');
export const prismaDir = path.join(serverDir, 'prisma');
export const migrationsDir = path.join(prismaDir, 'migrations');

export const CONTAINER = 'riaya-bp002-test-pg';
export const HOST = 'localhost';
export const PORT = 55432;
export const PG_USER = 'riaya';
export const PG_PASSWORD = 'riaya';
export const PG_IMAGE = 'postgres:16-alpine';

// The suite owns its server rather than borrowing the compose one. Two reasons:
// `prisma migrate deploy` connects from the host, so it needs a published port, and on
// a developer machine port 5432 is routinely claimed by a native PostgreSQL service as
// well as Docker - whichever listener answers is then a coin toss, and the failures it
// produces ("permission denied to create database", "database does not exist") name the
// wrong problem entirely. A container on its own port is deterministic.
export const TEST_PORT = PORT;

export const testDatabase = (suffix) => `riaya_bp002_${suffix}`;

export const databaseUrl = (name) => `postgresql://${PG_USER}:${PG_PASSWORD}@${HOST}:${PORT}/${name}`;

export function docker(args, options = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });
}

function dockerQuiet(args) {
  try {
    docker(args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function dockerAvailable() {
  return dockerQuiet(['info', '--format', '{{.ServerVersion}}']);
}

function containerExists() {
  try {
    return docker(['ps', '-a', '--filter', `name=^${CONTAINER}$`, '--format', '{{.Names}}']).trim() === CONTAINER;
  } catch {
    return false;
  }
}

function containerRunning() {
  try {
    return docker(['inspect', '--format', '{{.State.Running}}', CONTAINER]).trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Start the suite's own PostgreSQL, creating it on first run. Idempotent: the container
 * is reused across runs so the suite does not pay for a cold start every time.
 */
export function ensureTestPostgres() {
  if (!dockerAvailable()) return false;

  try {
    if (containerExists()) {
      if (!containerRunning()) dockerQuiet(['start', CONTAINER]);
    } else {
      dockerQuiet([
        'run',
        '-d',
        '--name',
        CONTAINER,
        '-e',
        `POSTGRES_USER=${PG_USER}`,
        '-e',
        `POSTGRES_PASSWORD=${PG_PASSWORD}`,
        '-e',
        `POSTGRES_DB=riaya`,
        '-p',
        `${PORT}:5432`,
        PG_IMAGE,
      ]);
    }
  } catch {
    return false;
  }

  // First start initialises the data directory and then RESTARTS: the entrypoint runs
  // the init scripts against a temporary server and shuts it down. A single `pg_isready`
  // can therefore succeed against a database that is about to stop, which is how a run
  // fails with "the database system is shutting down". Require a real query to succeed
  // twice, a second apart, so the answer survives that restart.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (canQuery()) {
      sleepSync(1000);
      if (canQuery()) return true;
    } else {
      sleepSync(1000);
    }
  }

  return false;
}

function canQuery() {
  return dockerQuiet([
    'exec',
    CONTAINER,
    'psql',
    '-U',
    PG_USER,
    '-d',
    'riaya',
    '-t',
    '-A',
    '-c',
    'SELECT 1',
  ]);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Run SQL and return the trimmed result of `-t -A` (no headers, unaligned). */
export function psql(sql, database = 'riaya') {
  return docker([
    'exec',
    CONTAINER,
    'psql',
    '-U',
    PG_USER,
    '-d',
    database,
    '-t',
    '-A',
    '-c',
    sql,
  ]).trim();
}

export function psqlFile(filePath, database) {
  return docker(
    ['exec', '-i', CONTAINER, 'psql', '-U', PG_USER, '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: fs.readFileSync(filePath, 'utf8') },
  );
}

export function recreateDatabase(name) {
  psql(`DROP DATABASE IF EXISTS ${name}`, 'riaya');
  psql(`CREATE DATABASE ${name}`, 'riaya');

  // `prisma migrate deploy` creates the database itself when it is missing, and the
  // error it reports then ("permission denied to create database") says nothing about
  // the real problem. Fail here, with the name, instead of sixty seconds later.
  const exists = psql(`SELECT count(*) FROM pg_database WHERE datname = '${name}'`, 'riaya').trim();

  if (exists !== '1') {
    throw new Error(
      `could not create the scratch database "${name}" - does the "${PG_USER}" role have CREATEDB?`,
    );
  }
}

/**
 * `prisma migrate ...` against a scratch database. DATABASE_URL is passed in the
 * environment, which dotenv will not override, so the developer's own .env is intact.
 */
export function prismaMigrate(database, args) {
  return execSync(`pnpm exec prisma migrate ${args.join(' ')}`, {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: databaseUrl(database), NODE_ENV: 'test' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
}

export const migrateDeploy = (database) => prismaMigrate(database, ['deploy']);

export const migrateResolveApplied = (database, name) =>
  prismaMigrate(database, ['resolve', '--applied', name]);

export function runSeed(database, overrides = {}) {
  return execSync('pnpm run seed', {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: databaseUrl(database), NODE_ENV: 'test' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...overrides,
  }).toString();
}

export function timed(fn) {
  const startedAt = Date.now();
  const output = fn();

  return { output, elapsedMs: Date.now() - startedAt };
}

export const readMigration = (folder) =>
  fs.readFileSync(path.join(migrationsDir, folder, 'migration.sql'), 'utf8');

export const INIT_MIGRATION = '20261028235000_init_tenancy';
export const CLINICAL_MIGRATION = '20261031120000_clinical_core';
