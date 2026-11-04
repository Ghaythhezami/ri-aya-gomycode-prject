---
title: Design tokens and component library
status: backlog
version: v1
product_items: [BP-006]
created: 2026-11-04
updated: 2026-11-04
---

# Design Tokens and Component Library (BP-006)

> **Product item:** `BP-006` · Milestone M1 — Foundation & shell · Priority P0 · Brief task UI-1
> **Branch / base:** `feature/BP-006` / `main`

## Overview

- **Problem Statement**: Design tokens already exist in this repository, and they exist **four
  times, in four disagreeing forms**. (1) `backoffice/src/index.css` and (2) `web/src/app/globals.css`
  each declare a hand-copied `@theme` block of the same eleven colours: `web` lists ten colours and no
  radii, `backoffice` lists twelve colours plus two radii, one shadow and a font stack, `backoffice`
  adds `--color-border-strong: #7b8698` that no other copy has, and the two disagree on two values —
  `--color-muted` is `#64707f` in backoffice and `#697586` in web, `--color-error` is `#c81e1e` in
  backoffice and `#dc2626` in web. (3) `DesignSystemPage.tsx` holds a third hard-coded array that
  calls `#697586` "secondary text". (4) Page components bypass tokens entirely: there are **34 hex
  literals across 5 backoffice files**, including **15 arbitrary-value Tailwind classes**
  (`text-[#697586]`, `bg-[#F7F9FC]`) in `RegisterPage.tsx`, `StaffDirectoryPage.tsx` and
  `WorkspaceSwitcher.tsx`, plus four `#0F766E` / `#E5EAF0` series colours hard-coded in
  `common/charts/SampleCharts.tsx`. Because TypeScript cannot import a CSS `@theme` block, tokens are
  not consumable programmatically at all, and there is no spacing or elevation scale beyond a single
  shadow. Only five primitives exist in `backoffice/src/common` (`Button`, `Input`, `Badge`, `Modal`,
  `Table`), so about half the brief's inventory is missing (searchable select, date/time pickers, tabs,
  dropdown, tooltip, popover, KPI card, toast, confirm dialog, skeleton, empty state, error state), and
  there is no Storybook so their states are undocumented. A separate chat thread is also working
  `web`'s own tokens (`feature/gate-binding` — see Dependencies & Risks).
- **Proposed Solution**: Add one typed TypeScript token module inside `backoffice` as the source of
  truth, have the `@theme` block mirror it, and replace the 34 scattered hex literals and 15
  arbitrary-value colour classes with token utilities; migrate the physical-direction utilities in
  the existing primitives to logical ones; build the missing primitives in `backoffice/src/common/`
  with the required states; document every component and state on the existing `/design-system` page;
  and add build-failing checks for token parity and for `en`/`ar`/`fr` locale parity. `web` is not
  touched (`CON-303`); the divergence between the two apps' token blocks is reported, not merged.
- **Target Audience**: Clinic staff using the backoffice (receptionists, clinic admins, doctors) —
  indirectly; directly, the backoffice engineers and subsequent feature work (BP-007 shell, BP-008+
  clinical screens) that must consume one consistent, accessible, RTL-correct component set.
- **Assumptions**:
  1. **Storybook is development-only or not shipped.** `.sdrive/product/design-system.md` §9 lists
     "Does Storybook ship in the graded deliverable?" as open. `CON-308` requires explicit approval
     to add a component-documentation library, and `CON-302` already names the `/design-system` page
     as the demonstration surface. This spec therefore satisfies UI-1's requirement that every
     component and state be _demonstrated_ using the `/design-system` page, and records Storybook as
     out of scope. **This is an assumption the project owner must overturn at Gate 1 if Storybook is
     actually required.**
  2. **`#DC2626` is the correct error colour** (brief §1 and `design-system.md` §1, the majority of
     the copies), so `backoffice/src/index.css` `--color-error: #C81E1E` is the stale copy and is
     corrected to `#DC2626`. **`#697586` is the correct `--color-muted`** for the same reason: it is
     what `web`, `DesignSystemPage.tsx` and three pages already use, so `backoffice`'s `#64707f` is
     the stale copy. Both are corrections, not new values.
  3. **Accessibility target is WCAG 2.1 AA** as stated by the brief and `design-system.md` §6, not
     the `[to be confirmed]` value in `CON-309`. Requirements below cite the brief; `CON-309` still
     needs an owner amendment and is **not** edited by this feature.
  4. The spacing and elevation scales are proposed in this spec (the brief leaves them
     `[to be confirmed]`) from values already used in the codebase, so they are reviewable.
  5. `web` (the marketing site) is out of scope — `CON-303` forbids sharing backoffice primitives.
     `web/src/app/globals.css` has its own `@theme` block whose values diverge from the backoffice's;
     this feature **does not** consolidate or edit it. See Risk — cross-app token divergence.
