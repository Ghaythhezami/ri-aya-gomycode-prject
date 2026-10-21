import { isStrongPassword } from './password-strength';

describe('isStrongPassword', () => {
  it('accepts a long mixed password', () => {
    expect(isStrongPassword('RiayaAdmin123!')).toBe(true);
  });

  it('rejects short or simple passwords', () => {
    expect(isStrongPassword('short1!A')).toBe(false);
    expect(isStrongPassword('alllowercase1!')).toBe(false);
    expect(isStrongPassword('ALLUPPERCASE1!')).toBe(false);
    expect(isStrongPassword('NoDigits!!!!')).toBe(false);
    expect(isStrongPassword('NoSpecial1234')).toBe(false);
  });
});
