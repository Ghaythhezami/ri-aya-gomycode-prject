---
title: Design tokens and component library
status: backlog
version: v1
feature: design-tokens-and-component-library
productItems: [BP-006]
branch: feature/BP-006
created: 2026-11-04
updated: 2026-11-04
---

# Design tokens and component library — Technical Plan

## 1. Architecture

### 1.1 Approach

Tokens already exist in four disagreeing places (§ Existing Asset Check in `spec.md`). The plan does
**not** introduce a parallel token system; it collapses the four copies into one importable module and
makes the CSS mirror it.

**One source, two projections.**

1. `backoffice/src/design-system/tokens.ts` — a plain TypeScript object (`as const`, no runtime
   dependency). This is the source of truth for TypeScript consumers: `recharts` series colours,
   `DesignSystemPage`, anything that needs a colour value in JS.
2. `backoffice/src/index.css` — the `@theme` block. Tailwind 4 reads this and generates utilities.
   Its values MUST equal `tokens.ts`. It keeps its existing structure, is corrected on the two stale
   values, and gains the spacing/elevation scale.

The two files cannot import each other (CSS cannot read TS, and TS must not parse CSS at build time),
so equality is enforced by a **parity script** rather than by hope. That is the whole point: the
drift this feature exists to fix was two hand-maintained copies.

**Why not generate the CSS from TS?** A build step that writes `@theme` from `tokens.ts` would be
stronger, but it adds a code generator to a Vite project whose CSS is currently a checked-in file, and
the parity script gives the same guarantee with a far smaller diff. If the parity script proves
awkward the generator is the fallback, not the starting point.

**Why not a `packages/tokens` workspace?** No `packages/` directory exists, `web` is out of scope
(`CON-303`), and only one app consumes these tokens. A shared package would add workspace plumbing for
one consumer.

### 1.2 Token contract

| Group | Tokens | Source | Note |
| --- | --- | --- | --- |
| Colour (brand) | `primary #0f766e`, `primary-dark #0b5c56`, `navy #15283f`, `accent #ddf6f3` | existing `@theme`, confirmed | unchanged |
| Colour (surface/text) | `bg #f7f9fc`, `surface #ffffff`, `text #172b4d`, `muted #697586`, `border #e5eaf0`, `border-strong #7b8698` | existing `@theme` | **`muted` corrected** `#64707f` → `#697586` |
| Colour (status) | `success #16a34a`, `warning #f59e0b`, `error #dc2626` | existing `@theme` | **`error` corrected** `#c81e1e` → `#dc2626` |
| Font | `sans` — `Inter, 'Noto Sans Arabic', ui-sans-serif, system-ui, sans-serif` | existing `@theme` | unchanged |
| Radius | `sm 8px`, `md 12px`, `lg 16px`, `full 9999px` | `md`/`lg` exist; `sm`/`full` new | replaces literal `rounded-[12px]` / `rounded-[16px]` |
| Spacing | `1 4px, 2 8px, 3 12px, 4 16px, 5 20px, 6 24px, 8 32px, 10 40px` | new, derived from values already used | 40px floor supports NFR-002 |
| Elevation | `card 0 8px 24px rgba(21,40,63,0.06)`, `overlay 0 16px 40px rgba(21,40,63,0.16)` | `card` exists; `overlay` new | `overlay` for Modal/Popover/Dropdown |

`--color-border-strong: #7b8698` is kept even though only `backoffice` has it — `web`'s subset is
compared against this superset, never merged into it (Risk 5).

### 1.3 Parity and guard scripts

| Script | File | Fails when | Requirement |
| --- | --- | --- | --- |
| Token parity | `scripts/check-token-parity.mjs` | a value in `tokens.ts` differs from `index.css`, or a token exists in only one | FR-001, AC-002 |
| Literal lint | `scripts/check-token-literals.mjs` | a `#rrggbb` literal or `[#…]` arbitrary colour class appears under `backoffice/src` outside the module and `index.css` | FR-012, AC-001 |
| Locale parity | `scripts/check-locale-parity.mjs` | `en`/`ar`/`fr` key sets differ | NFR-001 |

All three are wired into `backoffice`'s `build` script so CI (`BP-003`) fails on them. They are plain
Node ESM with no dependencies added.

### 1.4 Logical-direction strategy

`backoffice/src/common` currently has **no** physical-direction utility (verified by grep: zero
`ml-/mr-/pl-/pr-/text-left/text-right/rounded-l`), so NFR-005 is a guard, not a refactor. The plan adds
the same grep to the literal-lint script so the guard survives future components. Icon mirroring
(NFR-006) uses the existing `[dir='rtl']` convention already present in `web/src/app/globals.css`,
re-declared locally in `backoffice` — not imported across apps.

### 1.5 Components

`reuse` = satisfies the requirement unchanged. `modify` = exists, needs token/A11y changes.
`create` = does not exist.

