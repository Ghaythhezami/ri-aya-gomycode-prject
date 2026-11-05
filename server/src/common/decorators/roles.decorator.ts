import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Allowed role names. Strings rather than the Prisma enum so the values can come
 * from the shared capability matrix (@riaya/shared), which both apps consume.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
