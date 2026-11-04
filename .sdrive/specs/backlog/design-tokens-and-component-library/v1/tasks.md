---
title: Design tokens and component library — Tasks
status: backlog
version: v1
feature: design-tokens-and-component-library
branch: feature/BP-006
created: 2026-11-04
updated: 2026-11-04
---

# Tasks — Design tokens and component library (BP-006)

Production code only. Test authoring and execution belong to `/sdrive:test`.

> **Owner constraint (Gate 2):** the existing token definitions are **not** overridden or replaced.
> The `@theme` block in `backoffice/src/index.css` keeps every declaration it already has, and new
> tokens are **added** only where a group or step is missing. The **only** value changes permitted are
> the two corrections to the stale copies — `--color-error #c81e1e` → `#dc2626` and
> `--color-muted #64707f` → `#697586` — and each is confined to that one line.

## P1 — Token foundation

- [x] T1.1 — Create `backoffice/src/design-system/tokens.ts` with colour, radius, spacing, elevation and font groups as `as const` objects whose keys mirror the CSS custom-property names. (FR-001, FR-002)
- [x] T1.2 — **Add** to the existing `@theme` block, without removing or reordering any current declaration: `--radius-sm`, `--radius-full`, `--shadow-overlay`, the spacing scale and the font group. Existing tokens (`--color-primary`, `--color-primary-dark`, `--color-navy`, `--color-bg`, `--color-surface`, `--color-text`, `--color-border`, `--color-border-strong`, `--color-success`, `--color-warning`, `--color-accent`, `--font-sans`, `--radius-md`, `--radius-lg`, `--shadow-card`) and their values stay exactly as they are. (FR-002)
- [x] T1.3 — Write `backoffice/scripts/check-token-parity.mjs` comparing `tokens.ts` against the `@theme` block in both directions and failing on any mismatch or one-sided token. (FR-001, AC-002)
- [x] T1.4 — Write `backoffice/scripts/check-token-literals.mjs` failing on any `#rrggbb` literal or `[#…]` arbitrary colour class under `backoffice/src` outside `tokens.ts` and `index.css`, and on any physical-direction utility under `backoffice/src/common`. (FR-012, NFR-005)
- [x] T1.5 — Write `backoffice/scripts/check-locale-parity.mjs` failing when `en`, `ar` and `fr` key sets differ. (NFR-001)
- [x] T1.6 — Wire the three scripts into `backoffice`'s `build` script before `tsc` so CI fails on a violation, and add a `design-system:check` script for local use. (FR-001, FR-012, NFR-001)
- [x] T1.7 — Correct only the two stale duplicate values, one line each: `--color-error #c81e1e` → `#dc2626` and `--color-muted #64707f` → `#697586`. No other existing value may change. (FR-001, FR-002)
- [x] T1.8 — Run the parity script and confirm it reports zero mismatches, then diff `index.css` against `main` and verify the only removed lines are those two corrections. (FR-001)

## P2 — Migrate existing components onto tokens

- [x] T2.1 — Replace literal radii in `Button`, `Input`, `Badge`, `Modal` and `Table` with token radii and token colours; use logical utilities only. (FR-003, NFR-005)
- [x] T2.2 — Add a visible focus ring, error/help text wiring via `aria-describedby`, and `aria-invalid` to `Input`; add a `Textarea`-compatible `Field` shell. (FR-003, NFR-004)
- [x] T2.3 — Add focus trap, `aria-modal`, Esc-to-close and background inerting to `Modal`; add focus restoration to the invoking element. (FR-003, NFR-004)
- [x] T2.4 — Ensure `Badge` conveys status by icon or text as well as colour. (FR-003, NFR-004)
- [x] T2.5 — Point `common/charts/SampleCharts.tsx` series colours at `tokens.ts`. (FR-003, NFR-009)
- [x] T2.6 — Replace the 15 arbitrary colour classes in `RegisterPage.tsx`, `StaffDirectoryPage.tsx` and `WorkspaceSwitcher.tsx` with token utilities. (FR-012)
- [x] T2.7 — Delete the hard-coded `tokens` array from `DesignSystemPage.tsx` and read `tokens.ts` instead, so the page cannot drift again. (FR-009, FR-012)
- [x] T2.8 — Apply the spacing token floor so every button, input, select, tab and icon-only control in `backoffice/src/common` reaches at least 40 × 40 px, including icon-only triggers whose glyph is smaller than the target. (NFR-002)

