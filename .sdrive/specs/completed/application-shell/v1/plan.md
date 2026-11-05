---
title: Application shell — Technical Plan
status: backlog
version: v1
feature: application-shell
productItems: [BP-007]
branch: feature/bp-007-bp-010-bp-011-bp-013
created: 2026-11-04
updated: 2026-11-04
---

# Application Shell — Technical Plan

## 1. Architecture

### 1.1 Approach

The shell is not greenfield. `backoffice/src/layouts/AppShell.tsx` already renders a fixed
desktop sidebar (`w-64`), a mobile drawer below `lg`, role-filtered navigation from
`auth/roles.ts`, the workspace switcher, the language switcher and a native `<details>` user
menu. `WorkspaceSwitcher` already owns the membership fetch and the workspace switch.

This plan finishes that structure rather than replacing it. Four additions:

1. A **collapsed rail** on desktop, persisted in `localStorage` behind a small helper that
   tolerates storage being unavailable.
2. **Breadcrumbs** derived from a route-to-i18n-key map in the shell, so pages need no changes.
3. A **single workspace source**: `WorkspaceProvider` owns memberships and the active
   membership, and both `WorkspaceSwitcher` and the sidebar footer read it. Today the switcher
   holds that state privately, so a footer label would be a second copy.
4. **Explicit future affordances**: the notification bell and chat entry points render disabled
   with the existing `shell.comingSoon` copy, and the search box is a disabled placeholder.

`auth/roles.ts` stays the single role matrix. Navigation filters with it, and `App.tsx` passes
the same arrays to `RoleRoute`, so a visible item cannot be a dead link. Hiding an item remains
a usability mirror, never the authorization boundary (NFR-007; the server guards stay
authoritative).

Every visual value comes from the BP-006 tokens, and the shell reuses the existing primitives
instead of adding a component library.

### 1.2 Existing Asset Check (anti-redundancy)

| Asset                                      | Location                               | Decision                                                            |
| ------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------- |
| App shell, sidebar, mobile drawer, top bar | `layouts/AppShell.tsx`                 | **modify** — add rail, breadcrumbs, footer, affordances             |
| Workspace switcher                         | `layouts/WorkspaceSwitcher.tsx`        | **modify** — consume `WorkspaceProvider`                            |
| Language switcher                          | `layouts/LanguageSwitcher.tsx`         | **reuse**                                                           |
| Role matrix and `canSee`                   | `auth/roles.ts`                        | **modify** — expose one map for nav and guards                      |
| Route guards                               | `auth/RoleRoute.tsx`, `App.tsx`        | **modify** `App.tsx` to assert the same roles                       |
| User menu                                  | `AppShell.tsx` native `<details>`      | **modify** — reuse the `Dropdown` primitive for Escape/focus return |
| Button, Dropdown, Tooltip                  | `common/`                              | **reuse**                                                           |
| Tokens and index.css                       | `design-system/tokens.ts`, `index.css` | **reuse** — no new token                                            |
| Locale catalogues                          | `i18n/{en,ar,fr}.json`                 | modify strings only; not a component                                |
| Membership endpoint                        | `GET /api/auth/memberships`            | **reuse** — no server change                                        |

No component is created that duplicates an existing one, and no dependency is added.

### 1.3 Components

