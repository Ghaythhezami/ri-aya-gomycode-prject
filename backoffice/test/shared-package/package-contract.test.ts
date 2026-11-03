import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AC-001, AC-006 — the package is a real workspace member, every app still
 * installs, and exactly one zod and one TypeScript major serve the workspace.
 *
 * These are facts about the install, so they are read from the manifests and the
 * lockfile rather than from the package's own source.
 */

/** `backoffice/` is two levels below the repository root. */
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const lockfile = () => readFileSync(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8');

function manifest(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8')) as Record<string, unknown>;
}

/**
 * The dependencies an importer declares in the lockfile, as `name -> specifier`.
 * Each importer sits under `importers:` at two-space indent, groups its
 * dependencies under `dependencies:` / `devDependencies:` at four, and gives each
 * dependency a `specifier:` line one level deeper again.
 */
function lockImporters(lock: string): Map<string, Record<string, string>> {
  const importers = new Map<string, Record<string, string>>();

  // Everything between `importers:` and the next top-level key (`packages:`,
  // `snapshots:`, ...) is importer data; the rest of the file is resolutions.
  const lines = lock.split(/\r?\n/);
  const start = lines.findIndex((line) => /^importers:\s*$/.test(line));
  if (start === -1) return importers;

  let current = '';
  let pending = '';

  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;

    const importer = line.match(/^ {2}(\S[^:]*):\s*$/);
    if (importer) {
      current = importer[1];
      importers.set(current, {});
      pending = '';
      continue;
    }

    // A group header is not a dependency.
    if (/^ {4}(dependencies|devDependencies|optionalDependencies):\s*$/.test(line)) {
      pending = '';
      continue;
    }

    const dependency = line.match(/^ {6}(\S[^:]*):\s*$/);
    if (dependency && current) {
      pending = dependency[1].replace(/^'|'$/g, '');
      continue;
    }

    const specifier = line.match(/^ {8}specifier: (.+)$/);
    if (specifier && current && pending) {
      importers.get(current)![pending] = specifier[1].trim().replace(/^'|'$/g, '');
      pending = '';
    }
  }

  return importers;
}

/** Every version of a package the lockfile resolves, e.g. `['4.6.7']` for zod. */
function resolvedMajors(lock: string, name: string): string[] {
  const pattern = new RegExp(`^ {2}${name}@(\\d+)\\.`, 'gm');

  return [...new Set([...lock.matchAll(pattern)].map((match) => match[1]))];
}

describe('packages/shared as a workspace package', () => {
  // TEST-001 → AC-001
  it('AC-001: pnpm-workspace.yaml lists the shared package alongside the three apps', () => {
    const workspace = readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
    const entries = workspace
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^-\s*/, ''))
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    expect(entries).toEqual(expect.arrayContaining(['web', 'server', 'backoffice', 'packages/*']));
    expect(existsSync(path.join(repoRoot, 'packages', 'shared', 'src', 'index.ts'))).toBe(true);
  });

  // TEST-002 → AC-001
  it('AC-001: the existing three apps still install and the two consumers link the shared package', () => {
    const importers = lockImporters(lockfile());

    for (const app of ['web', 'server', 'backoffice', 'packages/shared']) {
      expect(importers.has(app), `${app} is missing from the lockfile importers`).toBe(true);
    }

    expect(importers.get('server')).toHaveProperty('@riaya/shared', 'workspace:*');
    expect(importers.get('backoffice')).toHaveProperty('@riaya/shared', 'workspace:*');
    expect(importers.get('web')).not.toHaveProperty('@riaya/shared');
    expect(importers.get('packages/shared')).toHaveProperty('zod', '^4.6.7');
  });

  // TEST-003 → AC-001
  it('AC-001: exactly one zod major resolves for the package and both consumers', () => {
    const lock = lockfile();

    expect(resolvedMajors(lock, 'zod')).toEqual(['4']);
    expect(manifest('packages/shared/package.json')).toMatchObject({
      name: '@riaya/shared',
      private: true,
      dependencies: { zod: expect.stringMatching(/^\^4\./) },
    });
  });

  // TEST-022 → AC-006
  it('AC-006: the package and both apps typecheck on a single TypeScript major', () => {
    const lock = lockfile();
    const importers = lockImporters(lock);

    const declared = ['web', 'server', 'backoffice', 'packages/shared'].map((pkg) => {
      const specifier = importers.get(pkg)?.typescript;
      expect(specifier, `${pkg} does not declare typescript`).toBeDefined();
      return [pkg, specifier!.replace(/[\^~>=<\s]/g, '').split('.')[0]];
    });

    expect(declared.filter(([, major]) => major !== '5')).toEqual([]);
    expect(resolvedMajors(lock, 'typescript')).toEqual(['5']);
  });
});
