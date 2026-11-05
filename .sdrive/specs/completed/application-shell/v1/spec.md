---
title: Application shell
status: backlog
version: v1
feature: application-shell
product_items: [BP-007]
branch: feature/bp-007-bp-010-bp-011-bp-013
base: main
created: 2026-11-04
updated: 2026-11-04
---

# Application Shell (BP-007)

> **Product item:** `BP-007` · Milestone M1 — Foundation & shell · Priority P0 · Brief task UI-2
> **Branch / base:** `feature/bp-007-bp-010-bp-011-bp-013` / `main`

## Overview

- **Problem Statement**: `backoffice/src/layouts/AppShell.tsx` already renders a responsive
  sidebar, a mobile drawer, role-filtered navigation, the workspace switcher, the language
  switcher and a user menu. It is still an incomplete shell: there are no breadcrumbs, the
  sidebar has no collapsed mode, the sidebar footer hard-codes "Central Clinic", the top-bar
  search box does nothing and has no stated state, and there are no notification or chat entry
  points. The role matrix that filters navigation (`auth/roles.ts`) is not visibly tied to the
  route guards, so a nav item and its route can drift apart.
- **Proposed Solution**: Finish the shell around the existing structure: add a persisted
  collapsed/expanded desktop sidebar, derive breadcrumbs from a route-to-label map, show the
  active clinic and organization from the session instead of a literal, add disabled
  "coming soon" notification and chat affordances, make the search box an explicit
  non-functional placeholder, and keep one role matrix feeding both navigation and route
  guards. Reuse the BP-006 tokens and primitives; add no dependency.
- **Target Audience**: Every backoffice staff role (SUPER_ADMIN, CLINIC_ADMIN, DOCTOR,
  RECEPTIONIST), and every later feature (BP-008 onward) that renders inside the shell. The
  shell is the frame those screens inherit, so its accessibility and RTL behaviour apply to
  all of them.
- **Assumptions**:
  1. BP-032 (chat) and BP-033 (notifications) are not implemented. Their shell entry points
     ship disabled with the existing `shell.comingSoon` string; they are wired by those
     features, not this one.
  2. Patient and appointment search belong to BP-015/BP-023. The top-bar search stays a
     non-functional placeholder here.
  3. The active membership is available from the existing `/api/auth/memberships` endpoint,
     and BP-009 workspace switching is already implemented.
  4. BP-006 tokens and primitives (`Button`, `Modal`, `Dropdown`, `Tooltip`, `Badge`) are the
     styling and interaction source; this feature adds no new primitive unless a shell-specific
     one is unavoidable.
  5. Accessibility target is WCAG 2.1 AA as stated by the brief (CON-309 is still
     `[to be confirmed]`; no level above AA is claimed).
- **Out of Scope**:
  - Chat and notification behaviour (BP-032, BP-033).
  - Functional global search (BP-015, BP-023).
  - Settings screens, analytics and any clinical screen (BP-021, BP-035, BP-018 onward).
  - Authentication, registration, invitations and workspace switching themselves (already
    delivered by the completed auth/tenancy feature).
  - Dark theme, per-clinic branding and a second shell for `web` (CON-303).

## User Stories

### US-001: Navigate the shell

As a member of clinic staff, I want to reach every screen from a stable, collapsible sidebar,
so that I can work on small screens and keep my preferred layout between sessions.

**Acceptance Criteria:**

- AC-001: Given a desktop viewport (>= 1024 px), when the user activates the sidebar toggle,
  then the sidebar switches between expanded (icon and label) and collapsed (icon only), the
  toggle exposes its state programmatically and has an accessible name, and the choice is
  restored after a reload from `localStorage`.
- AC-002: Given the active route, when the shell renders, then the matching navigation item
  carries `aria-current="page"` and a visible active treatment that is not conveyed by colour
  alone.
- AC-003: Given a viewport under 1024 px, when the menu button is activated, then a drawer
  opens, closes on Escape, on a backdrop click and on navigation, traps focus while open, and
  returns focus to the menu button when closed.
