import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { TenantContext } from '../tenancy/tenant-context';
import { AuditQueryDto, UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('settings')
  @RequireCapability('manageSettings')
  get() {
    return this.settings.get(this.tenant.get().clinicId);
  }

  @Put('settings')
  @RequireCapability('manageSettings')
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(this.tenant.get(), dto);
  }

  @Get('settings/roles')
  @RequireCapability('manageSettings')
  roles() {
    return this.settings.roles(this.tenant.get().clinicId);
  }

  /** Read only: there is deliberately no update or delete route for the audit trail. */
  @Get('audit')
  @RequireCapability('viewAuditLog')
  audit(@Query() query: AuditQueryDto) {
    return this.settings.auditPage(this.tenant.get().clinicId, query);
  }
}
