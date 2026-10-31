// Regression test for backlog dependency parsing.
//
// The `Depends on` cell uses `—` to mean "nothing". This backlog is UTF-8 text that
// has been decoded as Latin-1 at least once, so that placeholder is actually the
// three code points `â€”`. The parser used to test only `[-—–]`, so the placeholder
// survived as an "outside blocker" and BP-001 - the only item in the `start` wave -
// was permanently ineligible, which blocked every item that depends on it.
//
// `188b42c` fixed one spelling of this; a later framework re-sync restored the
// narrower test. This file pins the behaviour against the real backlog too, so the
// next re-sync fails loudly instead of silently freezing the product plan.
//
// Run: node --test .sdrive/test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseDependencyCell, parseBacklog } = require('../scripts/lib/product-plan');

// What a UTF-8 em-dash looks like after being decoded as Latin-1.
const MOJIBAKE_DASH = String.fromCharCode(0xe2, 0x20ac, 0x201d);

test('a real em-dash placeholder is not a dependency', () => {
  assert.deepEqual(parseDependencyCell('\u2014'), { ids: [], external: [] });
});

test('a mojibake em-dash placeholder is not a dependency', () => {
  assert.deepEqual(parseDependencyCell(MOJIBAKE_DASH), { ids: [], external: [] });
});

test('dashes and blanks are not dependencies', () => {
  for (const value of ['', '   ', '-', '--', '\u2013', '\u2014\u2014', null, undefined]) {
    assert.deepEqual(parseDependencyCell(value), { ids: [], external: [] }, `for ${value}`);
  }
});

test('feature ids are still parsed', () => {
  assert.deepEqual(parseDependencyCell('BP-008'), { ids: ['BP-008'], external: [] });
});

test('a mixed cell keeps ids and outside blockers apart', () => {
  assert.deepEqual(parseDependencyCell('BP-001; partner access'), {
    ids: ['BP-001'],
    external: ['partner access'],
  });
});

test('ranges still expand', () => {
  assert.deepEqual(parseDependencyCell('BP-002 to BP-004'), {
    ids: ['BP-002', 'BP-003', 'BP-004'],
    external: [],
  });
});

test('the real backlog gives BP-001 no outside blocker', () => {
  const markdown = fs.readFileSync(path.join(__dirname, '..', 'product', 'backlog.md'), 'utf8');
  const items = parseBacklog(markdown);
  const startItem = items.find((item) => item.id === 'BP-001');

  assert.ok(startItem, 'BP-001 must exist in the backlog');
  assert.deepEqual(
    startItem.externalDependencies,
    [],
    'the dash placeholder must not block the start wave',
  );
  assert.deepEqual(startItem.dependsOn, []);
});
