# Test Report: Realtime service (v1)

## 1. Summary

- **Date:** 2026-11-04
- **Feature:** realtime-service
- **Version:** v1
- **Total ACs:** 16
- **Tested ACs:** 16
- **Coverage:** 100%
- **Tests Passed:** 46/46

## 2. AC → Test Mapping

| AC ID  | Test ID  | File                                            | Status  |
| ------ | -------- | ----------------------------------------------- | ------- |
| AC-001 | TEST-001 | `src/auth/token.service.spec.ts`                | ✅ Pass |
| AC-001 | TEST-001 | `src/realtime/realtime.gateway.spec.ts`         | ✅ Pass |
| AC-001 | TEST-001 | `src/realtime/connect-throttle.service.spec.ts` | ✅ Pass |
| AC-001 | TEST-001 | `src/realtime/socket-scope.spec.ts`             | ✅ Pass |
| AC-002 | TEST-002 | `src/auth/token.service.spec.ts`                | ✅ Pass |
| AC-002 | TEST-002 | `src/realtime/realtime.gateway.spec.ts`         | ✅ Pass |
| AC-003 | TEST-003 | `src/auth/token.service.spec.ts`                | ✅ Pass |
| AC-003 | TEST-003 | `src/realtime/realtime.gateway.spec.ts`         | ✅ Pass |
| AC-003 | TEST-003 | `src/realtime/socket-scope.spec.ts`             | ✅ Pass |
| AC-004 | TEST-004 | `src/realtime/realtime.gateway.spec.ts`         | ✅ Pass |
| AC-005 | TEST-005 | `src/relay/event-relay.service.spec.ts`         | ✅ Pass |
| AC-006 | TEST-006 | `src/realtime/realtime.gateway.spec.ts`         | ✅ Pass |
| AC-007 | TEST-007 | `src/realtime/realtime.gateway.spec.ts`         | ✅ Pass |
| AC-008 | TEST-008 | `src/relay/event-relay.service.spec.ts`         | ✅ Pass |
| AC-009 | TEST-009 | `src/health/health.controller.spec.ts`          | ✅ Pass |
| AC-010 | TEST-010 | `src/relay/event-relay.service.spec.ts`         | ✅ Pass |
| AC-011 | TEST-011 | `src/relay/event-relay.service.spec.ts`         | ✅ Pass |
| AC-012 | TEST-012 | `src/relay/event-relay.service.spec.ts`         | ✅ Pass |
| AC-013 | TEST-013 | `src/relay/event-relay.service.spec.ts`         | ✅ Pass |
| AC-014 | TEST-014 | `src/relay/realtime-contract.spec.ts`           | ✅ Pass |
| AC-015 | TEST-015 | `src/health/health.controller.spec.ts`          | ✅ Pass |
| AC-016 | TEST-016 | `src/health/health.controller.spec.ts`          | ✅ Pass |

## 3. Failures

| Test | Reason | Blocking |
| ---- | ------ | -------- |
| None | -      | -        |

## 4. Notes

- **Runner.** Jest, colocated `*.spec.ts` under `src/`, matching CON-401 and CON-403. `realtime/jest.config.cjs` and the `test` script are added by this command (task T1.5, deferred by `/sdrive:apply` because the implementation agent must not create test configuration).
- **Coverage.** Statements 94.23%, branches 84.74%, functions 91.42%, lines 93.78% against the CON-407 thresholds of 80/80/70/50. `collectCoverageFrom` is scoped to the modules under test (`auth`, `realtime`, `relay`, `health`), the way `server` scopes its own; bootstrap (`main.ts`), `io-adapter.ts` and the wiring modules are not counted and no threshold was lowered.
- **Hermetic.** No test opens a socket, reads `.env`, or needs Redis or Mongo. Redis clients, the Socket.IO server and the Mongoose connection are replaced with in-test doubles.
- **AC-005 and AC-008 are mechanism-level here.** They assert that an event is addressed only to `clinic:<clinicId>` and that delivery goes through the operator's `local` path rather than a cluster-wide emit - which is precisely what produced duplicate deliveries when it was wrong. The two-instance behaviour itself was verified during `/sdrive:apply` against live Redis and Mongo: one publish reached a client on each instance exactly once, another clinic received nothing, an invalid payload was dropped while the relay kept serving, and a forged room join was refused. That run is manual evidence, not part of this suite.
- **`socket.io-client` was not needed.** The suite uses no socket client, so the dependency stays deferred in `plan.json` rather than being installed for nothing.
- **Withdrawn Criteria:** none. No criterion in `spec.json` carries `withdrawn: true`.
