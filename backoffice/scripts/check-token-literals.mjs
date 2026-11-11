#!/usr/bin/env node
/**
 * Fails when a component bypasses the design tokens, or uses a physical-direction
 * utility that breaks under RTL.
 *
 * Three rules:
 *   1. No `#rrggbb` literal and no `[#…]` arbitrary colour class under src/, outside
 *      tokens.ts and index.css. Colour values belong in the token module (FR-012).
 *   2. No arbitrary-value radius class (`rounded-[16px]`) or raw palette class
 *      (`bg-red-50`). Both bypass the radius/elevation scale in the token module and
 *      drift silently, which is exactly what FR-012 forbids.
 *   3. No physical-direction utility under src/common — `ml-*`, `mr-*`, `pl-*`, `pr-*`,
 *      `text-left`, `text-right`, `rounded-l-*`, `rounded-r-*`, `left-*`, `right-*`.
 *      Logical equivalents (ms-/me-/ps-/pe-/text-start/text-end/inset-inline-*) are
 *      direction-aware and are what NFR-005 requires.
 *
 * Escape hatch: append `// token-lint-ignore` to a line when a literal is genuinely
 * required (for example a third-party prop that cannot read a CSS variable), and say
 * why in the same comment.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const EXTENSIONS = ['.ts', '.tsx', '.css'];

/** Files allowed to declare raw colour values. */
const TOKEN_FILES = new Set(['src/index.css', 'src/design-system/tokens.ts']);

const HEX = /#[0-9a-f]{6}\b/i;
const ARBITRARY_COLOUR = /\b(?:text|bg|border|ring|fill|stroke|from|via|to)-\[#/;
const ARBITRARY_RADIUS = /\brounded-[\w-]*\[(?!var\()/;
const RAW_PALETTE =
  /\b(?:text|bg|border|ring|fill|stroke|from|via|to)-(?:red|green|amber|slate|blue|gray|grey|emerald|teal|indigo|purple|pink|orange|yellow|lime|cyan|sky|violet|fuchsia|rose|zinc|neutral|stone)-[0-9]{2,3}\b/;
const PHYSICAL = [
  /(?<![\w-])(?:ml|mr|pl|pr)-[0-9]/, // physical margin/padding
  /(?<![\w-])(?:left|right)-[0-9]/, // physical inset
  /(?<![\w-])text-(?:left|right)(?![\w-])/, // physical text alignment
  /(?<![\w-])rounded-[lr](?:-[\w[\]-]+)?(?![\w-])/, // physical corner rounding
];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) yield full;
  }
}

const errors = [];
for (const file of walk(src)) {
  const rel = relative(root, file).split(sep).join('/');
  if (TOKEN_FILES.has(rel)) continue;

  const isCommon = rel === 'src/common' || rel.startsWith('src/common/');
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (line.includes('token-lint-ignore')) return;
      const at = `${rel}:${index + 1}`;

      if (HEX.test(line)) {
        errors.push(`${at} raw hex colour literal — use a token or a token utility`);
      } else if (ARBITRARY_COLOUR.test(line)) {
        errors.push(`${at} arbitrary-value colour class — use a token utility`);
      } else if (ARBITRARY_RADIUS.test(line)) {
        errors.push(`${at} arbitrary-value radius class — use rounded-sm/md/lg/full`);
      } else if (RAW_PALETTE.test(line)) {
        errors.push(`${at} raw Tailwind palette class — use a token utility`);
      }

      if (isCommon) {
        for (const pattern of PHYSICAL) {
          const match = line.match(pattern);
          if (match) {
            errors.push(
              `${at} physical-direction utility "${match[0]}" — use a logical equivalent`,
            );
            break;
          }
        }
      }
    });
}

if (errors.length > 0) {
  console.error(`\n✖ Token lint failed — ${errors.length} violation(s):\n`);
  for (const error of errors) console.error(`  • ${error}`);
  console.error(
    '\nColours belong in src/design-system/tokens.ts and the @theme block in src/index.css.\n',
  );
  process.exit(1);
}

console.log(
  '✓ Token lint: no colour literals, arbitrary radii, raw palette or physical-direction utilities',
);
