import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * TEST-050 → AC-001, TEST-053 → AC-004.
 *
 * The lint is a Node script that walks `src/`, so the test runs the real script
 * rather than re-implementing its rules. A guard that has never failed is not
 * evidence that it works, so each rule gets a positive control: the script is
 * copied into a scratch tree beside a fixture `src/` that breaks the rule, and
 * must exit non-zero.
 */
const root = join(__dirname, '../..');
const script = join(root, 'scripts/check-token-literals.mjs');

function runLint(cwd: string, scriptPath: string): { exitCode: number; output: string } {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath], { cwd, encoding: 'utf8' });
    return { exitCode: 0, output: stdout };
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: failed.status ?? 1,
      output: `${failed.stdout ?? ''}${failed.stderr ?? ''}`,
    };
  }
}

describe('Colour literals and direction utilities', () => {
  const scratch: string[] = [];

  afterEach(() => {
    for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** Builds `<tmp>/scripts/check-token-literals.mjs` + `<tmp>/src/<relPath>` holding `source`. */
  function runAgainst(relPath: string, source: string) {
    const dir = mkdtempSync(join(tmpdir(), 'token-lint-'));
    scratch.push(dir);
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    copyFileSync(script, join(dir, 'scripts/check-token-literals.mjs'));

    const target = join(dir, relPath);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, source);

    return runLint(dir, join(dir, 'scripts/check-token-literals.mjs'));
  }

  it('AC-001: no hex colour literal or arbitrary colour remains under src', () => {
    const { exitCode, output } = runLint(root, script);

    expect(exitCode, `token lint failed:\n${output}`).toBe(0);
    expect(output).toContain('no colour literals');
  });

  it('AC-004: no physical-direction utility is used in src/common', () => {
    const { exitCode, output } = runLint(root, script);

    expect(exitCode, `physical-direction or literal violation:\n${output}`).toBe(0);
    expect(output).toContain('physical-direction');
  });

  it('AC-001: the guard reports a hex literal when one is present', () => {
    const { exitCode, output } = runAgainst(
      'src/common/Probe.tsx',
      'export const Probe = () => <p className="text-[#ff0000]">x</p>;\n',
    );

    expect(exitCode).toBe(1);
    // The hex rule is checked first, so an arbitrary colour containing a literal
    // hex is reported as the literal — correct, and still a rejection.
    expect(output).toContain('raw hex colour literal');
  });

  it('AC-001: the guard reports an arbitrary colour class without a literal hex', () => {
    const { exitCode, output } = runAgainst(
      'src/common/Probe.tsx',
      'export const Probe = () => <p className="bg-red-500">x</p>;\n',
    );

    expect(exitCode).toBe(1);
    expect(output).toContain('raw Tailwind palette class');
  });

  it('AC-001: the guard reports a bare hex literal when one is present', () => {
    const { exitCode, output } = runAgainst(
      'src/pages/Probe.tsx',
      "export const RED = '#ff0000';\n",
    );

    expect(exitCode).toBe(1);
    expect(output).toContain('raw hex colour literal');
  });

  it('AC-004: the guard reports each physical-direction utility it must catch', () => {
    // One line per rule, because the script stops at the first match per line.
    const cases = [
      'ml-4',
      'mr-2',
      'pl-3',
      'pr-1',
      'left-0',
      'right-6',
      'text-left',
      'text-right',
      'rounded-l-md',
      'rounded-r-lg',
    ];

    for (const utility of cases) {
      const { exitCode, output } = runAgainst(
        'src/common/Probe.tsx',
        `export const Probe = () => <p className="${utility}">x</p>;\n`,
      );

      expect(exitCode, `${utility} should be rejected`).toBe(1);
      expect(output, `${utility} should be named in the error`).toContain(utility);
    }
  });

  it('AC-004: the guard leaves logical-direction utilities alone', () => {
    const { exitCode, output } = runAgainst(
      'src/common/Probe.tsx',
      'export const Probe = () => <p className="ms-4 me-2 ps-3 pe-1 text-start rounded-s-md">x</p>;\n',
    );

    expect(exitCode, `logical utilities must pass:\n${output}`).toBe(0);
  });
});
