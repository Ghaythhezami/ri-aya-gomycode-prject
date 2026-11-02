// AC-010 (FR-009) for api-skeleton-and-ci.
//
// The Swagger route is registered in `main.ts`, which sits outside the Nest
// module graph, so this checks the wiring itself: that `main.ts` still mounts
// `/api/docs` with `useGlobalPrefix: false`, that the document it builds
// describes the real routes, and that logging has not moved or shadowed it.
//
// Asserting on the source keeps this runnable with no database, Redis or Nest
// bootstrap, matching the other `test/**` suites.
//
// Run: node --test test/api-skeleton-and-ci
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const mainSource = fs.readFileSync(path.join(projectRoot, 'server', 'src', 'main.ts'), 'utf8');

/** The argument list of the `SwaggerModule.setup(...)` call in `main.ts`. */
function swaggerSetupArgs() {
  const start = mainSource.indexOf('SwaggerModule.setup(');
  assert.notEqual(start, -1, 'main.ts must register Swagger with SwaggerModule.setup');

  return mainSource.slice(start);
}

test('TEST-009 AC-010: main.ts serves Swagger at /api/docs with the global prefix off', () => {
  const call = swaggerSetupArgs();

  assert.match(
    call,
    /SwaggerModule\.setup\(\s*['"]api\/docs['"]/,
    'Swagger must be mounted on the same path the docs promise',
  );
  assert.match(call, /useGlobalPrefix:\s*false/, 'the path already includes /api, so the prefix is off');
  assert.match(
    call,
    /persistAuthorization:\s*true/,
    'existing Swagger behaviour must survive the logging feature',
  );
});

test('TEST-010 AC-010: the Swagger document is built from the app and keeps its metadata', () => {
  const call = swaggerSetupArgs();

  assert.match(
    call,
    /SwaggerModule\.createDocument\(\s*app\s*,/,
    'the document must be generated from the running app, not a static file',
  );
  assert.match(mainSource, /\.setTitle\(\s*["']RI'AYA API["']\s*\)/, 'document title is unchanged');
  assert.match(mainSource, /\.setVersion\(\s*["']0\.1\.0["']\s*\)/, 'document version is unchanged');
  assert.match(mainSource, /\.addBearerAuth\(\)/, 'bearer auth scheme is still declared');
  assert.match(mainSource, /\.addCookieAuth\(\s*["']refresh_token["']\s*\)/, 'cookie auth scheme is still declared');

  // Logging is module-scoped middleware: it must not register routes of its own
  // that would appear in, or shadow, the documented ones.
  const loggingDir = path.join(projectRoot, 'server', 'src', 'logging');
  for (const file of fs.readdirSync(loggingDir)) {
    if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) {
      continue;
    }

    const source = fs.readFileSync(path.join(loggingDir, file), 'utf8');
    assert.doesNotMatch(
      source,
      /@(Controller|Get|Post|Put|Patch|Delete)\(/,
      `${file} must not declare HTTP routes`,
    );
  }
});
