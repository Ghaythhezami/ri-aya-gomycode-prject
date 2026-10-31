---
feature: authentication-onboarding-and-access-control
version: v1
nfr: NFR-011
status: pass
commit: 99c103670e107448bcad452d3a98771444b7c035
branch: feature/auth-onboarding
recordedAt: 2026-10-31T04:15:00.000Z
recordedBy: specdrive-performance-agent
method: static audit + computed WCAG 2.1 contrast ratios
---

# NFR-011 — Auth screens meet WCAG 2.1 AA

## 1. Verdict

**PASS**, after three defects found by this audit were fixed (see §5).

> **NFR-011:** Auth screens MUST meet WCAG 2.1 AA for contrast, keyboard access and visible focus,
> and MUST render correctly in RTL for Arabic.

## 2. Scope

| Screen                          | File                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| Sign in                         | `backoffice/src/pages/LoginPage.tsx`                                   |
| Registration (owner onboarding) | `backoffice/src/pages/RegisterPage.tsx`                                |
| Accept invitation               | `backoffice/src/pages/AcceptInvitePage.tsx`                            |
| Shared primitives               | `backoffice/src/common/{Button,Input}.tsx`, `backoffice/src/index.css` |

The marketing site (`web`) has no auth screens; the API has no user interface.

## 3. Method

1. Enumerated every colour pair actually rendered on the three screens, resolving Tailwind
   utilities against the `@theme` tokens in `backoffice/src/index.css`.
2. Computed each pair's ratio with the WCAG 2.1 relative-luminance formula
   (`https://www.w3.org/TR/WCAG21/#dfn-relative-luminance`), against the correct threshold:
   **4.5:1** for normal text (1.4.3), **3:1** for UI component boundaries and focus indicators
   (1.4.11).
3. Inspected focus handling, label association, target size, alert roles and RTL behaviour.

## 4. Contrast results (after the fixes in §5)

| Pair                                   | Ratio | Required | Result |
| -------------------------------------- | ----- | -------- | ------ |
| body text `#172b4d` on card `#ffffff`  | 14.10 | 4.5      | PASS   |
| body text on page background `#f7f9fc` | 13.37 | 4.5      | PASS   |
| muted `#64707f` on card                | 5.04  | 4.5      | PASS   |
| muted on page background               | 4.78  | 4.5      | PASS   |
| primary link `#0f766e` on card         | 5.47  | 4.5      | PASS   |
| primary link on page background        | 5.19  | 4.5      | PASS   |
| white label on primary button          | 5.47  | 4.5      | PASS   |
| white label on primary-dark hover      | 7.84  | 4.5      | PASS   |
| error `#c81e1e` on card                | 5.74  | 4.5      | PASS   |
| error on page background               | 5.44  | 4.5      | PASS   |
| error on red-50 banner `#fef2f2`       | 5.24  | 4.5      | PASS   |
| muted placeholder on card              | 5.04  | 4.5      | PASS   |
| input border `#7b8698` vs card         | 3.68  | 3.0      | PASS   |
| input border vs page background        | 3.49  | 3.0      | PASS   |
| focus ring `#0f766e` vs card           | 5.47  | 3.0      | PASS   |
| focus ring vs page background          | 5.19  | 3.0      | PASS   |

16 of 16 pairs pass.

## 5. Defects found and fixed

| #   | Defect                                                                                                     | Before                      | After                                                            |
| --- | ---------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------- |
| A1  | Muted text rendered on the page background (registration and accept-invitation screens have no white card) | 4.44 : 1 — **fails 1.4.3**  | `--color-muted` `#697586` → `#64707f` = 4.78 : 1                 |
| A2  | Error text in the login error banner (`bg-red-50`)                                                         | 4.41 : 1 — **fails 1.4.3**  | `--color-error` `#dc2626` → `#c81e1e` = 5.24 : 1                 |
| A3  | Form controls: a white input on a white card, boundary drawn only by a 1.2:1 border                        | 1.21 : 1 — **fails 1.4.11** | new `--color-border-strong` `#7b8698` used by `Input` = 3.68 : 1 |

A1 and A2 are token changes. A3 adds a dedicated form-control token so decorative borders
(`--color-border`, used by cards, tables and modals) keep their existing, intentional lightness.

`AcceptInvitePage` also carried four hard-coded hex literals (`#172B4D`, `#697586`, `#0F766E`,
`#DC2626`) that bypassed the design tokens; these now use `text-text`, `text-muted`,
`text-primary` and `text-error`, so the fixes above actually reach that screen and the palette has
a single source of truth.

## 6. Keyboard access and visible focus

- A single global rule covers every interactive element:
  `*:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }`
  (`backoffice/src/index.css`). The ring clears 3:1 against both surfaces (5.47 / 5.19).
- `Field` wraps the control in a native `<label>`, so every input has an accessible name and a
  click target on the label text (`backoffice/src/common/Input.tsx:13-22`).
- The password-reveal button is a real `<button type="button">` with an `aria-label` that flips
  between show/hide (`LoginPage.tsx:88-95`), so it is reachable and announced.
- Error text uses `role="alert"`, so it is announced when it appears (`Input.tsx:17`,
  `LoginPage.tsx:52`, `AcceptInvitePage.tsx:95`).
- Interactive targets are `min-h-11` (44 px) or larger, exceeding the AA 24 px minimum.
- A `.skip-link` primitive exists for keyboard users (`index.css:40-52`).

## 7. RTL (Arabic)

`applyDocumentDirection()` sets `document.documentElement.lang` and `.dir` on every language change,
mapping `ar*` → `rtl` (`backoffice/src/i18n/index.ts:22-29`). The auth screens use logical
properties throughout — `pe-12`, `end-0`, `text-end` (`LoginPage.tsx:85,90,98`) — rather than
left/right equivalents, so the layout mirrors correctly. A regression test exists:
`backoffice/test/authentication-onboarding-and-access-control/rtl-direction.test.tsx` (3 tests,
passing).

## 8. Limitations of this evidence

- This is a **static audit plus computed contrast**, not a browser run with assistive technology.
  No axe-core scan, no screen-reader session and no 400 % reflow test was performed.
- Strong recommendation for the next version: add `vitest-axe` (or Playwright + `@axe-core/playwright`)
  to the backoffice suite so 1.4.3/1.4.11 regressions are caught automatically rather than by audit.

## 9. Verification after the fixes

```text
pnpm --filter backoffice typecheck   → exit 0
pnpm --filter backoffice lint        → exit 0 (eslint --max-warnings=0)
pnpm --filter backoffice exec vitest run → 4 files, 7 tests, all passed
```
