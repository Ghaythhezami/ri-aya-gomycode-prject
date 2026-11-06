import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { TenantContext } from '../tenancy/tenant-context';
import { DateQueryDto, OptimizeDto, ValidateMoveDto } from './scheduling.dto';
import { SchedulingService } from './scheduling.service';

@ApiTags('scheduling')
@ApiBearerAuth()
@Controller('scheduling')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SchedulingController {
  constructor(
    private readonly scheduling: SchedulingService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('day')
  @RequireCapability('viewScheduling')
  day(@Query() query: DateQueryDto) {
    return this.scheduling.day(this.tenant.get().clinicId, query.date);
  }

  @Get('metrics')
  @RequireCapability('viewScheduling')
  metrics(@Query() query: DateQueryDto) {
    return this.scheduling.metrics(this.tenant.get().clinicId, query.date);
  }

  @Post('optimize')
  @HttpCode(200)
  @RequireCapability('applySchedule')
  optimize(@Body() dto: OptimizeDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.scheduling.optimizeDay(clinicId, userId, dto.date, dto.objective);
  }

  @Get('proposals/:id')
  @RequireCapability('applySchedule')
  proposal(@Param('id', ParseUUIDPipe) id: string) {
    return this.scheduling.getProposal(this.tenant.get().clinicId, id);
  }

  @Post('validate-move')
  @HttpCode(200)
  @RequireCapability('applySchedule')
  validateMove(@Body() dto: ValidateMoveDto) {
    return this.scheduling.validateMove(this.tenant.get().clinicId, dto);
  }

  @Post('proposals/:id/apply')
  @HttpCode(200)
  @RequireCapability('applySchedule')
  apply(@Param('id', ParseUUIDPipe) id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.scheduling.apply(clinicId, userId, id);
  }

  @Post('proposals/:id/undo')
  @HttpCode(200)
  @RequireCapability('applySchedule')
  undo(@Param('id', ParseUUIDPipe) id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.scheduling.undo(clinicId, userId, id);
  }
}
