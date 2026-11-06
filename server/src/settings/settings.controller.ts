import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CAPABILITY_ROLES } from '@riaya/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
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
  @Roles(...CAPABILITY_ROLES.manageSettings)
  get() {
    return this.settings.get(this.tenant.get().clinicId);
  }

  @Put('settings')
  @Roles(...CAPABILITY_ROLES.manageSettings)
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(this.tenant.get(), dto);
  }

  @Get('settings/roles')
  @Roles(...CAPABILITY_ROLES.manageSettings)
  roles() {
    return this.settings.roles(this.tenant.get().clinicId);
  }

  /** Read only: there is deliberately no update or delete route for the audit trail. */
  @Get('audit')
  @Roles(...CAPABILITY_ROLES.viewAuditLog)
  audit(@Query() query: AuditQueryDto) {
    return this.settings.auditPage(this.tenant.get().clinicId, query);
  }
}