## P3 — New primitives: forms and navigation

- [x] T3.1 — `Textarea` sharing the `Input` field shell. (FR-004)
- [x] T3.2 — `SearchableSelect` following the combobox pattern with keyboard selection and type-ahead. (FR-004, NFR-004)
- [x] T3.3 — `DatePicker` and `TimePicker` using `Intl` for display, with locale-independent stored values. (FR-004, FR-010)
- [x] T3.4 — `Tabs` with roving tabindex and correct `tablist`/`tab`/`tabpanel` roles. (FR-004, NFR-004)
- [x] T3.5 — `Dropdown` following the menu-button pattern, with Esc, arrow keys and focus return. (FR-004, NFR-004)

## P4 — New primitives: feedback and display

- [x] T4.1 — `Tooltip` shown on hover and focus, linked by `aria-describedby`. (FR-004, NFR-004)
- [x] T4.2 — `Popover` repositioning into the viewport at any edge. (FR-004, EC-009)
- [x] T4.3 — `KpiCard` with label, value and an optional delta that collapses cleanly when absent. (FR-007, EC-012)
- [x] T4.4 — `Toast` provider and hook supporting success, error and info tones, dismissible, announced through `aria-live`. (FR-006, NFR-004)
- [x] T4.5 — `ConfirmDialog` built on the modified `Modal` with focus restore on cancel. (FR-005, EC-008)
- [x] T4.6 — `Skeleton` respecting reduced-motion preferences. (FR-004, NFR-004)
- [x] T4.7 — `EmptyState` and `ErrorState` as a shared pair. (FR-004)
- [x] T4.8 — Extend `Table` into a `DataTable` with accessible sortable columns and a card-list collapse at the mobile breakpoint. (FR-008, AC-010)

## P5 — Documentation

- [x] T5.1 — Restructure `/design-system` into Tokens, Forms, Navigation and overlays, Data display, Feedback and States sections, each showing its component's states side by side. (FR-009, AC-009)
- [x] T5.2 — Add the Tokens section rendering every token group from `tokens.ts` with its value and usage note. (FR-009, FR-001)
- [x] T5.3 — Mirror the page in Arabic and confirm direction-implying icons flip while clocks, charts and numerals do not. (NFR-006, NFR-005)
- [x] T5.4 — Add every new string to `en`, `ar` and `fr` catalogues. (FR-011, NFR-001)

## P6 — Verification

- [x] T6.1 — Run `pnpm --filter backoffice lint` and resolve every finding without suppressing rules. (NFR-004)
- [x] T6.2 — Run `pnpm --filter backoffice typecheck` and resolve every error. (FR-001)
- [x] T6.3 — Run the three guard scripts and `node .sdrive/scripts/validate-governance.js`; all must pass. (FR-001, FR-012, NFR-001)
- [x] T6.4 — Manually check `/design-system` at 375, 768 and 1440 px for horizontal overflow. (NFR-007)
- [x] T6.5 — Manually check the page in Arabic, and with JavaScript disabled for static content. (NFR-005, NFR-008)
- [x] T6.6 — Confirm no `dangerouslySetInnerHTML` was introduced in any primitive. (NFR-009)
- [x] T6.7 — Check each foreground/background token pair that renders text against a 4.5:1 ratio — `muted` on `bg`, `text` on `surface`, each status tone on its tinted background — and record the results beside the token table. (NFR-003)