| Component            | Action | File                                | Notes                                                    |
| -------------------- | ------ | ----------------------------------- | -------------------------------------------------------- |
| `AppShell`           | modify | `src/layouts/AppShell.tsx`          | rail, breadcrumbs, footer, bell/chat, search placeholder |
| `Breadcrumbs`        | create | `src/layouts/Breadcrumbs.tsx`       | route map, i18n labels, `aria-current`                   |
| `WorkspaceProvider`  | create | `src/auth/WorkspaceContext.tsx`     | memberships + active membership + switch                 |
| `WorkspaceSwitcher`  | modify | `src/layouts/WorkspaceSwitcher.tsx` | consume the provider, no local fetch                     |
| `sidebar-preference` | create | `src/layouts/sidebar-preference.ts` | safe `localStorage` read/write                           |
| `roles`              | modify | `src/auth/roles.ts`                 | one matrix for nav and route guards                      |
| `App`                | modify | `src/App.tsx`                       | guard roles read from the same matrix                    |
| `Button`             | reuse  | `src/common/Button.tsx`             | affordances and footer actions                           |
| `Dropdown`           | reuse  | `src/common/Dropdown.tsx`           | user menu with Escape and focus return                   |
| `Tooltip`            | reuse  | `src/common/Tooltip.tsx`            | collapsed-rail labels and coming-soon hints              |
| `LanguageSwitcher`   | reuse  | `src/layouts/LanguageSwitcher.tsx`  | unchanged                                                |
| `AppShell.tokens`    | reuse  | `src/design-system/tokens.ts`       | spacing, radius, colour, elevation                       |

### 1.4 Role matrix — one source

`auth/roles.ts` keeps `NAV_ROLES` and `canSee`. `AppShell` filters its item list with `canSee`,
and `App.tsx` passes `NAV_ROLES[key]` to `RoleRoute` for the guarded routes, so the two cannot
disagree. A role that cannot see an item therefore cannot open its route and vice versa.

### 1.5 Workspace source

`WorkspaceProvider` wraps the protected shell, calls `GET /api/auth/memberships` once, and
exposes `memberships`, `active`, and `switchTo`. `WorkspaceSwitcher` becomes a view over it, and
the sidebar footer reads the same `active` membership. Switching keeps the existing reload after
`POST /api/auth/switch-workspace`, so every screen refetches under the new scope.

### 1.6 Accessibility strategy

- Skip link stays first in DOM order and targets `#main`.
- The user menu moves to the `Dropdown` primitive: Enter/Space opens, Escape closes, focus
  returns to the trigger.
- The collapsed rail keeps each icon's accessible name, and the toggle exposes `aria-expanded`
  plus an accessible label.
- Navigation marks the current route with `aria-current="page"` and a non-colour cue (weight or
  border), so active state is never colour-only.

## 2. Data model

No persisted entity and no schema change. The only stored value is the sidebar preference
(`expanded` or `collapsed`) in `localStorage`, read and written through
`src/layouts/sidebar-preference.ts` with a try/catch so an unavailable store degrades to
`expanded`.

## 3. Phases

| Phase | Name                                | Purpose                                                                     |
| ----- | ----------------------------------- | --------------------------------------------------------------------------- |
| P1    | Shell navigation                    | preference helper, collapsed rail, active state, single role matrix, drawer |
| P2    | Location and workspace              | breadcrumbs, `WorkspaceProvider`, active clinic/organization footer         |
| P3    | Future affordances                  | disabled bell/chat, search placeholder                                      |
| P4    | Accessibility, RTL and verification | i18n, logical utilities, targets, overflow, guards                          |

## 4. Dependencies

No dependency is added or upgraded. `react-router-dom`, `lucide-react`, `i18next`,
`react-i18next`, `tailwindcss` and the BP-006 primitives are already installed and are reused
as-is.

## 5. Risks

- **R-P1 (RISK-001, dead affordances)**: the bell and chat entries are disabled, carry the
  localized coming-soon hint through `Tooltip`/`aria-describedby`, and perform no navigation.
- **R-P2 (RISK-002, matrix drift)**: `NAV_ROLES` feeds both the sidebar and `App.tsx`; no second
  role list is introduced.
- **R-P3 (RISK-003, clinic duplication)**: `WorkspaceProvider` is the only owner of the active
  membership; the switcher and footer are views.
- **R-P4 (RISK-004, rail layout/RTL)**: a fixed rail width, logical utilities (`ps-*`, `start-*`,
  `end-*`) and the 375–1440 px overflow check.
