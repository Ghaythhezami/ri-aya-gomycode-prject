import { loginSchema, type LoginInput } from '@riaya/shared';

export const loginProbe: LoginInput = loginSchema.parse({ email: 'a@b.co', password: 'x' });