- AC-004: Given any authenticated role, when the shell renders, then it displays only the
  navigation items that role may reach, and every displayed route is also guarded by the same
  role source, so no displayed link leads to a 403 or a dead page.

### US-002: Know where I am and which clinic I am in

As a staff member working across several clinics, I want breadcrumbs and an explicit active
clinic, so that I always know my location in the product and the organisation I am acting for.

**Acceptance Criteria:**

- AC-005: Given any route inside the shell, when it renders, then breadcrumbs show Overview
  plus the section, and the detail segment when the route has one; all segments are translated,
  and the final segment carries `aria-current="page"` and is not a link.
- AC-006: Given an authenticated session with memberships, when the shell renders, then the
  sidebar footer shows the active clinic and organization from the session, never a hard-coded
  name, and the values change after a workspace switch.

### US-003: Stable placeholders for future affordances

As a staff member, I want the shell's future entry points to be visible and honest about their
state, so that I do not mistake a placeholder for a broken feature.

**Acceptance Criteria:**

- AC-007: Given BP-032 and BP-033 are not implemented, when the shell renders, then the
  notification bell and chat entry points are visible but disabled, each has an accessible name
  and a localized "coming soon" explanation, and activating them performs no navigation.
- AC-008: Given the global search input, when the shell renders, then it is present but
  non-functional, announces the localized "coming soon" hint, and issues no network request.

### US-004: Use the shell in my language and with a keyboard

As an Arabic-speaking receptionist who may use a keyboard only, I want the shell to mirror
correctly and to be operable without a mouse, so that the frame never blocks my work.

**Acceptance Criteria:**

- AC-009: Given a keyboard-only user, when they tab from the top of the page, then the skip
  link is the first focusable element, every shell control is reachable in DOM order with a
  visible focus ring, and the user menu opens with Enter or Space and closes with Escape,
  returning focus to its trigger.
- AC-010: Given `dir="rtl"` on the document, when the shell renders, then the sidebar is on the
  right, breadcrumbs and header content mirror, and no physical-direction utility is introduced.
- AC-011: Given a 375, 768, 1024 or 1440 px viewport, when the shell renders, then there is no
  horizontal overflow and every interactive shell target is at least 40 by 40 px.
- AC-012: Given en, ar and fr, when the shell renders, then every new shell string exists in all
  three catalogues and the locale-parity guard passes.

## Requirements

### Functional Requirements

- FR-001: The shell MUST provide a desktop sidebar with expanded and collapsed modes, and MUST
  persist the chosen mode in `localStorage` with an accessible toggle.
- FR-002: The shell MUST keep the mobile drawer below 1024 px, with Escape, backdrop and
  navigation close paths, a focus trap and focus restoration.
- FR-003: The shell MUST indicate the active route visually and with `aria-current="page"`.
- FR-004: Navigation MUST be filtered by a single role matrix that also guards the routes, so a
  visible item is always reachable by that role.
- FR-005: The shell MUST render breadcrumbs from a route-to-label map, localized, with the final
  segment marked `aria-current="page"` and not linked.
- FR-006: The shell MUST display the active clinic and organization from the session, and MUST
  update them after a workspace switch.
- FR-007: The notification bell and chat entry points MUST be present, disabled, and explained
  with the localized coming-soon message until BP-032/BP-033 implement them.
- FR-008: The global search input MUST be present as a disabled placeholder that issues no
  request and explains its state.
- FR-009: The shell MUST provide a skip link, a keyboard-operable user menu and a minimum 40 by
  40 px interactive target.
- FR-010: Every shell string MUST exist in en, ar and fr, and the shell MUST use logical
  direction utilities only.

### Non-Functional Requirements

- NFR-001: The build MUST fail when a shell translation key exists in one catalogue and not the
  others (CON-304, existing locale guard).
- NFR-002: Every interactive shell target MUST be at least 40 by 40 px.
- NFR-003: The shell MUST meet WCAG 2.1 AA for keyboard access, visible focus, correct roles and
  ARIA, and MUST NOT convey the active state by colour alone.
