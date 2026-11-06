import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { color, tokens } from '../../src/design-system/tokens';

/**
 * TEST-051 → AC-002.
 *
 * Two claims: the stylesheet and the token module agree (proved by running the
 * real parity script), and the brief's colour values survive verbatim.
 *
 * The brief lists eleven colours, but five of them were raised to meet the 4.5:1
 * text-contrast floor NFR-003 requires, and the plan already corrects two stale
 * values. Those deviations are asserted explicitly rather than relaxed into a
 * "contains at least one of" check, so a silent re-drift still fails.
 */
function run(cwd: string, scriptPath: string): { exitCode: number; output: string } {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath], { cwd, encoding: 'utf8' });
    return { exitCode: 0, output: stdout };
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string };
    return { exitCode: failed.status ?? 1, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}` };
  }
}

/** The brief's values, unchanged where contrast allowed it. */
const BRIEF = {
  primary: '#0f766e',
  'primary-dark': '#0b5c56',
  navy: '#15283f',
  bg: '#f7f9fc',
  surface: '#ffffff',
  text: '#172b4d',
  accent: '#ddf6f3',
  'border-strong': '#7b8698',
} as const;

/** Raised to clear 4.5:1 against their real backgrounds; see the commit that fixed T6.7. */
const RAISED_FOR_CONTRAST = {
  muted: '#5f6875',
  success: '#166534',
  warning: '#92400e',
  error: '#b91c1c',
} as const;

const root = join(__dirname, '../..');

describe('Token contract', () => {
  const scratch: string[] = [];

  afterEach(() => {
    for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('AC-002: the stylesheet and the token module expose the same values', () => {
    const { exitCode, output } = run(root, join(root, 'scripts/check-token-parity.mjs'));

    expect(exitCode, `token parity failed:\n${output}`).toBe(0);
    expect(output).toMatch(/\d+ tokens match/);
  });

  it('AC-002: the brief colour values are present with the brief exact hex', () => {
    for (const [name, hex] of Object.entries(BRIEF)) {
      expect(color[name as keyof typeof color], `${name} drifted from the brief`).toBe(hex);
    }
  });

  it('AC-002: contrast-raised colours are the documented values, not the brief originals', () => {
    for (const [name, hex] of Object.entries(RAISED_FOR_CONTRAST)) {
      expect(color[name as keyof typeof color]).toBe(hex);
    }
  });

  it('AC-002: every colour token exposes a six-digit hex', () => {
    for (const [name, hex] of Object.entries(color)) {
      expect(hex, `${name} is not a hex value`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('AC-002: the token set covers colour, font, radius, space and elevation', () => {
    expect(Object.keys(tokens).sort()).toEqual(['color', 'elevation', 'font', 'radius', 'space']);
    expect(tokens.font.sans).toContain('Inter');
    expect(tokens.font.sans).toContain('Noto Sans Arabic');
    // FR-002: the radius scale covers 10-16 px. `sm` sits below the band on
    // purpose for dense controls, so the claim is that the band is covered.
    const radiusPx = Object.values(tokens.radius)
      .filter((value) => value !== tokens.radius.full)
      .map((value) => Number.parseInt(value, 10));
    expect(radiusPx.some((px) => px >= 10 && px <= 16)).toBe(true);
    expect(Object.keys(tokens.space).length).toBeGreaterThan(0);
    expect(Object.keys(tokens.elevation).length).toBeGreaterThan(0);
  });

  it('AC-002: the parity script reports a real divergence', () => {
    // Positive control: copy the script beside a tokens.ts and an index.css that
    // disagree by one value, and require a non-zero exit naming the token.
    const dir = mkdtempSync(join(tmpdir(), 'token-parity-'));
    scratch.push(dir);
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'src/design-system'), { recursive: true });
    copyFileSync(
      join(root, 'scripts/check-token-parity.mjs'),
      join(dir, 'scripts/check-token-parity.mjs'),
    );
    writeFileSync(
      join(dir, 'src/design-system/tokens.ts'),
      "export const color = { primary: '#0f766e' };\nexport const font = {};\nexport const radius = {};\nexport const space = {};\nexport const elevation = {};\nexport const tokens = { color, font, radius, space, elevation };\n",
    );
    writeFileSync(join(dir, 'src/index.css'), '@theme {\n  --color-primary: #0b5c56;\n}\n');

    const { exitCode, output } = run(dir, join(dir, 'scripts/check-token-parity.mjs'));

    expect(exitCode).toBe(1);
    expect(output).toContain('primary');
  });
});
