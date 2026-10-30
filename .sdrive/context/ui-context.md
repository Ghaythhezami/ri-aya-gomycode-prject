# UI Context

<!-- source: repository discovery, 2026-10-27 -->

## Observed Project Facts

### Applications and styling stack

| App          | UI framework                    | Styling                                                        | Component source                             |
| ------------ | ------------------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| `web`        | Next.js 15 App Router, React 19 | Tailwind CSS 4 (`@tailwindcss/postcss`, `src/app/globals.css`) | Local components in `web/src/components/`    |
| `backoffice` | React 19 + Vite 6               | Tailwind CSS 4 (`@tailwindcss/vite`)                           | Local primitives in `backoffice/src/common/` |

- Icons: `lucide-react` in both apps.
- Charts: `recharts` in the backoffice.
- No component library (no MUI/Chakra/shadcn) is declared — primitives are hand-rolled.

### Design system

- `README.md`: "The backoffice includes `/design-system` and reusable primitives in `backoffice/src/common` (buttons, modal, table, charts). The marketing site does not reuse those components."
- `backoffice/src/pages/DesignSystemPage.tsx` is the living reference for primitives.
- `backoffice/src/pages/PublicUiPage.tsx` exists alongside it.
- `backoffice` layout primitives live in `backoffice/src/layouts/`.

### Localisation and directionality

- Locales: `en`, `ar` (RTL), `fr`.
- `web`: `next-intl`; locale segment `src/app/[locale]/`; catalogues in `web/messages/*.json`.
- `backoffice`: `i18next` + `i18next-browser-languagedetector` + `react-i18next`; catalogues in `backoffice/src/i18n/*.json`, wired via `backoffice/src/i18n/index.ts`.
- Server exposes `PreferredLocale` (`en`/`ar`/`fr`) on `User`, so locale is a persisted user preference.

### Forms

- `backoffice` uses `react-hook-form` with `@hookform/resolvers` and `zod` schemas for validation.
- Auth screens: `LoginPage`, `SignupPage`, `ForgotPasswordPage`, `ResetPasswordPage`.

### Accessibility

- No explicit accessibility configuration, lint plugin (`eslint-plugin-jsx-a11y`), or audit tooling was found in the repository.
- No documented contrast targets, focus-ring rules, or a11y acceptance criteria.
- `backoffice/eslint.config.js` enables `eslint-plugin-react-hooks` only.

### Design tokens

- No token file (DTCG, JSON, CSS custom-property manifest) was found.
- Tailwind 4 is used without an explicit `@theme` token file in the repository root.

### Figma

- **No Figma link was found in the repository** (searched `*.md`, `*.json`, `*.ts`, `*.tsx` in `web/`, `backoffice/`, `server/`, `.sdrive/`; excluded `node_modules`, `.next`, `dist`, `.pnpm`).
- Consequently no Figma-sourced design rules are recorded here.

## Standard Best Practices (from MCP/skills)

- **ux-ui-library MCP:** unavailable in this environment (`route_task` returned "currently disabled by the user"). No external UI/UX, accessibility, or design-token standards were fetched.
- **Context7:** consulted for NestJS only; no UI library documentation was queried.
- Therefore the UI rules in the constitution are limited to what the repository actually demonstrates. No invented standards are recorded.

## Open Items

- Accessibility baseline (WCAG 2.2 AA target, contrast ratios, focus visibility, keyboard traps, ARIA usage) is **[to be confirmed]** — not documented anywhere in the repository.
- RTL correctness rules for Arabic are **[to be confirmed]** — Arabic catalogues exist, but no documented logical-property (`margin-inline`, `padding-inline`) convention was found.
- A canonical design-token source is **[to be confirmed]**.

## Assumptions

- Tailwind utility classes are the styling mechanism of record; no CSS-in-JS layer is intended. `[assumption]`
- `DesignSystemPage.tsx` is authoritative for backoffice primitives; new primitives should be added there. `[assumption]`
