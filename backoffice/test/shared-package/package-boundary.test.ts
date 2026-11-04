import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AC-005 — the package stays a pure contract: schemas, types and `zod`, with no
 * runtime of its own. Anything that reaches for the environment, the network, the
 * clock, React or a translated string makes it a second place to configure.
 */

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const packageRoot = path.join(repoRoot, 'packages', 'shared');
const sourceRoot = path.join(packageRoot, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const files = sourceFiles(sourceRoot);
const sources = files.map((file) => ({
  file: path.relative(packageRoot, file).replace(/\\/g, '/'),
  text: readFileSync(file, 'utf8'),
}));

describe('@riaya/shared package boundary', () => {
  // TEST-017 → AC-005
  it('AC-005: the package declares zod as its only dependency', () => {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    expect(Object.keys(manifest.dependencies ?? {})).toEqual(['zod']);
    expect(manifest.peerDependencies).toBeUndefined();
  });

  // TEST-018 → AC-005
  it('AC-005: every import resolves to zod or to a file inside the package', () => {
    const importPattern = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

    for (const { file, text } of sources) {
      for (const [, specifier] of text.matchAll(importPattern)) {
        const relative = specifier.startsWith('./') || specifier.startsWith('../');
        if (!relative) {
          expect(specifier, `${file} imports ${specifier}`).toBe('zod');
          continue;
        }

        const target = path.resolve(path.dirname(path.join(packageRoot, file)), specifier);
        const resolved = [`${target}.ts`, `${target}/index.ts`].some((candidate) =>
          existsSync(candidate),
        );
        expect(resolved, `${file} imports ${specifier}, which does not exist`).toBe(true);
      }
    }
  });

  // TEST-019 → AC-005
  it('AC-005: the sources touch no environment, no I/O, no clock and no React', () => {
    const forbidden = [
      /process\.env/,
      /\bfetch\s*\(/,
      /\baxios\b/,
      /from 'node:/,
      /from '(http|https|fs|path|os)('|")/,
      /\bnew Date\(/,
      /\bDate\.now\(/,
      /\bconsole\./,
      /from 'react/,
      /\bwindow\./,
      /\blocalStorage\b/,
      /\bdocument\./,
    ];

    for (const { file, text } of sources) {
      for (const pattern of forbidden) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  // TEST-020 → AC-005
  it('AC-005: schemas carry no user-facing message strings', () => {
    for (const { file, text } of sources) {
      // A string literal inside a schema chain is a message or a code, never data.
      const literals = [...text.matchAll(/(min|max|length|regex|email|refine)\([^)]*?'([^']*)'/g)];
      for (const [, , literal] of literals) {
        expect(literal, `${file} passes the message "${literal}"`).toMatch(
          /^[a-z0-9]+(\.[a-zA-Z0-9]+)+$/,
        );
      }
    }
  });

  // TEST-021 → AC-005
  it('AC-005: the package exposes no entry point other than the source index', () => {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      main: string;
      types: string;
      exports: Record<string, unknown>;
    };

    expect(manifest.main).toBe('src/index.ts');
    expect(manifest.types).toBe('src/index.ts');
    expect(Object.keys(manifest.exports)).toEqual(['.']);
    expect(files.map((file) => path.basename(file))).toContain('index.ts');
  });
});