| Component | Action | File | Notes |
| --- | --- | --- | --- |
| `tokens` | create | `src/design-system/tokens.ts` | source of truth |
| `TokenParityCheck`, `LiteralLint`, `LocaleParityCheck` | create | `scripts/web/` | no runtime code |
| `Button` | modify | `src/common/Button.tsx` | token radii, logical utilities, focus ring |
| `Input` | modify | `src/common/Input.tsx` | token colours, error/help wiring, `aria-describedby` |
| `Badge` | modify | `src/common/Badge.tsx` | status tone not by colour alone (icon or text) |
| `Modal` | modify | `src/common/Modal.tsx` | focus trap, `aria-modal`, Esc, `overlay` elevation |
| `Table` | modify | `src/common/Table.tsx` | add sorting + card-list collapse; `sm`-style tokens |
| `SampleCharts` | modify | `src/common/charts/SampleCharts.tsx` | series colours from `tokens.ts` |
| `Textarea` | create | `src/common/Textarea.tsx` | shares `Field` internals with `Input` |
| `SearchableSelect` | create | `src/common/SearchableSelect.tsx` | combobox pattern |
| `DatePicker` | create | `src/common/DatePicker.tsx` | `Intl` formatting, locale-independent value |
| `TimePicker` | create | `src/common/TimePicker.tsx` | same |
| `Tabs` | create | `src/common/Tabs.tsx` | roving tabindex |
| `Dropdown` | create | `src/common/Dropdown.tsx` | menu button pattern |
| `Tooltip` | create | `src/common/Tooltip.tsx` | hover + focus, `describedby` |
| `Popover` | create | `src/common/Popover.tsx` | viewport repositioning |
| `KpiCard` | create | `src/common/KpiCard.tsx` | optional delta |
| `Toast` | create | `src/common/Toast.tsx` | `aria-live`, provider + hook |
| `ConfirmDialog` | create | `src/common/ConfirmDialog.tsx` | built on `Modal` |
| `Skeleton` | create | `src/common/Skeleton.tsx` | reduced-motion aware |
| `EmptyState` | create | `src/common/EmptyState.tsx` | list/table empty |
| `ErrorState` | create | `src/common/ErrorState.tsx` | fetch failure + retry slot |
| `DesignSystemPage` | modify | `src/pages/DesignSystemPage.tsx` | sectioned, every component + state |
| `RegisterPage`, `StaffDirectoryPage`, `WorkspaceSwitcher` | modify | same | 15 arbitrary colour classes → tokens |
| `en`/`ar`/`fr` catalogues | modify | `src/i18n/*.json` | new component strings |

**Component count**: 15 modified, 17 created, 0 deleted, 0 reused unchanged. `Button`, `Input`,
`Badge`, `Modal` and `Table` are `modify` rather than `reuse` because every one still carries literal
radii or non-token colours.

## 2. Data model

No persistence. The only "model" is the token object shape, which the parity script reads.

- Entity `DesignTokens` — `action: create`, not persisted: `color{…}` (flat `as const`), `radius`,
  `space`, `elevation`, `font`. Field names mirror the CSS custom-property names minus the prefix, so
  the parity mapping is mechanical: `color.primary` ↔ `--color-primary`.
- Entity `LocaleCatalogue` — `action: update`: gains `ds.*` keys for new components; existing 135 keys
  are unchanged.

## 3. Phases

| Phase | Name | Purpose |
| --- | --- | --- |
| P1 | Token foundation | `tokens.ts`, corrected `@theme`, three guard scripts, wire into `build` |
| P2 | Migrate existing | 5 primitives + 3 pages + charts onto tokens; delete the 39 literals |
| P3 | New primitives — forms & navigation | `Textarea`, `SearchableSelect`, `DatePicker`, `TimePicker`, `Tabs`, `Dropdown` |
| P4 | New primitives — feedback & display | `Tooltip`, `Popover`, `KpiCard`, `Toast`, `ConfirmDialog`, `Skeleton`, `EmptyState`, `ErrorState` |
| P5 | Documentation | rebuild `/design-system` around every component and state; `en`/`ar`/`fr` |
| P6 | Verification | lint, typecheck, governance validation, manual RTL/responsive/JS-disabled checks |

P3 and P4 depend on P2 (they consume tokens and the modified `Field`/`Modal` internals). No phase
writes tests — that is `/sdrive:test`.

## 4. Dependencies

| Name | Type | Action | Notes |
| --- | --- | --- | --- |
| `react` | library | no_change | 19.1.0 |
| `react-router-dom` | library | no_change | route for `/design-system` already exists |
| `lucide-react` | library | no_change | icons only (`CON-307`) |
| `recharts` | library | no_change | series colours now read tokens |
| `tailwindcss` (`@tailwindcss/vite`) | library | no_change | `@theme` is the CSS projection |
| `i18next` / `react-i18next` | library | no_change | catalogues extended |
| `Node` (built-in `fs`, `Intl`) | external | no_change | guard scripts add no packages |

**No dependency is added or upgraded.** Storybook is deliberately absent — see `spec.md` Risk 1.

## 5. Risks

Carried from `spec.md` (RISK-001…005); the plan-specific mitigations:

- **R-P1 (from RISK-001, Storybook)**: the owner approved Gate 1 with the `/design-system` surface.
  If Storybook is later required, P5 is the only phase that changes and `CON-308` is amended first.
- **R-P2 (from RISK-003, parity)**: the parity script is written *first* (P1) and run against the
  current tree before any value is corrected, so the two stale values fail loudly and confirm the
  script works. A guard that has never failed is not evidence.
- **R-P3 (Component count)**: 17 new components in two phases is a large diff. Mitigation: P3 and P4
  are independently reviewable; each component lands with its `/design-system` section in the same
  phase rather than deferring all documentation to P5.
- **R-P4 (from RISK-005, `web`)**: `web/src/app/globals.css` is not touched. The parity script reads
  only `backoffice`, so it cannot be tripped by the in-flight `feature/gate-binding` work.
- **R-P5 (NFR-008)**: the design-system page must still render meaningful markup without client state.
  Verification is a manual JS-disabled check in P6, not a task to add tests.