- **Existing Asset Check (anti-redundancy, run before planning)**: grep for `@theme`, `tailwind.config`,
  `*token*` and hex literals across `backoffice/`, `web/` and the repo root found: no `tokens.ts`,
  no `tailwind.config`, no `packages/` workspace, and no design-token JSON export — **nothing
  importable from TypeScript exists today**. A `@theme` block exists in both apps; 34 hex literals
  across 5 backoffice files duplicate it; `common/charts/SampleCharts.tsx` hard-codes `#0F766E` and
  `#E5EAF0` as series colours. Therefore this feature **extends** the existing `@theme` rather than
  inventing a parallel token system, and FR-012 requires retiring the duplicates.
- **Out of Scope**:
  - Storybook or any other component-documentation tool (see Assumption 1; needs `CON-308` approval).
  - The application shell, sidebar, top bar and navigation (`BP-007`).
  - Any clinical screen, table, form or flow that consumes these primitives.
  - Chart wrappers beyond registering design tokens for `recharts` series colours.
  - The marketing site `web` and its component sources (`CON-303`).
  - Dark theme, theming per clinic, or brand overrides.
  - Dark/light colour-scheme switching of any kind.

## User Stories

### US-001: One source of truth for design tokens

As a backoffice engineer, I want every colour, radius, spacing and elevation value to come from one
declared token set, so that a design change is one edit instead of a hunt through components.

**Acceptance Criteria:**

- AC-001: Given the backoffice source tree, when I search for a hex colour literal (`#rrggbb`) under
  `backoffice/src` outside `index.css` and the token module, then no literal remains in a component
  or page file.
- AC-002: Given the token contract, when I read `backoffice/src/index.css` `@theme` and the typed
  token module, then both expose the same colour, radius, spacing, elevation and font-family values,
  and the brief's eleven colour values are present with the brief's exact hex.
- AC-003: Given the backoffice dev server, when I load `/design-system`, then the token section is
  rendered from the token module rather than a hard-coded array, and each swatch shows its token
  name and resolved hex.

### US-002: RTL-safe and accessible primitives

As an Arabic-speaking receptionist, I want every primitive to mirror correctly and to be operable by
keyboard, so that I can use the product in my own language and without a mouse.

**Acceptance Criteria:**

- AC-004: Given a component file under `backoffice/src/common`, when I inspect its class names, then
  no physical-direction utility (`ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`, `text-left`,
  `text-right`, `rounded-l*`, `rounded-r*`, `border-l*`, `border-r*`) is used.
- AC-005: Given the backoffice with `dir="rtl"` on `<html>`, when I load `/design-system`, then every
  showcased component renders mirrored with no overflowing or clipped content and no horizontal
  scrollbar.
- AC-006: Given a keyboard only, when I tab through `/design-system`, then every interactive
  primitive is reachable in DOM order, shows a visible focus indicator, and can be activated with
  Enter or Space.
- AC-007: Given the `Badge` primitive, when I render any tone, then the status is conveyed by a text
  label in addition to colour, so no state is colour-only.

### US-003: The complete component inventory exists and is documented

As a backoffice engineer, I want the brief's full component set to exist with documented states, so
that I build screens from primitives instead of reinventing them.

**Acceptance Criteria:**

- AC-008: Given `backoffice/src/common`, when I list the primitives, then the inventory contains
  Button, Input/Textarea, SearchableSelect, DatePicker, TimePicker, Tabs, Dropdown, Tooltip,
  Popover, DataTable, KpiCard, Badge, Toast, ConfirmDialog, Skeleton, EmptyState and ErrorState.
- AC-009: Given `/design-system`, when I load the page, then each inventory component has its own
  section demonstrating default, hover, focus and disabled states, and the input-like components
  additionally demonstrate an error state.
- AC-010: Given `/design-system` at a 375 px viewport, when I load the page, then no component
  overflows horizontally and the `DataTable` collapses to a card list.
