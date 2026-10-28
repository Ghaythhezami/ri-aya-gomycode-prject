---
title: Authentication, Onboarding & Access Control â€” Tasks
feature: authentication-onboarding-and-access-control
version: v1
status: backlog
created: 2026-10-28
updated: 2026-10-28
---

# Execution Tasks

6 phases, ordered so each `/sdrive:apply` pass is independently verifiable. No test tasks â€” those belong to `/sdrive:test`.

## P1 â€” Redis-backed security state

**Depends on:** â€”

| ID   | Task                                           | Requirements    | ACs            | Done |
| ---- | ---------------------------------------------- | --------------- | -------------- | ---- |
| T1.1 | Add Redis service to docker-compose            | FR-014, NFR-007 | AC-039         | [x]  |
| T1.2 | Add a Redis health probe and hard-fail mode    | NFR-009         | AC-031         | [x]  |
| T1.3 | Implement a Redis-backed token blacklist store | FR-015          | AC-007, AC-040 | [x]  |
| T1.4 | Implement a Redis-backed login attempt counter | FR-013, FR-014  | AC-008, AC-009 | [x]  |

## P2 â€” Tenancy data model

**Depends on:** P1

| ID   | Task                                                  | Requirements   | ACs            | Done |
| ---- | ----------------------------------------------------- | -------------- | -------------- | ---- |
| T2.1 | Add Organization, Clinic and Membership Prisma models | FR-001, FR-002 | AC-010         | [x]  |
| T2.2 | Add Invitation and AuditLog Prisma models             | FR-007, FR-016 | AC-015, AC-019 | [x]  |
| T2.3 | Generate and review the tenancy migration             | FR-001, FR-002 | AC-010         | [x]  |
| T2.4 | Update the seed script for the tenancy hierarchy      | FR-001, FR-028 | AC-011         | [x]  |

## P3 â€” Scoped tokens and authorization

**Depends on:** P2

| ID   | Task                                               | Requirements   | ACs            | Done |
| ---- | -------------------------------------------------- | -------------- | -------------- | ---- |
| T3.1 | Add org_id, clinic_id and role to the access token | FR-003         | AC-013         | [x]  |
| T3.2 | Resolve tenant scope from the token only           | FR-004         | AC-024, AC-025 | [x]  |
| T3.3 | Re-source the roles guard from membership          | FR-028, FR-002 | AC-011         | [x]  |
| T3.4 | Enforce memberships listing for the switcher       | FR-032, FR-027 | AC-011         | [x]  |
| T3.5 | Implement POST /auth/switch-workspace              | FR-011, FR-012 | AC-013, AC-014 | [x]  |
| T3.6 | Add the last-super-admin invariant                 | FR-029         | AC-022         | [x]  |

## P4 â€” Registration, switching and invitations

**Depends on:** P3

| ID   | Task                                                         | Requirements           | ACs                    | Done |
| ---- | ------------------------------------------------------------ | ---------------------- | ---------------------- | ---- |
| T4.1 | Implement transactional registration                         | FR-005, FR-033         | AC-001, AC-018         | [x]  |
| T4.2 | Implement create-additional-organization for signed-in users | FR-006                 | AC-010                 | [x]  |
| T4.3 | Implement the invitation issue endpoint                      | FR-007, FR-030, FR-031 | AC-015, AC-017         | [x]  |
| T4.4 | Implement accept-invitation and password setting             | FR-008, FR-023, FR-034 | AC-016, AC-026, AC-027 | [x]  |
| T4.5 | Add invitation and reset email templates                     | FR-021, NFR-012        | AC-015, AC-028         | [x]  |
| T4.6 | Implement membership suspension and token invalidation       | FR-018, FR-019, FR-020 | AC-022, AC-023         | [x]  |

## P5 â€” Audit trail and password lifecycle

**Depends on:** P4

| ID   | Task                                            | Requirements            | ACs            | Done |
| ---- | ----------------------------------------------- | ----------------------- | -------------- | ---- |
| T5.1 | Add a transactional audit writer                | FR-016, FR-017, NFR-013 | AC-019, AC-020 | [x]  |
| T5.2 | Apply auditing to auth and membership mutations | FR-016, FR-020          | AC-019, AC-021 | [x]  |
| T5.3 | Add stable machine-readable auth error codes    | FR-024                  | AC-035         | [x]  |
| T5.4 | Revoke sessions on password change and reset    | FR-022                  | AC-029, AC-030 | [x]  |
| T5.5 | Make lockout fail closed and non-enumerable     | FR-013, NFR-009         | AC-008, AC-031 | [x]  |

## P6 â€” Front end, security hardening and contract

**Depends on:** P5

| ID   | Task                                              | Requirements                                                  | ACs                    | Done |
| ---- | ------------------------------------------------- | ------------------------------------------------------------- | ---------------------- | ---- |
| T6.1 | Build the three-step registration wizard          | FR-005                                                        | AC-001, AC-002, AC-003 | [x]  |
| T6.2 | Build the accept-invitation screen                | FR-008, FR-024                                                | AC-016, AC-036         | [x]  |
| T6.3 | Build the workspace switcher                      | FR-032, FR-011                                                | AC-011, AC-012         | [x]  |
| T6.4 | Build the staff directory with invite and suspend | FR-027, FR-018                                                | AC-011, AC-022         | [x]  |
| T6.5 | Localise and mirror every auth screen             | NFR-012, NFR-011                                              | AC-033, AC-034         | [x]  |
| T6.6 | Apply per-endpoint rate limits and cookie policy  | NFR-002, NFR-008, NFR-001, NFR-003, NFR-004, NFR-005, NFR-006 | AC-004, AC-008         | [x]  |
| T6.7 | Document the auth contract in Swagger             | FR-025, FR-026, NFR-007                                       | AC-037, AC-038, AC-039 | [x]  |