- NFR-004: The shell MUST be direction-aware: no physical-direction utility in the layouts, and
  the drawer, sidebar and breadcrumbs mirror under RTL.
- NFR-005: The shell MUST add no third-party UI library; icons stay `lucide-react` (CON-307,
  CON-308).
- NFR-006: The shell MUST render without horizontal overflow at 375, 768, 1024 and 1440 px.
- NFR-007: Hiding navigation MUST NOT be treated as the authorization boundary; server-side
  role enforcement remains authoritative and the route guards mirror it.

## UI/UX & Data Requirements

- **UI/UX**: Expanded sidebar (`w-64`) and a collapsed icon rail with tooltips/accessible names;
  the mobile drawer reuses the existing overlay; breadcrumbs sit above the page content; the
  clinic and organization appear in the sidebar footer; the bell and chat affordances sit in the
  top bar next to the search placeholder. All spacing, radii and colours come from BP-006 tokens.
- **Data**: The shell reads the authenticated user (`AuthContext`) and the membership list
  (`GET /api/auth/memberships`). It owns no new persistence except the sidebar preference in
  `localStorage`.

## Edge Cases & Error States

- EC-001: A user with no memberships → the workspace switcher hides and the footer shows a
  neutral label instead of an empty or literal clinic name.
- EC-002: A very long clinic or organization name → truncates with an accessible full name, and
  does not push the top bar into overflow.
- EC-003: An unknown route → the breadcrumb map falls back to Overview; the router keeps its
  existing `*` redirect.
- EC-004: `localStorage` is unavailable (private mode, storage disabled) → the sidebar defaults
  to expanded and the shell logs no error.
- EC-005: The user switches workspace and their role changes → navigation reflects the new role
  after the switch, with no stale items.
- EC-006: Collapsed sidebar used by keyboard → each icon still exposes its navigation label.
- EC-007: RTL plus collapsed sidebar → the rail anchors to the right and tooltips remain inside
  the viewport.
- EC-008: A route change while the mobile drawer is open → the drawer closes and focus moves to
  the destination content.

## Security Baseline

BP-007 is a presentation-only shell: it adds no request path, authentication, SQL or cookie
handling. Every CON-51x control is therefore not applicable to this feature with the rationale
below; the completed auth/tenancy feature already implements them server-side.

- CON-511 Authentication: not applicable — no auth surface is added; the shell consumes the
  existing session.
- CON-512 Authorization: not applicable as a new control — navigation filtering is a usability
  mirror of the existing `RolesGuard`; the server remains authoritative (NFR-007).
- CON-513/514/515/516/518/519/520: not applicable — no headers, routes, throttling, DTOs, data
  access, cookies, environment files or transport configuration are added.
- CON-517 XSS: pass — no raw-HTML injection API is introduced; React escaping is relied upon.

## Out of Scope

- Chat and notification behaviour (BP-032/BP-033); only disabled shell affordances ship here.
- Functional search (BP-015/BP-023).
- Settings, analytics and clinical screens.
- Any new dependency, component library or theme.

## Dependencies & Risks

- `react-router-dom` — no change; routes and guards already exist.
- `lucide-react` — no change; icons for the collapsed rail, bell and chat affordances.
- `i18next` / `react-i18next` — no change; shell strings and breadcrumb labels.
- BP-006 tokens and primitives — reuse; no new styling system.
- `GET /api/auth/memberships` — no change; supplies the active clinic and organization.

- RISK-001: The disabled bell and chat entries can look broken. Mitigation: a localized
  coming-soon hint, an accessible explanation and no navigation on activation.
- RISK-002: `NAV_ROLES` and `RoleRoute` can drift. Mitigation: one role source feeds both, and a
  test asserts every navigation entry is reachable by the roles that see it.
- RISK-003: The active clinic can be duplicated between the switcher and the shell footer.
  Mitigation: lift the active membership into one shared source rather than two local copies.
- RISK-004: The collapsed rail can shift layout or overflow in RTL. Mitigation: logical utilities,
  a fixed rail width and the 375–1440 px overflow check.
