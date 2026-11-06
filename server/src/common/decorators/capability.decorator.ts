import { SetMetadata } from '@nestjs/common';
import type { Capability } from '@riaya/shared';

export const CAPABILITY_KEY = 'capability';

/**
 * The capability a route needs. RolesGuard resolves the caller's effective capabilities
 * (custom clinic role, customised system role, or the default matrix) through RbacService;
 * unknown means deny.
 */
export const RequireCapability = (capability: Capability) =>
  SetMetadata(CAPABILITY_KEY, capability);
