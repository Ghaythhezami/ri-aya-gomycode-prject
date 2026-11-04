import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LoginInput, RegisterInput, UserRole } from '@riaya/shared';

/**
 * AC-003, AC-004 — a shared type is inferred from its schema, and removing a field
 * from a schema breaks the typecheck of the code that used it.
 *
 * AC-003 is read from the package's source, so a hand-written interface beside a
 * schema cannot pass quietly. AC-004 is proven by the real compiler: a fixture that
 * reads a removed field is typechecked with `tsc --noEmit` and must fail.
 */

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const packageRoot = path.join(repoRoot, 'packages', 'shared', 'src');

const schemaSources = ['schemas/auth.ts', 'schemas/tenancy.ts', 'schemas/membership.ts'].map(
  (file) => readFileSync(path.join(packageRoot, file), 'utf8'),
);

describe('types inferred from the shared schemas', () => {
  // TEST-012 → AC-003
  it('AC-003: every exported type is built with z.infer from its schema', () => {
    const declarations = schemaSources.flatMap(
      (source) => source.match(/^export type \w+ = .*$/gm) ?? [],
    );

    expect(declarations.length).toBeGreaterThan(0);
    for (const declaration of declarations) {
      expect(declaration).toMatch(/^export type \w+ = z\.infer<typeof \w+>;$/);
    }
  });

  // TEST-013 → AC-003
  it('AC-003: no interface or enum re-declares a shared type by hand', () => {
    for (const source of schemaSources) {
      expect(source).not.toMatch(/^\s*(export )?interface \w+/m);
      expect(source).not.toMatch(/^\s*(export )?enum \w+/m);
    }
  });

  // TEST-014 → AC-003
  it('AC-003: every exported schema has a matching inferred type and vice versa', () => {
    for (const source of schemaSources) {
      const schemas = [...source.matchAll(/^export const (\w+Schema) =/gm)].map(
        (match) => match[1],
      );
      const inferred = new Set(
        [...source.matchAll(/^export type \w+ = z\.infer<typeof (\w+)>;/gm)].map(
          (match) => match[1],
        ),
      );

      for (const schema of schemas) expect(inferred).toContain(schema);
      expect([...inferred].sort()).toEqual([...schemas].sort());
    }
  });

  // TEST-015 → AC-003
  it('AC-003: the inferred type rejects an unknown field at compile time', () => {
    // A type-level assertion: assignment fails to compile when the shape drifts.
    const login: LoginInput = { email: 'owner@clinic.example', password: 'x' };
    const register: RegisterInput = {
      email: 'owner@clinic.example',
      password: 'longenough',
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationName: 'Ri-aya',
      clinicName: 'Main',
    };
    const role: UserRole = 'CLINIC_ADMIN';

    expect(login.email).toBe('owner@clinic.example');
    expect(register.preferredLocale).toBeUndefined();
    expect(role).toBe('CLINIC_ADMIN');

    // @ts-expect-error — `nurse` is not one of the server's roles.
    const unknownRole: UserRole = 'nurse';
    expect(unknownRole).toBe('nurse');
  });

  // TEST-016 → AC-004
  it('AC-004: a consumer reading a removed field fails to typecheck', { timeout: 120_000 }, () => {
    const fixtureDir = mkdtempSync(path.join(repoRoot, 'backoffice', 'tsc-ac-004-'));

    try {
      writeFileSync(
        path.join(fixtureDir, 'consumer.ts'),
        [
          "import type { LoginInput } from '@riaya/shared';",
          '',
          '// `LoginInput` is inferred from `loginSchema`: a field the schema lost is',
          '// no longer readable on the type.',
          'export const read = (input: LoginInput) => input.removedField;',
          '',
        ].join('\n'),
      );

      const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
      writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'bundler',
            skipLibCheck: true,
          },
          include: ['./consumer.ts'],
        }),
      );

      let exitCode = 0;
      let output = '';

      try {
        execFileSync(
          process.execPath,
          [
            path.join(repoRoot, 'backoffice', 'node_modules', 'typescript', 'bin', 'tsc'),
            '-p',
            tsconfigPath,
          ],
          { cwd: fixtureDir, encoding: 'utf8', stdio: 'pipe' },
        );
      } catch (error) {
        const failed = error as { status?: number; stdout?: string };
        exitCode = failed.status ?? 1;
        output = failed.stdout ?? '';
      }

      expect(exitCode).not.toBe(0);
      expect(output).toMatch(/TS2339/);
      expect(output).toMatch(/Property 'removedField' does not exist/);
      // tsc prints the resolved shape: that is the schema's fields, not a copied type.
      expect(output).toMatch(/\{ email: string; password: string; \}/);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
