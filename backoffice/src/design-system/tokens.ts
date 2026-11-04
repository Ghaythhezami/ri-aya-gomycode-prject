/**
 * Design tokens — the single source of truth for the backoffice design system.
 *
 * Every value here is mirrored by the `@theme` block in `src/index.css`, which is
 * what Tailwind reads to generate utilities. CSS cannot import TypeScript and
 * TypeScript must not parse CSS at build time, so the two files are kept equal by
 * `scripts/check-token-parity.mjs`, which fails the build if they diverge.
 *
 * Keys are the CSS custom-property name minus its group prefix, so the mapping is
 * mechanical: `color.primary` <-> `--color-primary`, `radius.md` <-> `--radius-md`.
 *
 * Add a token to both files in the same change. Never restate a raw hex value in a
 * component — import it from here, or use the Tailwind utility the token generates.
 */

export const color = {
  primary: '#0f766e',
  'primary-dark': '#0b5c56',
  navy: '#15283f',
  bg: '#f7f9fc',
  surface: '#ffffff',
  text: '#172b4d',
  muted: '#5f6875',
  border: '#e5eaf0',
  'border-strong': '#7b8698',
  success: '#166534',
  warning: '#92400e',
  error: '#b91c1c',
  accent: '#ddf6f3',
} as const;

export const font = {
  sans: "Inter, 'Noto Sans Arabic', ui-sans-serif, system-ui, sans-serif",
} as const;

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  full: '9999px',
} as const;

/**
 * Spacing scale in pixels. `space[10]` (40px) is the minimum interactive target
 * size required by NFR-002.
 */
export const space = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
} as const;

export const elevation = {
  card: '0 8px 24px rgba(21, 40, 63, 0.06)',
  overlay: '0 16px 40px rgba(21, 40, 63, 0.16)',
} as const;

export const tokens = { color, font, radius, space, elevation } as const;

export type TokenGroup = keyof typeof tokens;
