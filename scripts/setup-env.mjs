#!/usr/bin/env node
// Creates each package's .env from its .env.example, and only when .env is missing.
//
// Idempotent by design (T2.1): an existing .env is never read, written or truncated,
// so re-running this after a pull can never destroy local settings. Nothing secret is
// produced here - the values are copied verbatim from the committed example (CON-519),
// and every .env it writes is already covered by .gitignore (CON-504).
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = ['server', 'web', 'backoffice'];
const root = process.cwd();

let created = 0;
let skipped = 0;
let missing = 0;

console.log('Preparing local environment files\n');

for (const pkg of PACKAGES) {
  const example = join(root, pkg, '.env.example');
  const target = join(root, pkg, '.env');

  if (!existsSync(example)) {
    console.log(
      `missing example  ${pkg}/.env.example - add it, other packages were still prepared`,
    );
    missing += 1;
    continue;
  }

  if (existsSync(target)) {
    console.log(`skipped          ${pkg}/.env (already exists, left untouched)`);
    skipped += 1;
    continue;
  }

  copyFileSync(example, target);
  console.log(`created          ${pkg}/.env from ${pkg}/.env.example`);
  created += 1;
}

console.log(`\n${created} created, ${skipped} skipped, ${missing} missing example`);

if (skipped > 0) {
  // EC-003: a .env created before a new key existed will not receive it.
  console.log(
    'Existing files were left alone. If a package gained a new key since your .env was\n' +
      "created, add it by hand - see the package's .env.example and the README.",
  );
}
