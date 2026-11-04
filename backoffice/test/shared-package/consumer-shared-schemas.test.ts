import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  membershipListSchema,
  membershipViewSchema,
  resetPasswordSchema,
  switchWorkspaceSchema,
  userRoleSchema,
} from '@riaya/shared';

/**
 * AC-002 — a consumer resolves a shared schema from the package's single entry
 * point, and no app keeps a second hand-written copy of the same contract.
 *
 * The import above is itself the first half of the proof: it resolves through the
 * workspace link to `packages/shared/src/index.ts`, not to a copy inside the
 * backoffice. The second half reads the backoffice sources.
 */

const sourceRoot = path.resolve(__dirname, '..', '..', 'src');
const pages = ['LoginPage', 'ForgotPasswordPage', 'ResetPasswordPage'].map((page) =>
  readFileSync(path.join(sourceRoot, 'pages', `${page}.tsx`), 'utf8'),
);
const loginPage = pages[0];

describe('@riaya/shared consumed from the backoffice', () => {
  // TEST-007 → AC-002
  it('AC-002: the single entry point exports every schema the apps share', () => {
    for (const schema of [
      loginSchema,
      changePasswordSchema,
      forgotPasswordSchema,
      resetPasswordSchema,
      switchWorkspaceSchema,
      membershipViewSchema,
      membershipListSchema,
      userRoleSchema,
    ]) {
      expect(typeof schema.safeParse).toBe('function');
    }
  });

  // TEST-008 → AC-002
  it('AC-002: the login page validates through the shared schema instead of its own copy', () => {
    expect(loginPage).toContain("from '@riaya/shared'");
    expect(loginPage).toMatch(/const schema = loginSchema(\.extend\()?/);

    // The local rules are refinements of the shared fields, not a new object.
    expect(loginPage).not.toMatch(/z\.object\(/);
    expect(loginPage).not.toMatch(/z\.string\(\)\.email\(/);

    // Re-applying .min(1) shadows the shared message with zod's default text.
    expect(loginPage).not.toMatch(/\.min\(1,/);
  });

  // TEST-009 → AC-002
  it('AC-002: no backoffice page restates an API DTO with a local z.object', () => {
    const apiDtoFields = [
      'email',
      'password',
      'currentPassword',
      'newPassword',
      'clinicId',
      'token',
    ];

    for (const page of pages) {
      for (const localObject of page.match(/z\.object\([\s\S]*?\}\)/g) ?? []) {
        const restated = apiDtoFields.filter((field) => localObject.includes(`${field}:`));
        expect(restated, `a local z.object restates ${restated.join(', ')}`).toEqual([]);
      }
    }
  });

  // TEST-010 → AC-002
  it('AC-002: the shared schema parses a valid login the same way the page needs', () => {
    const parsed = loginSchema.safeParse({ email: 'owner@clinic.example', password: 'x' });

    expect(parsed.success).toBe(true);
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });

  // TEST-011 → AC-002
  it('AC-002: a consuming form receives the translated message, not a zod default', () => {
    const schema = loginSchema;
    const result = schema.safeParse({ email: 'owner@clinic.example', password: '' });

    expect(result.success).toBe(false);

    // The first issue is the one the form renders; it must be the i18n key.
    const messages = result.error?.issues.map((issue) => issue.message) ?? [];
    expect(messages[0]).toBe('auth.passwordRequired');

    // Re-applying .min(1) only queues a second issue behind zod's own text, so a
    // translated message must live on the shared schema to reach the form.
    expect(messages).not.toContain('Too small: expected string to have >=1 characters');
  });
});
