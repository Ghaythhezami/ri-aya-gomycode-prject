# Debug Report: API Skeleton and CI (v1)

## 1. Executive Summary

- **Date:** 2026-11-02
- **Auditor:** AI Debug Agent
- **Feature Version:** v1
- **Overall Status:** Fixed
- **Defects Found:** 1 (RUNTIME)

The single defect was a missing top-level `reqId` in the structured log records, which failed AC-001 and AC-002 in the test phase. Root-caused to a pino-http option that was set but inert. Fixed with one option, and the tests that read the record were corrected to the record shape the library actually writes.

## 2. Reproduction

- **Symptom:** AC-001 (`expect(completion).toHaveProperty('reqId', 'safe-id-123')`) and AC-002 fail; no record in the sink carries a top-level `reqId`, so correlation between a handler line and its request record cannot be asserted.
- **Steps:**
  1. `cd server`
  2. `npx jest src/logging/logging.module.spec.ts --reporter=verbose --forceExit`
- **Environment:** Local dev, Windows 11, Node 24.20.0, pino-http 11.0.0, nestjs-pino 5.3.1
- **Reproduced:** Yes — `Tests: 2 failed, 3 passed, 5 total`.

## 3. Evidence (Before)

- **Detection method:** Request capture — the pino transport writes each record to a file, and the suite reads the file back (`.sdrive/reports/debug/evidence/before-reqid.txt`).
- **Observed:** The completion record carries the id only inside the request object:

  ```json
  {"level":30,"msg":"GET /api/probe/ok 200","pid":…,"req":{"id":"safe-id-123","method":"GET","url":"/api/probe/ok"},"res":{"statusCode":200},"responseTime":23,…}
  ```

  No record has a top-level `reqId`.

## 4. Root Cause

- **Class:** RUNTIME
- **Root cause:** pino-http only writes the top-level request id when `quietReqLogger` is truthy, so `customAttributeKeys.reqId` in `logging.module.ts` had no effect and the id stayed nested under `req.id`.
- **Location:** `node_modules/pino-http/logger.js:152` — `const log = quietReqLogger ? logger.child({ [requestIdKey]: req.id }) : logger;` (with `quietReqLogger = !!opts.quietReqLogger` at line 79 and `requestIdKey = opts.customAttributeKeys.reqId || 'reqId'` at line 18). Config site: `server/src/logging/logging.module.ts`.
- **Other defects from the same cause:** The test suite grouped a request's records by `req.url`, which handler lines do not carry once the id is top-level — the AC-002 and AC-003 reads returned no handler line. Not a product defect, but it surfaced with this fix and was corrected in the same change.

## 5. Fix Applied

- **Change:** Added `quietReqLogger: true` to the pino-http options in `LoggingModule`. In the spec, records are now correlated by the top-level `reqId` (read from the completion record, matched across the request's lines), and AC-003 selects the object-logged handler line by its `message` key. Assertions on the AC contract (`reqId` present at top level on both the handler line and the request record, equal to the `X-Request-Id` header) were kept and made stricter.
- **Files touched:**
  - `server/src/logging/logging.module.ts`
  - `server/src/logging/logging.module.spec.ts`
- **Scope justification:** One option in the module is the only production change; the library does the rest. The spec changes only adapt how the sink is read and do not relax any criterion. No other logging behaviour (levels, redaction, serialisers, transport) was touched.

## 6. Evidence (After)

- **Detection method:** Same as Section 3 (`npx jest src/logging src/common/filters --forceExit`), captured in `.sdrive/reports/debug/evidence/after-reqid.txt`.
- **Observed:**

  ```json
  [
    {
      "level": 30,
      "reqId": "8faa4741-…",
      "context": "ProbeController",
      "message": "user loaded",
      "user": { "email": "a@b.test", "password": "[REDACTED]", "token": "[REDACTED]" }
    },
    {
      "level": 30,
      "reqId": "8faa4741-…",
      "req": { "id": "8faa4741-…", "method": "GET", "url": "/api/probe/sensitive" },
      "res": { "statusCode": 200 },
      "responseTime": 6,
      "msg": "GET /api/probe/sensitive 200"
    }
  ]
  ```

  Result: `Test Suites: 3 passed`, `Tests: 22 passed, 22 total` (exit 0).

- **Comparison:** The completion record gained a top-level `reqId` that equals the header value and the `req.id`; handler lines now carry the same `reqId`, so a request's lines are correlated. Redaction is unchanged — `password` and `token` still become `[REDACTED]`.

## 7. Regression Verification

- [x] Reproduction re-run and defect no longer present. (AC-001 and AC-002 both pass.)
- [x] Test suite passed. (`pnpm test --reporter=dot --forceExit` from `server/`: 13 suites passed / 1 skipped, 72 tests passed / 1 skipped, exit 0 — `.sdrive/reports/debug/evidence/after-full-suite.txt`.)
- [ ] Regression test added for this defect. (Not added: AC-001 and AC-002 already assert the top-level `reqId` and failed before the fix, so they are the regression tests.)
- **Limitations:** The one skipped suite is a pre-existing conditional skip in `server/src/cache/lockout-persistence.spec.ts` (unrelated). AC-005/006/007 (CI) remain statically asserted only — Docker and a GitHub runner are unavailable here — and `pnpm audit --prod --audit-level=high` still exits 1 with existing advisories, so the audit gate will fail as reported in the test phase.

## 8. Remaining Recommendations

- Review the two production edits disclosed by the test phase before this fix: `server/src/logging/app-log-stream.ts` and the `LOG_TRANSPORT_TARGET` / `resolveTransport()` wiring (test-only, inactive unless the env var is set).
- The `customAttributeKeys.reqId` entry is now redundant (the key is the library default) but harmless; it was deliberately left in place to keep the diff minimal.
- Re-run `/sdrive:test` to record green evidence for AC-001/AC-002, then `/sdrive:review`.
