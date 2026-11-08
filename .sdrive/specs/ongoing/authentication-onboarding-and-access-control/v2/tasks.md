---
title: Authentication, Onboarding & Access Control — Tasks (v2)
feature: authentication-onboarding-and-access-control
version: v2
status: backlog
created: 2026-11-06
updated: 2026-11-06
---

# Execution Tasks (v2)

Production code only. Test authoring and execution belong to `/sdrive:test`.
Requirement links are in parentheses and mirror `traceability.json`; acceptance criteria live in the
matrix, not here, so this list cannot drift from it.

## P8 — Invitation email delivery (Mailtrap)

**Depends on:** —

| ID   | Task                                               | Requirements                      | ACs                    | Done |
| ---- | -------------------------------------------------- | --------------------------------- | ---------------------- | ---- |
| T8.1 | Add the SMTP transport behind `MAIL_SERVICE`       | FR-039, NFR-014, NFR-015, NFR-016 | AC-046, AC-049         | [x]  |
| T8.2 | Render localized invitation and reset templates    | FR-039, FR-040, NFR-016, NFR-017  | AC-047                 | [x]  |
| T8.3 | Persist the invitation status and delivery outcome | FR-041, FR-042                    | AC-048, AC-050, AC-051 | [x]  |
| T8.4 | Paginate and widen the invitation list             | FR-042, NFR-019                   | AC-050, AC-051, AC-052 | [x]  |

## P9 — Cancel, decline and role change

**Depends on:** P8

| ID   | Task                                    | Requirements | ACs                    | Done |
| ---- | --------------------------------------- | ------------ | ---------------------- | ---- |
| T8.5 | Add the invitation cancel endpoint      | FR-043       | AC-053, AC-054, AC-055 | [x]  |
| T8.6 | Add the invitation decline endpoint     | FR-044       | AC-056, AC-057         | [x]  |
| T8.7 | Add the membership role-change endpoint | FR-045       | AC-058, AC-059, AC-060 | [x]  |

## P10 — Link-carried scope and fast accept

**Depends on:** P9

| ID   | Task                                                                | Requirements   | ACs                            | Done |
| ---- | ------------------------------------------------------------------- | -------------- | ------------------------------ | ---- |
| T8.8 | Carry and resolve the link scope with the record as source of truth | FR-046, FR-047 | AC-061, AC-062, AC-063, AC-064 | [x]  |

## P11 — Staff directory lifecycle UI

**Depends on:** P10

| ID    | Task                                                                    | Requirements    | ACs            | Done |
| ----- | ----------------------------------------------------------------------- | --------------- | -------------- | ---- |
| T8.9  | Present the invitation lifecycle on the staff directory                 | FR-048, NFR-019 | AC-050, AC-057 | [x]  |
| T8.10 | Localise the lifecycle strings and add role-change and decline controls | NFR-018, FR-048 | AC-050, AC-057 | [x]  |

## P12 — Verification

**Depends on:** P8, P9, P10, P11

Formatter, linter, typechecker, `sdrive verify`, the governance validator and manual checks only. No test runner is invoked here.

| ID    | Task                                             | Requirements | ACs            | Done |
| ----- | ------------------------------------------------ | ------------ | -------------- | ---- |
| T12.1 | Run the server linter and typechecker            | NFR-014      | —              | [x]  |
| T12.2 | Run the formatter check and governance validator | NFR-015      | —              | [x]  |
| T12.3 | Run the spec-to-code verification                | FR-039       | —              | [x]  |
| T12.4 | Manually confirm the degraded-provider path      | FR-041       | AC-048, AC-049 | [x]  |

## P13 — Review remediation (round 1)

**Depends on:** P12

| ID    | Task                                                                              | Requirements | ACs | Done |
| ----- | --------------------------------------------------------------------------------- | ------------ | --- | ---- |
| T13.1 | Resolve the out-of-scope settings/custom-role, overview and workspace-shell work  | —            | —   | [x]  |
| T13.2 | Run the repository formatter and make `pnpm format:check` pass                    | —            | —   | [ ]  |
| T13.3 | Document the invitation lifecycle and settings changes in README                  | —            | —   | [ ]  |
| T13.4 | Upgrade or formally accept the dev-only critical advisories in the test toolchain | —            | —   | [ ]  |

## P14 — Clinic Settings (extension)

**Depends on:** P13

| ID    | Task                                      | Requirements    | ACs            | Done |
| ----- | ----------------------------------------- | --------------- | -------------- | ---- |
| T14.1 | Align the clinic settings API and audit   | FR-049, NFR-020 | AC-065         | [x]  |
| T14.2 | Harden working-hours and break validation | FR-050          | AC-066, AC-067 | [x]  |
| T14.3 | Enforce custom-role permission ceilings   | FR-051, NFR-021 | AC-068         | [x]  |
| T14.4 | Complete the eight-section settings shell | FR-052          | AC-069         | [x]  |
| T14.5 | Localize and label the settings extension | NFR-022         | AC-069, AC-075 | [x]  |

## P15 — Organization Overview (extension)

**Depends on:** P14

| ID    | Task                                  | Requirements            | ACs            | Done |
| ----- | ------------------------------------- | ----------------------- | -------------- | ---- |
| T15.1 | Scope the organization overview query | FR-053, FR-054, NFR-023 | AC-070, AC-071 | [x]  |
| T15.2 | Finish the overview page states       | FR-053                  | AC-070         | [x]  |

## P16 — Workspace Switching and Clinic Creation (extension)

**Depends on:** P15

| ID    | Task                                            | Requirements    | ACs            | Done |
| ----- | ----------------------------------------------- | --------------- | -------------- | ---- |
| T16.1 | Expose active memberships and the active clinic | FR-055          | AC-072         | [x]  |
| T16.2 | Implement the switch-workspace token rotation   | FR-056, NFR-024 | AC-073         | [x]  |
| T16.3 | Implement create-clinic transaction and audit   | FR-057, NFR-025 | AC-074         | [x]  |
| T16.4 | Finish the switcher, create dialog and header   | FR-058          | AC-072, AC-075 | [x]  |

## P17 — Verification (extension)

**Depends on:** P14, P15, P16

| ID    | Task                                           | Requirements | ACs                    | Done |
| ----- | ---------------------------------------------- | ------------ | ---------------------- | ---- |
| T17.1 | Run the server linter and typechecker          | NFR-020      | —                      | [x]  |
| T17.2 | Run the formatter and governance validator     | NFR-022      | —                      | [ ]  |
| T17.3 | Run the spec-to-code verification              | NFR-023      | —                      | [x]  |
| T17.4 | Manually confirm placeholders and empty states | NFR-024      | AC-069, AC-071, AC-073 | [x]  |
