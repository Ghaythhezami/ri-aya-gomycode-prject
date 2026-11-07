import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Get clinic settings',
    description: 'Clinic profile and preferences. Requires the manageSettings capability.',
  })
  @ApiOkResponse({ description: 'ClinicSettingsDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  get() {
    return this.settings.get(this.tenant.get().clinicId);
  }

  @Put('settings')
  @RequireCapability('manageSettings')
  @ApiOperation({
    summary: 'Update clinic settings',
    description: 'Replaces the editable settings. Requires the manageSettings capability.',
  })
  @ApiOkResponse({ description: 'ClinicSettingsDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(this.tenant.get(), dto);
  }

  @Get('settings/roles')
  @RequireCapability('manageSettings')
  @ApiOperation({
    summary: 'Get the role and capability matrix',
    description:
      'Read-only view of which role holds which capability. Requires the manageSettings capability.',
  })
  @ApiOkResponse({ description: 'RoleSummary' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  roles() {
    return this.settings.roles(this.tenant.get().clinicId);
  }

  /** Read only: there is deliberately no update or delete route for the audit trail. */
  @Get('audit')
  @RequireCapability('viewAuditLog')
  @ApiOperation({
    summary: 'List audit log entries',
    description: 'Paginated, append-only audit trail. Requires the viewAuditLog capability.',
  })
  @ApiOkResponse({ description: 'Page of AuditEntry' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  audit(@Query() query: AuditQueryDto) {
    return this.settings.auditPage(this.tenant.get().clinicId, query);
  }
}
