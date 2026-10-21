const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

export function isStrongPassword(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}

export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 10 characters and include upper, lower, number, and special character';
