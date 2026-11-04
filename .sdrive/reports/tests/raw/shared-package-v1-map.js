// One-off helper for /sdrive:test shared-package v1: list TEST-### ids per test file.
const fs = require('fs');
const path = require('path');

const roots = ['backoffice/test/shared-package', 'server/src/shared-package'];

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (/\.(spec|test)\.(ts|tsx)$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

for (const root of roots) {
  for (const file of walk(root, [])) {
    const code = fs.readFileSync(file, 'utf8');
    const ids = [...new Set([...code.matchAll(/TEST-\d{3}/g)].map((m) => m[0]))];
    const acs = [...new Set([...code.matchAll(/AC-\d{3}/g)].map((m) => m[0]))];
    console.log(file.split(path.sep).join('/'), '|', ids.join(',') || '-', '|', acs.join(','));
  }
}
