#!/usr/bin/env node
/**
 * Fails when `src/design-system/tokens.ts` and the `@theme` block in `src/index.css`
 * disagree. The two files cannot import each other, so this script is what keeps them
 * equal — a guard that has never failed is not evidence that it works.
 *
 * Compares in both directions: a value that differs, a token present only in
 * TypeScript, and a token present only in CSS are all errors.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PREFIX = {
  color: '--color-',
  font: '--font-',
  radius: '--radius-',
  space: '--spacing-',
  elevation: '--shadow-',
};

function readThemeBlock() {
  const css = readFileSync(join(root, 'src/index.css'), 'utf8');
  const start = css.indexOf('@theme');
  if (start === -1) throw new Error('No @theme block found in src/index.css');
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  if (open === -1 || close === -1) throw new Error('Malformed @theme block in src/index.css');

  const decls = new Map();
  for (const line of css.slice(open + 1, close).split('\n')) {
    const match = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*(.+?);\s*$/i);
    if (match) decls.set(match[1], match[2].trim());
  }
  return decls;
}

// pathToFileURL is required on Windows: the default ESM loader rejects `C:\\...` paths.
const { tokens } = await import(pathToFileURL(join(root, 'src/design-system/tokens.ts')).href);
const css = readThemeBlock();

/** @type {Map<string, string>} */
const ts = new Map();
for (const [group, prefix] of Object.entries(CSS_PREFIX)) {
  const values = tokens[group];
  if (!values) continue;
  for (const [key, value] of Object.entries(values)) ts.set(`${prefix}${key}`, String(value));
}

const errors = [];
for (const [name, value] of ts) {
  if (!css.has(name)) errors.push(`${name} is in tokens.ts (${value}) but missing from @theme`);
  else if (css.get(name) !== value) {
    errors.push(`${name}: tokens.ts has ${value}, index.css has ${css.get(name)}`);
  }
}
for (const [name, value] of css) {
  if (!ts.has(name)) errors.push(`${name} is in @theme (${value}) but missing from tokens.ts`);
}

if (errors.length > 0) {
  console.error(`\n✖ Token parity failed — ${errors.length} mismatch(es):\n`);
  for (const error of errors) console.error(`  • ${error}`);
  console.error('\nFix tokens.ts and the @theme block in src/index.css together.\n');
  process.exit(1);
}

console.log(`✓ Token parity: ${ts.size} tokens match between tokens.ts and index.css`);
