export const workspace = process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? 'http://localhost:5173';

export const links = {
  workspace,
  signIn: `${workspace}/login`,
  signUp: `${workspace}/signup`,
  designSystem: `${workspace}/ui`,
};

export const sections = ['platform', 'how', 'roles', 'security'] as const;
