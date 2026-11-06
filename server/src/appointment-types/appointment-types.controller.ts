import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantContext } from '../tenancy/tenant-context';
import { parseAcceptLanguage } from './appointment-type-rules';
import { AppointmentTypesService } from './appointment-types.service';
import {
  AppointmentTypeQueryDto,
  CreateAppointmentTypeDto,
  UpdateAppointmentTypeDto,
} from './dto/appointment-type.dto';

@ApiTags('appointment-types')
@ApiBearerAuth()
@Controller('appointment-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentTypesController {
  constructor(
    private readonly types: AppointmentTypesService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  @RequireCapability('viewAppointments')
  @ApiOperation({ summary: 'List appointment types (names resolved for Accept-Language)' })
  list(@Query() query: AppointmentTypeQueryDto, @Headers('accept-language') lang?: string) {
    return this.types.list(this.tenant.get().clinicId, {
      includeInactive: query.includeInactive,
      locale: parseAcceptLanguage(lang),
    });
  }

  @Post()
  @RequireCapability('manageSettings')
  @ApiOperation({ summary: 'Create a custom appointment type' })
  create(@Body() dto: CreateAppointmentTypeDto, @Headers('accept-language') lang?: string) {
    return this.types.create(this.tenant.get(), dto, parseAcceptLanguage(lang));
  }

  @Patch(':id')
  @RequireCapability('manageSettings')
  @ApiOperation({ summary: 'Update a type (system types: code and EMERGENCY flag are locked)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentTypeDto,
    @Headers('accept-language') lang?: string,
  ) {
    return this.types.update(this.tenant.get(), id, dto, parseAcceptLanguage(lang));
  }

  @Delete(':id')
  @RequireCapability('manageSettings')
  @ApiOperation({ summary: 'Delete a custom, unused type (409 otherwise: deactivate instead)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.types.remove(this.tenant.get(), id);
  }
}
