import { Global, Module } from '@nestjs/common';
import { TenancyService } from './tenancy.service';
import { TenantContext } from './tenant-context';

@Global()
@Module({
  providers: [TenancyService, TenantContext],
  exports: [TenancyService, TenantContext],
})
export class TenancyModule {}
