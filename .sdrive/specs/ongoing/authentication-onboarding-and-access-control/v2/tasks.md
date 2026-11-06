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
