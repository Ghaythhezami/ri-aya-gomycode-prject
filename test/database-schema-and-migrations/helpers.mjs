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

export const CONTAINER = 'riaya-postgres';
export const HOST = 'localhost';
export const PORT = 5432;
export const PG_USER = 'riaya';
export const PG_PASSWORD = 'riaya';

// One database per test file. The files share a server but never a schema, so
// they can run in parallel without one file's seed changing another's counts.
export const testDatabase = (suffix) => `riaya_bp002_${suffix}`;

export const databaseUrl = (name) => `postgresql://${PG_USER}:${PG_PASSWORD}@${HOST}:${PORT}/${name}`;

export function docker(args, options = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });
}

/** The suite is meaningless without a database, so callers skip rather than fail. */
export function postgresAvailable() {
  try {
    docker(['exec', CONTAINER, 'pg_isready', '-U', PG_USER, '-d', 'riaya'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
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
