// One-off helper: link TEST-### ids to acceptance criteria in traceability.json.
// Run from the repository root: node .sdrive/reports/tests/raw/link-testids.cjs
const fs = require('fs');

const path = '.sdrive/governance/authentication-onboarding-and-access-control/v1/traceability.json';
const specPath = '.sdrive/governance/authentication-onboarding-and-access-control/v1/spec.json';

/** AC → the tests that verify it. Only ACs with a real, passing test appear. */
const AC_TO_TESTS = {
  'AC-001': ['TEST-001'],
  'AC-003': ['TEST-034'],
  'AC-004': ['TEST-025'],
  'AC-005': ['TEST-029'],
  'AC-006': ['TEST-026', 'TEST-027'],
  'AC-007': ['TEST-029', 'TEST-030'],
  'AC-008': ['TEST-028'],
  'AC-010': ['TEST-035'],
  'AC-011': ['TEST-017'],
  'AC-012': ['TEST-017'],
  'AC-013': ['TEST-014', 'TEST-033'],
  'AC-014': ['TEST-016'],
  'AC-015': ['TEST-010'],
  'AC-016': ['TEST-011'],
  'AC-017': ['TEST-012', 'TEST-013'],
  'AC-018': ['TEST-006'],
  'AC-019': ['TEST-021', 'TEST-022'],
  'AC-020': ['TEST-023'],
  'AC-021': ['TEST-043'],
  'AC-022': ['TEST-018', 'TEST-020'],
  'AC-023': ['TEST-019'],
  'AC-024': ['TEST-016'],
  'AC-025': ['TEST-017'],
  'AC-026': ['TEST-011'],
  'AC-027': ['TEST-036'],
  'AC-028': ['TEST-037', 'TEST-032'],
  'AC-029': ['TEST-032'],
  'AC-030': ['TEST-038'],
  'AC-031': ['TEST-039'],
  'AC-032': ['TEST-040'],
  'AC-035': ['TEST-028'],
  'AC-037': ['TEST-041'],
  'AC-038': ['TEST-025'],
  'AC-039': ['TEST-042'],
  'AC-040': ['TEST-044'],
  'AC-041': ['TEST-002'],
  'AC-042': ['TEST-003'],
  'AC-043': ['TEST-009'],
  'AC-045': ['TEST-007', 'TEST-008'],
};

const traceability = JSON.parse(fs.readFileSync(path, 'utf8'));

for (const row of traceability.rows) {
  const acs = row.acceptanceCriteriaIds || [];
  const tests = [...new Set(acs.flatMap((ac) => AC_TO_TESTS[ac] || []))];

  row.testIds = tests;

  if (tests.length === 0) {
    row.status = 'in_progress';
  } else {
    row.status = acs.every((ac) => AC_TO_TESTS[ac]) ? 'complete' : 'in_progress';
  }
}

fs.writeFileSync(path, JSON.stringify(traceability, null, 2) + '\n');

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const allAcs = [];
for (const story of spec.userStories || []) {
  for (const ac of story.acceptanceCriteria || []) allAcs.push(ac.id);
}

const covered = allAcs.filter((ac) => AC_TO_TESTS[ac]);

console.log(`rowsWithTestIds=${traceability.rows.filter((r) => r.testIds.length).length}`);
console.log(`coveredACs=${covered.length}/${allAcs.length} (${Math.round((covered.length / allAcs.length) * 100)}%)`);
console.log(`untested=${allAcs.filter((ac) => !AC_TO_TESTS[ac]).join(',')}`);
