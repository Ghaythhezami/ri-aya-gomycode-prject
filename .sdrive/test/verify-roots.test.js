// Regression test for the spec-to-code scanner.
//
// verify.js only reads source extensions (CODE_EXTENSIONS) from its detected roots, so
// components that live at the repository root - README.md, package.json, .gitignore,
// scripts/*.mjs, *.env.example - could never match and were reported as MISSING while
// sitting on disk. That failed review criterion C15 on files that plainly exist.
//
// The scanner now treats an existing path as proof of presence. This test runs the real
// scanner against this repository so the regression cannot come back silently.
//
// Run: node --test .sdrive/test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FEATURE = 'monorepo-and-local-environment';

function planExists() {
  // plan.json lives under governance/; the human-readable plan.md lives under specs/.
  if (fs.existsSync(path.join(REPO_ROOT, '.sdrive', 'governance', FEATURE, 'v1', 'plan.json'))) {
    return true;
  }

  return ['ongoing', 'completed', 'backlog'].some((stage) =>
    fs.existsSync(path.join(REPO_ROOT, '.sdrive', 'specs', stage, FEATURE, 'v1', 'plan.md')),
  );
}

test(
  'the scanner reports no root-level component as missing',
  { skip: planExists() ? false : `${FEATURE} has no plan.json in this repo` },
  () => {
    const result = spawnSync(
      process.execPath,
      [path.join('.sdrive', 'scripts', 'verify.js'), FEATURE],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      },
    );
    const output = `${result.stdout || ''}${result.stderr || ''}`;

    // 0 means pass or warn; 1 means fail.
    assert.notEqual(result.status, 1, `verify must not FAIL:\n${output}`);
    assert.match(output, /Missing:\s+0\b/, `expected "Missing: 0":\n${output}`);

    for (const component of [
      'README.md',
      'package.json',
      '.gitignore',
      'scripts/setup-env.mjs',
      'web/.env.example',
    ]) {
      assert.equal(
        output.includes(`[component] ${component}`),
        false,
        `${component} exists on disk and must not be reported missing`,
      );
    }
  },
);
