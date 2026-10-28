# RI'AYA — Design System Plan

> **Status:** Partially confirmed (tokens) / partially proposed (components)
> **Last Updated:** 2026-10-27
> **Source:** MediFlow brief §1 token table, §11 UI-1, repo conventions, `.sdrive/constitution.md` CON-3xx

The colour, font and radius values below are **confirmed** — they come from the brief's token
table. Component inventory and states are **proposed** from the brief's acceptance criteria.
Nothing here is generated implementation code or design tokens in a buildable format.

---

## 1. Confirmed design tokens

Directly from the brief, page 1:

| Token                     | Value                             |
| ------------------------- | --------------------------------- |
| Primary (deep teal)       | `#0F766E`                         |
| Secondary (navy)          | `#15283F`                         |
| Background / Surface      | `#F7F9FC` / `#FFFFFF`             |
| Text primary / secondary  | `#172B4D` / `#697586`             |
| Border                    | `#E5EAF0`                         |
| Success / Warning / Error | `#16A34A` / `#F59E0B` / `#DC2626` |
| Accent (soft cyan)        | `#DDF6F3`                         |
| Font                      | Inter                             |
| Radius                    | 10 to 16 px                       |

Status: **confirmed** — source: brief token table.

## 2. Visual principles

| Principle                        | Why                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Calm clinical palette            | Deep teal + navy read as medical and trustworthy; the soft cyan accent keeps surfaces from feeling flat |
| Data density with breathing room | Receptionists scan long lists; tables and timelines must be scannable, not decorative                   |
| Status is never colour-only      | Brief AC and WCAG 2.1 AA require an icon or text label alongside every status badge                     |
| Real-time feels live, not noisy  | Queue and floor-board updates animate subtly; no distracting motion                                     |
| Both directions are first-class  | Arabic RTL is mirrored, not retrofitted                                                                 |

## 3. Typography

| Aspect      | Plan                                                                            |
| ----------- | ------------------------------------------------------------------------------- |
| Latin font  | **Inter** (confirmed)                                                           |
| Arabic font | **Noto Sans Arabic** (or IBM Plex Sans Arabic) — required by the brief's I18N-1 |
| Scale       | Not yet defined — **[to be confirmed]**                                         |
| Numerals    | Stay Latin/readable in Arabic; charts and phone numbers must not be mirrored    |

Note: `.sdrive/constitution.md` CON-309 records accessibility targets and a token source as
`[to be confirmed]`. The brief supplies the tokens (above) and sets WCAG 2.1 AA, so **CON-309
should be updated** once the owner confirms — flagged as an open question.

## 4. Spacing, radius and elevation

| Aspect                  | Plan                                                       |
| ----------------------- | ---------------------------------------------------------- |
| Radius                  | 10–16 px (confirmed)                                       |
| Spacing scale           | Not yet defined — **[to be confirmed]**                    |
| Shadows                 | "Subtle" per the brief; exact values **[to be confirmed]** |
| Interactive target size | **≥ 40 px** (brief AC)                                     |

## 5. Component inventory (proposed)

From brief UI-1. Every component needs a Storybook story showing **default, hover, focus,
disabled and error** states.

| Component                    | Notes                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Button                       | primary, secondary, tertiary, destructive, icon                    |
| Input / Textarea             | inline validation, error message in the user's language            |
| Searchable select            | patient, doctor, specialty pickers                                 |
| Date & time pickers          | respect locale and clinic timezone                                 |
| Tabs                         | patient profile, settings sections                                 |
| Dropdown / Popover / Tooltip | menus, workspace switcher, help text                               |
| **Data table**               | sort, pagination, column visibility; becomes a card list on mobile |
| **KPI card**                 | value, label, delta vs comparison period                           |
| **Status badge**             | must include icon or text — never colour alone                     |
| Toast                        | success / error feedback                                           |
| Confirm dialog               | required before destructive actions                                |
| Skeleton                     | dashboard first paint < 2 s requires skeletons while loading       |
| Empty state                  | required by the brief for every list                               |
| Error state                  | required by the brief                                              |

Icons: **`lucide-react` only** (brief AC; matches CON-307).
Charts: **`recharts`** (already in the backoffice; brief allows Recharts or ECharts).
Drag and drop: **`dnd-kit`** for the optimisation grid.
Calendar: FullCalendar or a custom grid — **[to be confirmed]**.

## 6. Accessibility requirements

From the brief's non-functional table and UI-1 acceptance criteria:

- **WCAG 2.1 AA** conformance.
- Text contrast **at least 4.5:1**.
- Interactive targets **at least 40 px**.
- **Keyboard accessible**, with **visible focus states**.
- Status badges show an icon or text and **never rely on colour alone**.
- Verified by axe checks plus a manual keyboard test.

## 7. Internationalisation and RTL

| Rule                  | Detail                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Languages             | EN, AR (full RTL), FR — every screen and API message                                                         |
| Document direction    | `dir="rtl"` and `lang` set on `<html>` for Arabic                                                            |
| CSS                   | Use **logical properties** (`margin-inline-start`, `ps-*`, `ms-*`, `start-*`) — never `ml-*`/`left-*`        |
| Icon mirroring        | Mirror direction-implying icons (arrows, chevrons); do **not** mirror clocks, charts or numerals             |
| Fonts                 | Inter for EN/FR, Noto Sans Arabic for AR                                                                     |
| Data                  | Dates, times and numbers formatted with `Intl`; all timestamps stored UTC, clinic timezone applied in the UI |
| Missing keys          | A lint rule or script must **fail the build** on missing translation keys                                    |
| No hard-coded strings | Enforced — same rule as above                                                                                |

## 8. Responsiveness

| Breakpoint      | Behaviour                                                                   |
| --------------- | --------------------------------------------------------------------------- |
| Desktop 1440 px | Full layout, multi-column, wide tables                                      |
| Tablet 768 px   | Stacks correctly; sidebar collapses                                         |
| Mobile 375 px   | **Card lists instead of wide tables**; verified with Playwright screenshots |

Dashboard must **first-paint under 2 s on seeded data**, with skeletons shown while loading.

## 9. Open questions

- Exact typography scale, spacing scale and shadow values.
- Is the calendar FullCalendar or a custom grid?
- Where should tokens live — Tailwind `@theme` in each app, or a shared `packages/shared` module?
- Confirm WCAG target with the constitution owner (brief says 2.1 AA; CON-309 says `[to be confirmed]`).
- Does Storybook ship in the graded deliverable, or is it development-only?