- AC-011: Given `/design-system` in each of `en`, `ar` and `fr`, when I change the language, then
  every label on the page is translated and no key is missing in any locale.

## Requirements

### Functional Requirements

- FR-001: The system MUST define the design tokens (colour, font family, radius, spacing, elevation)
  in exactly one declared source of truth, consumed by both CSS and TypeScript.
- FR-002: The token set MUST include the brief's eleven colour values verbatim, the Inter and
  Noto Sans Arabic font families, a radius scale covering 10–16 px, a spacing scale, and an elevation
  scale.
- FR-003: The existing `Button`, `Input`/`Field`, `Badge`, `Modal` and `Table` primitives MUST be
  refactored to consume the tokens instead of literal values.
- FR-004: The system MUST add these primitives that do not currently exist: `SearchableSelect`,
  `DatePicker`, `TimePicker`, `Tabs`, `Dropdown`, `Tooltip`, `Popover`, `KpiCard`, `Toast`,
  `ConfirmDialog`, `Skeleton`, `EmptyState`, `ErrorState`, and a `Textarea` variant of the input.
- FR-005: `ConfirmDialog` MUST be usable, and MUST be used, as the confirmation surface before a
  destructive action.
- FR-006: The `Toast` primitive MUST support success, error and information tones, MUST be
  dismissible, and MUST announce itself to assistive technology.
- FR-007: `KpiCard` MUST render a label, a value and an optional delta against a comparison period.
- FR-008: `DataTable` MUST support accessible column sorting and MUST collapse to a card list at the
  mobile breakpoint rather than scrolling horizontally.
- FR-009: The `/design-system` page MUST demonstrate every component in the inventory with its
  required states, replacing the current "Temporary design system" partial listing.
- FR-010: The date and time pickers MUST format and parse with `Intl` and respect the active locale;
  stored values MUST remain locale-independent.
- FR-011: All new user-facing strings MUST be added to all three locale catalogues.
- FR-012: The 34 hex literals in the five backoffice files that bypass the token block
  (`RegisterPage.tsx`, `StaffDirectoryPage.tsx`, `DesignSystemPage.tsx`, `WorkspaceSwitcher.tsx`,
  `common/charts/SampleCharts.tsx`) MUST be replaced by token-derived utilities or token references;
  no flat colour literal may remain in `backoffice/src` outside the token module and `index.css`.

### Non-Functional Requirements

- NFR-001: The build MUST fail when a translation key exists in one of the `en`/`ar`/`fr`
  catalogues and not in the others (`CON-304`).
- NFR-002: Interactive targets MUST be at least 40 × 40 px.
- NFR-003: Text MUST meet a contrast ratio of at least 4.5:1 against its background, and every token
  pair used for text MUST be verified.
- NFR-004: Components MUST satisfy WCAG 2.1 AA: keyboard operable, visible focus, correct roles and
  ARIA attributes, and status never conveyed by colour alone.
- NFR-005: Layout MUST be direction-aware: no physical-direction utility in `backoffice/src/common`
  (`CON-305`).
- NFR-006: Direction-implying icons (chevrons, arrows) MUST mirror under RTL; clocks, charts and
  numerals MUST NOT mirror (`CON-307`, `icons from lucide-react`).
- NFR-007: The `/design-system` route MUST render without horizontal overflow at 375, 768 and 1440 px.
- NFR-008: Components MUST NOT break when JavaScript-driven interactivity is unavailable for static
  content — headings, labels, values and table rows MUST be present in the server-rendered markup
  without client state.
- NFR-009: Adding a component MUST add no third-party UI library (`CON-308`); icons stay
  `lucide-react` and charts stay `recharts`.

## UI/UX & Data Requirements

- **UI/UX**: `/design-system` is restructured into labelled sections — Tokens, Forms, Navigation and
  overlays, Data display, Feedback, States. Every section shows the component's states side by side.
  Arabic mirrors the whole page. Two new primitives the current code lacks: a `Skeleton` used while a
  panel loads and a shared `EmptyState`/`ErrorState` pair for list and fetch outcomes.
- **Data**: No new persistent data. Tokens are static constants; the `Toast` queue and the
  `ConfirmDialog` open/close are client-side component state only. The `KpiCard` delta value is a
  prop, not a computed metric.

## Edge Cases & Error States

