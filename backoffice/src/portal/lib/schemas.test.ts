import { inviteSchema, passwordStrength, registerSchema } from './schemas';

const VALID = {
  clinicId: 'c1',
  firstNameI18n: { en: 'Sara' },
  lastNameI18n: { ar: 'علي' },
  dateOfBirth: '1990-04-12',
  phone: '+212 600 000 000',
  email: 'sara@example.com',
  password: 'Str0ng!Password',
  preferredLocale: 'en' as const,
  acceptPrivacy: true,
  aiConsent: false,
};

function issues(input: unknown) {
  const result = registerSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe('portal register validation', () => {
  it('accepts a complete form (AI consent stays optional)', () => {
    expect(issues(VALID)).toEqual([]);
  });

  it('needs a first and last name in at least one language', () => {
    expect(issues({ ...VALID, firstNameI18n: { en: '  ' } })).toContain(
      'portal.validation.nameRequired',
    );
    expect(issues({ ...VALID, lastNameI18n: {} })).toContain('portal.validation.nameRequired');
    expect(issues({ ...VALID, firstNameI18n: { fr: 'Sara' } })).toEqual([]);
  });

  it('requires the privacy consent', () => {
    expect(issues({ ...VALID, acceptPrivacy: false })).toContain(
      'portal.validation.privacyRequired',
    );
  });

  it.each(['short1!A', 'alllowercase1!x', 'NOLOWERCASE1!XX', 'NoDigitsHere!!', 'NoSymbolsHere12'])(
    'rejects the weak password %s',
    (password) => {
      expect(issues({ ...VALID, password })).toContain('portal.validation.passwordPolicy');
    },
  );

  it('rejects a bad email, phone and a birth date in the future', () => {
    expect(issues({ ...VALID, email: 'nope' })).toContain('portal.validation.emailInvalid');
    expect(issues({ ...VALID, phone: 'abc' })).toContain('portal.validation.phoneInvalid');
    expect(issues({ ...VALID, dateOfBirth: '2999-01-01' })).toContain(
      'portal.validation.birthDateFuture',
    );
  });

  it('applies the same consent and password rules to invites', () => {
    const bad = inviteSchema.safeParse({
      email: 'a@b.co',
      password: 'weak',
      acceptPrivacy: false,
      aiConsent: false,
    });
    expect(bad.success).toBe(false);
  });
});

describe('passwordStrength', () => {
  it('grows with the rules met', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(1);
    expect(passwordStrength('Abcdefghij1')).toBe(2);
    expect(passwordStrength('Abcdefghij1!')).toBe(3);
    expect(passwordStrength('Abcdefghij1!xyz')).toBe(4);
  });
});
