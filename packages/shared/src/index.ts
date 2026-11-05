/**
 * `@riaya/shared` — the request and response contracts shared by the Ri-aya apps.
 *
 * This is the package's only entry point. Each schema mirrors, field for field, a
 * contract the API already enforces through `class-validator`: the DTOs stay the
 * source of truth for the API, and a change on one side must land on the other in
 * the same change.
 */

export * from './i18n';
export * from './format';
export * from './permissions';
export * from './schemas/auth';
export * from './schemas/tenancy';
export * from './schemas/membership';
export * from './schemas/realtime';
