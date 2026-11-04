# Test Report: Application Shell (v1)

## 1. Summary

- **Date:** 2026-11-04
- **Feature:** application-shell
- **Version:** v1
- **Total ACs:** 12
- **Tested ACs:** 12
- **Coverage:** 100%
- **Tests Passed:** 15/15

## 2. AC → Test Mapping

| AC ID  | Test ID  | File                                                | Status  |
| ------ | -------- | --------------------------------------------------- | ------- |
| AC-001 | TEST-061 | test/application-shell/shell-navigation.test.tsx    | ✅ Pass |
| AC-002 | TEST-062 | test/application-shell/shell-navigation.test.tsx    | ✅ Pass |
| AC-003 | TEST-063 | test/application-shell/shell-navigation.test.tsx    | ✅ Pass |
| AC-004 | TEST-064 | test/application-shell/shell-navigation.test.tsx    | ✅ Pass |
| AC-005 | TEST-065 | test/application-shell/shell-context.test.tsx       | ✅ Pass |
| AC-006 | TEST-066 | test/application-shell/shell-context.test.tsx       | ✅ Pass |
| AC-007 | TEST-067 | test/application-shell/shell-affordances.test.tsx   | ✅ Pass |
| AC-008 | TEST-068 | test/application-shell/shell-affordances.test.tsx   | ✅ Pass |
| AC-009 | TEST-069 | test/application-shell/shell-accessibility.test.tsx | ✅ Pass |
| AC-010 | TEST-070 | test/application-shell/shell-accessibility.test.tsx | ✅ Pass |
| AC-011 | TEST-071 | test/application-shell/shell-accessibility.test.tsx | ✅ Pass |
| AC-012 | TEST-072 | test/application-shell/shell-accessibility.test.tsx | ✅ Pass |

## 3. Failures

| Test | Reason | Blocking |
| ---- | ------ | -------- |
| None | —      | No       |

## 4. Notes

- **Framework:** Vitest 3.2.7 with jsdom and Testing Library (CON-408). The tests live under
  `backoffice/test/application-shell/` and run with `pnpm --filter backoffice test`.
- **Run:** the feature's 4 files pass (15 tests). The full backoffice suite passes (21 files), and
  the workspace evidence is recorded by `sdrive test`.
- **Structural vs measured:** jsdom lays nothing out, so AC-010 (RTL mirroring) and AC-011 (40 px
  targets, overflow) are proven structurally: no physical-direction utilities render, the sidebar
  anchors with `start-0`, and every shell control carries `min-h-10`/`min-h-11`/`size-10`/`size-11`.
  Real overflow at 375–1440 px remains a browser measurement for `/sdrive:performance`.
- **Mocking:** `useAuth` and `useWorkspace` are mocked so the shell renders without the API; the
  provider's own switch-and-reload path is covered by the BP-011 suite.
- **Interaction states:** the bell, chat and search are disabled affordances; their tests assert
  the accessible names, the localized `shell.comingSoon` description and the disabled state rather
  than a click that cannot occur.
