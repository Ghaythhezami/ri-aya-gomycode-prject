import { Global, Module } from '@nestjs/common';
import { RbacService } from './rbac.service';

/** Global so RolesGuard (used by every feature module) can resolve capabilities. */
@Global()
@Module({
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
