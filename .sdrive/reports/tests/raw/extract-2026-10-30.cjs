/**
 * Summarise a Jest --json result without dumping the whole run into context.
 * Usage: node extract-2026-10-30.cjs <result.json>
 */
const fs = require('fs');

const file = process.argv[2];
const r = JSON.parse(fs.readFileSync(file, 'utf8'));

const lines = [];
lines.push(`success=${r.success}`);
lines.push(
  `suites total=${r.numTotalTestSuites} passed=${r.numPassedTestSuites} failed=${r.numFailedTestSuites}`,
);
lines.push(
  `tests total=${r.numTotalTests} passed=${r.numPassedTests} failed=${r.numFailedTests} pending=${r.numPendingTests}`,
);

if (r.coverageMap && r.coverageMap.total) {
  const t = r.coverageMap.total;
  const pct = (s) => (s && s.total ? ((s.covered / s.total) * 100).toFixed(2) : 'n/a');
  lines.push(
    `coverage lines=${pct(t.lines)}% statements=${pct(t.statements)}% functions=${pct(t.functions)}% branches=${pct(t.branches)}%`,
  );
}

lines.push('--- tests by status ---');
for (const suite of r.testResults) {
  const name = suite.name.split(/[\\/]/).slice(-2).join('/');
  lines.push(`# ${name} [${suite.status}]`);
  for (const t of suite.assertionResults) {
    const title = t.fullName.replace(/^.*?›\s*/, '');
    const note = t.status === 'passed' ? '' : ` :: ${(t.failureMessages[0] || '').split('\n')[0]}`;
    lines.push(`  ${t.status}\t${title}${note}`);
  }
}

lines.push('--- failures ---');
for (const suite of r.testResults) {
  if (suite.status === 'failed' && suite.message) {
    lines.push(suite.message.split('\n').slice(0, 6).join('\n'));
  }
}

fs.writeFileSync(process.argv[3], lines.join('\n'), 'utf8');
