---
title: Application shell — Tasks
status: backlog
version: v1
feature: application-shell
branch: feature/bp-007-bp-010-bp-011-bp-013
created: 2026-11-04
updated: 2026-11-04
---

# Tasks — Application Shell (BP-007)

Production code only. Test authoring and execution belong to `/sdrive:test`.

## P1 — Shell navigation

- [ ] T1.1 — Add `src/layouts/sidebar-preference.ts` reading and writing the collapsed preference in `localStorage`, degrading to `expanded` when storage is unavailable. (FR-001, AC-001)
- [ ] T1.2 — Add the desktop sidebar toggle to `AppShell` with `aria-expanded`, an accessible label, expanded (icon + label) and collapsed (icon only) states, restoring the stored choice. (FR-001, AC-001)
- [ ] T1.3 — Keep each rail icon's accessible name, mark the active route with `aria-current="page"` and a non-colour cue, and make the rail usable by keyboard. (FR-003, NFR-003, AC-002)
- [ ] T1.4 — Use one role matrix for navigation and route guards: derive `App.tsx` guard roles from `NAV_ROLES` and keep `canSee` as the sidebar filter. (FR-004, NFR-007, AC-004)
- [ ] T1.5 — Keep the mobile drawer below `lg`: Escape, backdrop and navigation close, focus trapped while open and restored to the menu button. (FR-002, AC-003)

## P2 — Location and workspace

- [ ] T2.1 — Add `src/layouts/Breadcrumbs.tsx` rendering Overview plus the section and detail from a route-to-i18n-key map, with the final crumb `aria-current="page"` and not linked. (FR-005, AC-005)
- [ ] T2.2 — Add `src/auth/WorkspaceContext.tsx` owning memberships, the active membership and the switch, and refactor `WorkspaceSwitcher` to consume it instead of fetching locally. (FR-006, AC-006)
- [ ] T2.3 — Render the active clinic and organization in the sidebar footer, neutral when there are no memberships, truncating long names without overflowing the header. (FR-006, AC-006)

## P3 — Future affordances

- [ ] T3.1 — Add disabled notification-bell and chat entry points in the top bar with localized accessible names and coming-soon hints, performing no navigation. (FR-007, NFR-005, AC-007)
- [ ] T3.2 — Turn the global search box into an explicit disabled placeholder that announces the coming-soon hint and issues no request. (FR-008, AC-008)

## P4 — Accessibility, RTL and verification

- [ ] T4.1 — Add every new shell string to `en`, `ar` and `fr` in the same change and run the locale-parity guard. (FR-010, NFR-001, AC-012)
- [ ] T4.2 — Replace any physical-direction utility in the layouts with logical equivalents and confirm the sidebar, drawer and breadcrumbs mirror under `dir="rtl"`. (FR-010, NFR-004, AC-010)
- [ ] T4.3 — Ensure every interactive shell target is at least 40 by 40 px, the skip link is first, and the `Dropdown` user menu opens with Enter/Space, closes with Escape and restores focus. (FR-009, NFR-002, NFR-003, AC-009, AC-011)
- [ ] T4.4 — Check the shell at 375, 768, 1024 and 1440 px for horizontal overflow and fix any finding. (NFR-006, AC-011)
- [ ] T4.5 — Run `pnpm --filter backoffice lint`, `tsc --noEmit`, `pnpm --filter backoffice design-system:check`, `sdrive verify application-shell` and `node .sdrive/scripts/validate-governance.js`; all must pass. (NFR-003, FR-010)

No task writes, edits or runs tests; that work belongs to `/sdrive:test`.
