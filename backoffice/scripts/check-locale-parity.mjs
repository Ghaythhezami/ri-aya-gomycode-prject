#!/usr/bin/env node
/**
 * Fails when the `en`, `ar` and `fr` catalogues do not carry exactly the same keys
 * (CON-304, NFR-001). Missing keys fall back to the English string at runtime, which
 * is how an untranslated surface ships unnoticed — this script makes that a build error.
 *
 * Nested objects are flattened with dotted paths so `ds.modal.confirm` is compared as
 * one key rather than as three levels that happen to agree in structure.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(root, 'src/i18n');
const REQUIRED = ['en', 'ar', 'fr'];

function flatten(value, prefix = '', out = new Set()) {
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.add(prefix);
  }
  return out;
}

const catalogues = new Map();
for (const locale of REQUIRED) {
  const file = join(localesDir, `${locale}.json`);
  catalogues.set(locale, flatten(JSON.parse(readFileSync(file, 'utf8'))));
}

// Any other catalogue present on disk is reported too, so a new locale cannot be
// added without being added here.
for (const name of readdirSync(localesDir)) {
  const locale = name.replace(/\.json$/, '');
  if (name.endsWith('.json') && !REQUIRED.includes(locale)) {
    console.error(`\n✖ ${locale}.json exists but ${locale} is not in REQUIRED — add it to this script.\n`);
    process.exit(1);
  }
}

// Feature catalogues (src/i18n/features/<feature>/<locale>.json) are mounted under
// the feature key at runtime, so they are flattened with that prefix here.
const featuresDir = join(localesDir, 'features');
let featureNames = [];
try {
  featureNames = readdirSync(featuresDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
} catch {
  featureNames = [];
}
for (const feature of featureNames) {
  for (const locale of REQUIRED) {
    const file = join(featuresDir, feature, `${locale}.json`);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      console.error(`
✖ features/${feature}/${locale}.json is missing or not valid JSON.
`);
      process.exit(1);
    }
    if (catalogues.get(locale).has(feature) || [...catalogues.get(locale)].some((k) => k.startsWith(`${feature}.`) && !k.startsWith(`${feature}.__`))) {
      // A root key with the same name would be shadowed at runtime.
      const clash = [...catalogues.get(locale)].find((k) => k === feature || k.startsWith(`${feature}.`));
      if (clash && !clash.startsWith(`${feature}.__`)) {
        console.error(`
✖ ${locale}.json defines "${clash}", which features/${feature} would shadow.
`);
        process.exit(1);
      }
    }
    flatten(parsed, feature, catalogues.get(locale));
  }
}

const union = new Set();
for (const keys of catalogues.values()) for (const key of keys) union.add(key);

const errors = [];
for (const [locale, keys] of catalogues) {
  const missing = [...union].filter((key) => !keys.has(key));
  if (missing.length > 0) {
    errors.push(`${locale}.json is missing ${missing.length} key(s): ${missing.slice(0, 10).join(', ')}${
      missing.length > 10 ? ` … +${missing.length - 10} more` : ''
    }`);
  }
}

if (errors.length > 0) {
  console.error('\n✖ Locale parity failed:\n');
  for (const error of errors) console.error(`  • ${error}`);
  console.error('\nAdd every new key to en.json, ar.json and fr.json in the same change.\n');
  process.exit(1);
}

console.log(`✓ Locale parity: ${REQUIRED.join(', ')} all carry ${union.size} keys`);
