// Regression test for the gate's commit binding.
//
// A feature could not be archived without contradicting itself: gates.js demanded
// `review.json.commit === HEAD`, but committing review.json moves HEAD. The only
// satisfiable state was an uncommitted tree, which the archive agent's clean-tree
// rule forbids - and archive:finalize re-runs the same check, so even finalizing
// after a merge refused.
//
// The binding now compares the two TREES and ignores .sdrive/: governance records
// move HEAD without changing the code they describe. Any change outside .sdrive/
// still invalidates the record, which is the guarantee that actually matters.
//
// Run: node --test .sdrive/test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { commitStillDescribesHead } = require('../commands/gates');

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdrive-gate-'));

  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Gate Test');
  git(dir, 'config', 'commit.gpgsign', 'false');

  fs.mkdirSync(path.join(dir, '.sdrive'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.sdrive', 'config.json'), '{}\n');
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'module.exports = 1;\n');

  commit(dir, 'base');

  return dir;
}

function commit(dir, message) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);

  return git(dir, 'rev-parse', 'HEAD');
}

test('the recorded commit itself is not stale', () => {
  const dir = makeRepo();
  const head = git(dir, 'rev-parse', 'HEAD');

  assert.deepEqual(commitStillDescribesHead(dir, head), { stale: false, detail: '' });
});

test('committing governance files does not invalidate the record', () => {
  const dir = makeRepo();
  const recorded = git(dir, 'rev-parse', 'HEAD');

  // The case that used to deadlock: the review record, its evidence and the audit
  // log all live under .sdrive/, and committing them moves HEAD.
  fs.writeFileSync(path.join(dir, '.sdrive', 'review.json'), '{"status":"PASS"}\n');
  fs.writeFileSync(path.join(dir, '.sdrive', 'audit-log.json'), '{"events":[]}\n');
  fs.writeFileSync(path.join(dir, '.sdrive', 'config.json'), '{"governance":{}}\n');

  const head = commit(dir, 'governance only');

  assert.notEqual(head, recorded);
  assert.deepEqual(commitStillDescribesHead(dir, recorded), { stale: false, detail: '' });
});

test('a source change after the record makes it stale', () => {
  const dir = makeRepo();
  const recorded = git(dir, 'rev-parse', 'HEAD');

  fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'module.exports = 2;\n');
  commit(dir, 'change the code');

  const verdict = commitStillDescribesHead(dir, recorded);

  assert.equal(verdict.stale, true);
  assert.match(verdict.detail, /source or tests changed/);
});

test('a new test file after the record makes it stale', () => {
  const dir = makeRepo();
  const recorded = git(dir, 'rev-parse', 'HEAD');

  fs.writeFileSync(path.join(dir, 'src', 'app.spec.js'), '// test\n');
  commit(dir, 'add a test');

  assert.equal(commitStillDescribesHead(dir, recorded).stale, true);
});

test('a missing record is stale', () => {
  const dir = makeRepo();

  assert.equal(commitStillDescribesHead(dir, '').stale, true);
  assert.equal(commitStillDescribesHead(dir, null).stale, true);
});

test('an uncomparable commit fails closed', () => {
  const dir = makeRepo();

  // git exits 128 for an unknown object, not 1. It must not read as "in sync".
  const verdict = commitStillDescribesHead(dir, '0'.repeat(40));

  assert.equal(verdict.stale, true);
  assert.match(verdict.detail, /cannot be compared/);
});

test('a directory outside git does not block', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdrive-nogit-'));

  assert.deepEqual(commitStillDescribesHead(dir, 'abc1234'), { stale: false, detail: '' });
});