- EC-001: A token is renamed → the TypeScript module and the `@theme` block are updated together;
  the token-parity check fails the build if they drift.
- EC-002: A translation key is added to `en` only → the locale-parity check fails the build naming
  the missing key and locale.
- EC-003: `SearchableSelect` has more options than fit the viewport → the list scrolls inside a
  bounded popover, is filtered by typing, and is keyboard navigable with Arrow keys and Enter.
- EC-004: `SearchableSelect` matches nothing → it shows a localised "no results" row rather than an
  empty popover.
- EC-005: A `DatePicker` receives an invalid or unparseable date → it renders the input in its error
  state with a localised message and never throws.
- EC-006: A `DatePicker`/`TimePicker` is used under Arabic → the displayed format follows the locale
  while the emitted value stays in a fixed, locale-independent form.
- EC-007: `Toast` renders with several messages at once → messages stack in a bounded region, do not
  overlap interactive content, and each can be dismissed.
- EC-008: `ConfirmDialog` is dismissed with Escape or a backdrop click → it closes without invoking
  the destructive action, and focus returns to the element that opened it.
- EC-009: `Popover` or `Tooltip` overflows the viewport edge → it repositions into view.
- EC-010: `DataTable` receives zero rows → it renders `EmptyState` instead of a headerless table.
- EC-011: `DataTable` is rendered without a `caption` or equivalent accessible name → it still
  exposes a name to assistive technology.
- EC-012: A `KpiCard` has no delta → it renders without the delta area, with no stray separator.

## Dependencies & Risks

- **External libraries**: none added. `lucide-react` and `recharts` are already dependencies
  (`CON-307`); Tailwind CSS 4 via `@tailwindcss/vite` provides `@theme`.
- **Upstream**: `BP-001` (monorepo and local environment) is archived; `BP-003` supplies lint,
  typecheck and CI which this feature must keep green.
- **Downstream**: `BP-007` (application shell) and every clinical screen consume these primitives.
- **Risk — Storybook scope**: UI-1 names Storybook. Without it, "documented in Storybook" is
  satisfied only by the `/design-system` page. Mitigation: the owner decides at Gate 1; if Storybook
  is required, `CON-308` must be amended first and this spec takes a `v2`.
- **Risk — accessibility target unconfirmed**: `CON-309` marks WCAG level `[to be confirmed]` while
  the brief states AA. This spec follows the brief. Mitigation: owner confirms and amends `CON-309`;
  no requirement here assumes a higher level.
- **Risk — token duplication is already causing drift**: four copies exist and already disagree on
  two values (`--color-error` `#C81E1E` vs `#DC2626`, `--color-muted` `#64707f` vs `#697586`), plus
  34 literals and 15 arbitrary-value classes that bypass the tokens. Mitigation: AC-001, AC-002 and
  FR-012, plus a token-parity check and a literal-lint check.
- **Risk — cross-app token divergence**: `web/src/app/globals.css` and `backoffice/src/index.css` are
  hand-copied `@theme` blocks that have already drifted (muted and error, above). `web`'s own tokens
  are being changed in a separate thread (`feature/gate-binding`), so editing `web` here would
  collide. Mitigation: this feature confines itself to `backoffice` (`CON-303`) and records the
  divergence as a separate follow-up; it must be resolved by whichever feature owns the second app.
- **Risk — merged token sets lose per-app tokens**: `web` declares a subset and `backoffice` declares
  extras (`--color-border-strong`, radii, shadow). Mitigation: the backoffice token module is the
  superset and `web` is only ever compared against it, never merged into it.
- **Risk — scope creep into screens**: building 14 missing primitives invites building the screens
  that use them. Mitigation: Out of Scope is explicit; `/sdrive:review` checks that no clinical
  screen was added.
- **Security Baseline**: this feature touches no authentication, no user input reaching a server and
  no HTTP surface — it is backoffice presentation only. No `CON-51x` control requires expansion;
  `CON-511`–`CON-520` are recorded `NOT APPLICABLE` with that rationale, except `CON-517` (XSS),
  which is honoured by never using `dangerouslySetInnerHTML` in a new primitive.
- **No external research available**: the `ux-ui-library`, `stackwise` and Context7 MCP servers are
  not exposed in this environment. Token values come from the committed brief
  (`.sdrive/product/design-system.md`), the existing `index.css` and the codebase — not from an
  external standard.
