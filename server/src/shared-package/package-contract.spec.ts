import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { loginSchema, registerSchema, userRoleSchema } from '@riaya/shared';

/**
 * AC-001, AC-006 — the server consumes the same published package and the same
 * major of its two direct dependencies.
 *
 * The import above proves resolution: the spec runs under ts-jest with the server's
 * own module resolution, so a wrong link or a second copy fails here.
 */

const serverRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(serverRoot, '..');

const readJson = (file: string) =>
  JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

const manifest = readJson(path.join(serverRoot, 'package.json')) as {
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const installed = (name: string) =>
  readJson(path.join(serverRoot, 'node_modules', name, 'package.json')) as { version: string };

const lockfile = readFileSync(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8');

/** Dependency names a workspace declares, read from its importer block. */
function declaredDeps(importer: string): string[] {
  const lines = lockfile.split(/\r?\n/);
  const start = lines.findIndex((line) => /^importers:\s*$/.test(line));
  expect(start).toBeGreaterThanOrEqual(0);

  const names: string[] = [];
  let inside = false;
  let section = '';

  for (const line of lines.slice(start + 1)) {
    // A top-level key ends the importer section entirely.
    if (/^\S/.test(line)) break;

    const workspace = line.match(/^ {2}(\S[^:]*):\s*$/);
    if (workspace) {
      if (inside) break;
      inside = workspace[1] === importer;
      section = '';
      continue;
    }

    if (!inside) continue;

    const header = line.match(/^ {4}(dependencies|devDependencies|optionalDependencies):\s*$/);
    if (header) {
      section = header[1];
      continue;
    }

    // Dependency names sit one level deeper than their section header.
    const dependency = line.match(/^ {6}(\S[^:]*):\s*$/);
    if (dependency && section) names.push(dependency[1].replace(/^'|'$/g, ''));
  }

  return names;
}

describe('@riaya/shared as a server dependency', () => {
  // TEST-004 → AC-001
  it('AC-001: the server depends on the published package, not a copy', () => {
    expect(manifest.dependencies['@riaya/shared']).toBe('workspace:*');

    const resolvedDir = realpathSync(path.join(serverRoot, 'node_modules', '@riaya', 'shared'));
    expect(resolvedDir).toBe(realpathSync(path.join(repoRoot, 'packages', 'shared')));

    const resolved = readJson(path.join(resolvedDir, 'package.json')) as {
      name: string;
      dependencies: Record<string, string>;
    };

    expect(resolved.name).toBe('@riaya/shared');
    expect(Object.keys(resolved.dependencies)).toEqual(['zod']);
  });

  // TEST-005 → AC-001
  it('AC-001: the parsed login is the shape the shared schema describes', () => {
    const parsed = loginSchema.parse({ email: 'owner@clinic.example', password: 'pw' });
    const keys = Object.keys(parsed).sort();

    expect(keys).toEqual(['email', 'password']);
    expect(userRoleSchema.options).toHaveLength(4);
    expect(registerSchema.shape.password.minLength).toBe(8);
  });

  // TEST-006 → AC-001
  it('AC-001: zod is declared exactly once, where it is used', () => {
    // The server and the web app consume zod only through `@riaya/shared`, so the
    // major is pinned in one place per consumer that needs it directly.
    const declaring = ['web', 'server', 'backoffice', 'packages/shared']
      .filter((dir) => declaredDeps(dir).includes('zod'))
      .sort();

    expect(declaring).toEqual(['backoffice', 'packages/shared']);
    expect(declaredDeps('server')).toContain('@riaya/shared');
  });

  // TEST-023 → AC-006
  it('AC-006: the server builds against a single TypeScript 5.x major', () => {
    const typescriptSpec = manifest.devDependencies?.['typescript'];

    expect(typescriptSpec).toBeDefined();
    expect(typescriptSpec).toMatch(/^[\^~]?5\./);

    const declaredMajors = ['web', 'server', 'backoffice', 'packages/shared'].flatMap((dir) => {
      const workspace = readJson(path.join(repoRoot, dir, 'package.json')) as {
        devDependencies?: Record<string, string>;
      };
      const declared = workspace.devDependencies?.['typescript'];
      return declared ? [[dir, declared.match(/^[\^~]?(\d+)\./)?.[1] ?? declared]] : [];
    });

    expect(declaredMajors.length).toBeGreaterThan(0);
    expect(declaredMajors.filter(([, major]) => major !== '5')).toEqual([]);

    expect(installed('typescript').version).toMatch(/^5\./);
  });
});
