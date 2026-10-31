# Debug Report — D19: “Cannot find name 'describe'” in every server spec file

- **Feature:** authentication-onboarding-and-access-control (v1 — `currentVersion`)
- **Date:** 2026-10-29
- **Agent:** Debug (`/sdrive:debug`)
- **Environment:** Windows, VS Code workspace `C:\Users\KENULE-NWINEE\Documents\Ri-aya`, Node 24.20.0, pnpm 10.11.0, TypeScript 5.9.3
- **Symptom (from the screenshot):** `server/src/tenancy/acceptance-gaps.e2e.spec.ts` shows `ts(2582)` on `describe` (L33), `jest` (L38, L39) and `beforeAll` (L42) — “Cannot find name 'describe'. Do you need to install type definitions for a test runner?” — and the Problems badge reads **66**.

---

## 1. REPRODUCE

| Attempt | Command | Result |
| ------- | ------- | ------ |
| Full server type check, incremental disabled so a stale build info file cannot mask errors | `node server/node_modules/typescript/bin/tsc --noEmit --incremental false` (cwd `server/`) | **exit 0, 0 errors** |
| Program contents | same command with `--listFiles` | `@types/jest/index.d.ts` **is** in the program; all **11** spec files are in the program, including `server/src/tenancy/acceptance-gaps.e2e.spec.ts` |

Evidence: `.sdrive/reports/debug/evidence/tsc-server-clean-2026-10-29.json`

**The defect does not reproduce at compiler level.** The repository type-checks cleanly; only the VS Code TypeScript language service reports it.

## 2. ISOLATE

| Probe | Result |
| ----- | ------ |
| `@types/jest` installed? | **Yes** — 29.5.14, resolving through `node_modules/.pnpm/@types+jest@29.5.14/...` |
| `server/node_modules/@types` contents | `cookie-parser`, `express`, **`jest`**, `node`, `passport-jwt`, `supertest` |
| `server/tsconfig.json` | `include: ["src/**/*"]`, **no** `types` restriction, **no** `typeRoots` → every `@types` package is auto-included |
| Jest config | `server/jest.config.cjs` (`rootDir: src`, `testRegex: .*\.spec\.ts$`, ts-jest) — present and working |
| Duplicate copies of the spec files? | **None** — exactly the 11 real files, all under `server/src` |
| Stray `CUsersKENULE-NWINEEDocumentsRi-aya/` directory | Only 3 tiny probe files (`.t3-probe.tmp`, `T3-PROBE.tmp`, `T3-HANDOFF.md`) — no source copies, already gitignored |
| `typescript.tsdk` in workspace `.vscode/settings.json` | **not set** |
| `typescript.tsdk` in VS Code user settings | **not set** → the editor uses its **bundled** TypeScript |
| TypeScript version per package | server **5.9.3**, web **5.9.3**, backoffice **5.9.3** |

**Decisive arithmetic:** the badge says **66** problems and there are **11** spec files. `66 ÷ 11 = 6` — exactly the six Jest globals each file uses (`describe`, `it`, `expect`, `beforeAll`, `afterAll`, `jest`). In the same file `process.env` lines show **no** error, so `@types/node` resolves while `@types/jest` does not. That signature — node types present, test-runner globals absent, in all 11 files at once — is a program built without the Jest type package, not a broken file.

Evidence: `editor-program-diagnostics-2026-10-29.json`, `server-jest-config-and-types-2026-10-29.json`, `typescript-versions-2026-10-29.json`

## 3. ROOT CAUSE

**The editor's TypeScript language service is serving a stale program that was built before the current dependency tree (with `@types/jest`) existed; the compiler is not.** `pnpm-lock.yaml` changed on this branch and `sdrive update` refreshed 96 `.sdrive` files, but VS Code keeps one long-lived TS server per window and does not rebuild its program when `node_modules/@types` changes underneath it.

## 4. RULED OUT (each with evidence)

| Candidate cause | Verdict |
| --------------- | ------- |
| Missing `@types/jest` | Ruled out — installed (29.5.14) and present in the compiled program |
| `tsconfig.json` excludes `*.spec.ts` | Ruled out — `include: ["src/**/*"]`; all 11 spec files are in the program. (`tsconfig.build.json` deliberately excludes `**/*spec.ts` for `nest build`; that is correct and unrelated) |
| A `types`/`typeRoots` restriction | Ruled out — neither is set in `server/tsconfig.json` |
| The edited file is a duplicate from the mis-quoted path incident | Ruled out — the stray folder holds 3 probe files only; there is exactly one copy of each spec |
| Wrong `typescript.tsdk` | Ruled out — not set in workspace or user settings |
| A real type error in `acceptance-gaps.e2e.spec.ts` | Ruled out — `tsc` reports 0 diagnostics for it |
| Stale `tsconfig.tsbuildinfo` hiding errors | Ruled out as a cause of squiggles, and neutralised in the check by `--incremental false` |

## 5. FIX

**No source change is required.** The repository is correct.

1. In VS Code run **“TypeScript: Restart TS Server”** (`Ctrl+Shift+P`) — or **“Developer: Reload Window”**. The language service rebuilds its program, loads `@types/jest`, and the 66 diagnostics disappear.
2. Verify, in this order:
   - Problems panel → **0** for `server/src/**/*.spec.ts`
   - terminal → `cd server; npx tsc --noEmit` → **no output** (exit 0)

**Optional prophylaxis (local only, `.vscode/*` is gitignored, no version change):** pin the editor to the compiler the CLI uses, so the two can never diverge again.

```json
"typescript.tsdk": "server/node_modules/typescript/lib",
"typescript.enablePromptUseWorkspaceTsdk": true
```

All three packages resolve TypeScript **5.9.3**, so this selects the same version the editor already uses — it only guarantees it keeps using the workspace copy.

## 6. VERIFY

| Check | Before | After |
| ----- | ------ | ----- |
| `tsc --noEmit --incremental false` (server) | (not previously run with `--incremental false`) | **exit 0, 0 errors** |
| `@types/jest` in program | (unproven) | **present** — `@types/jest/index.d.ts` |
| Spec files in program | (unproven) | **11 / 11** |
| `pnpm typecheck` (root, all 3 packages) | pass (earlier this session) | unchanged — no source touched |

No test was added: the defect is not in code, so there is nothing a test could catch. The regression guard is the type check that already exists (`pnpm typecheck`, run by CI in `.github/workflows/ci.yml`).

## 7. RELATED HYGIENE ISSUES SEEN IN THE SAME WINDOW (not fixed here)

These are unrelated to the squiggles and were left untouched:

- `server/probe-redis.cjs` (untracked) and `server/probe-prisma.cjs` — debug probes sitting in the package root.
- `CUsersKENULE-NWINEEDocumentsRi-aya/` — tracked probe files from the earlier mis-quoted-path incident (already added to `.gitignore`, but still tracked).
- `server/src/cache/lockout-persistence.spec.ts` — modified and uncommitted (`M`, `9+`).
- `server/tsconfig.tsbuildinfo` — gitignored; safe.

## 8. LIMITS

- Restarting the language service is an editor action that a CLI agent cannot perform; step 1 is yours to click.
- If the squiggles survive a **window reload**, the next things to capture are: the version shown by **“TypeScript: Select TypeScript Version”**, and **“TypeScript: Open TS Server Log”** after `"typescript.tsserver.log": "verbose"`. On that evidence the conclusion would change from “stale program” to “the editor is not loading any `@types` package for this project”, which would then be fixed with the `typescript.tsdk` pin above.

