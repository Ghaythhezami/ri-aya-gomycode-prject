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
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Get the schedule of a day',
    description: 'Appointments and free time per doctor. Requires the viewScheduling capability.',
  })
  @ApiOkResponse({ description: 'SchedulingDay' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  day(@Query() query: DateQueryDto) {
    return this.scheduling.day(this.tenant.get().clinicId, query.date);
  }

  @Get('metrics')
  @RequireCapability('viewScheduling')
  @ApiOperation({
    summary: 'Get scheduling metrics',
    description:
      'Utilisation, waiting and gap metrics for a day. Requires the viewScheduling capability.',
  })
  @ApiOkResponse({ description: 'DayMetrics' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  metrics(@Query() query: DateQueryDto) {
    return this.scheduling.metrics(this.tenant.get().clinicId, query.date);
  }

  @Post('optimize')
  @HttpCode(200)
  @RequireCapability('applySchedule')
  @ApiOperation({
    summary: 'Propose an optimised schedule',
    description:
      'Runs the deterministic optimiser for a day and stores a proposal without applying it. Requires the applySchedule capability.',
  })
  @ApiOkResponse({ description: 'OptimizationProposal' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  optimize(@Body() dto: OptimizeDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.scheduling.optimizeDay(clinicId, userId, dto.date, dto.objective);
  }

  @Get('proposals/:id')
  @RequireCapability('applySchedule')
  @ApiOperation({
    summary: 'Get a schedule proposal',
    description:
      'Proposal with its moves and before/after metrics. Requires the applySchedule capability.',
  })
  @ApiOkResponse({ description: 'OptimizationProposal' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  proposal(@Param('id', ParseUUIDPipe) id: string) {
    return this.scheduling.getProposal(this.tenant.get().clinicId, id);
  }

  @Post('validate-move')
  @HttpCode(200)
  @RequireCapability('applySchedule')
  @ApiOperation({
    summary: 'Validate a manual move',
    description:
      'Checks a drag-and-drop move against availability and conflicts without saving. Requires the applySchedule capability.',
  })
  @ApiOkResponse({ description: 'MoveValidation' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  validateMove(@Body() dto: ValidateMoveDto) {
    return this.scheduling.validateMove(this.tenant.get().clinicId, dto);
  }

  @Post('proposals/:id/apply')
  @HttpCode(200)
  @RequireCapability('applySchedule')
  @ApiOperation({
    summary: 'Apply a schedule proposal',
    description:
      'Applies the proposal moves in one transaction; a conflict returns 409. Requires the applySchedule capability.',
  })
  @ApiOkResponse({ description: 'OptimizationProposal' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiConflictResponse({ description: 'Conflict with the current state' })
  apply(@Param('id', ParseUUIDPipe) id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.scheduling.apply(clinicId, userId, id);
  }

  @Post('proposals/:id/undo')
  @HttpCode(200)
  @RequireCapability('applySchedule')
  @ApiOperation({
    summary: 'Undo an applied proposal',
    description:
      'Restores the appointments to their previous slots. Requires the applySchedule capability.',
  })
  @ApiOkResponse({ description: 'OptimizationProposal' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  @ApiConflictResponse({ description: 'Conflict with the current state' })
  undo(@Param('id', ParseUUIDPipe) id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.scheduling.undo(clinicId, userId, id);
  }
}
