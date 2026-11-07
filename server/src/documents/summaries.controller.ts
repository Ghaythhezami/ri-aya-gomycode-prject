import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PatientSummaryDto, SummaryDraft } from '@riaya/shared';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantContext } from '../tenancy/tenant-context';
import { SaveSummaryDto, UpdateSummaryDto } from './dto/summary.dto';
import { SummariesService } from './summaries.service';

@ApiTags('summaries')
@ApiBearerAuth()
@Controller('patients/:id')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireCapability('readClinicalNotes')
export class SummariesController {
  constructor(
    private readonly summaries: SummariesService,
    private readonly tenant: TenantContext,
  ) {}

  @Post('summary/draft')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Draft a patient summary with the assistant (visits, notes, READY documents)',
  })
  draft(@Param('id', ParseUUIDPipe) id: string): Promise<SummaryDraft> {
    return this.summaries.draft(this.tenant.get().clinicId, id);
  }

  @Post('summaries')
  @ApiOperation({
    summary: 'Save a clinician-approved summary (optionally share it with the patient)',
  })
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveSummaryDto,
  ): Promise<PatientSummaryDto> {
    const { clinicId, userId } = this.tenant.get();
    return this.summaries.save(clinicId, id, userId, dto);
  }

  @Get('summaries')
  @ApiOperation({ summary: 'Saved summaries of a patient' })
  list(@Param('id', ParseUUIDPipe) id: string): Promise<PatientSummaryDto[]> {
    return this.summaries.list(this.tenant.get().clinicId, id);
  }

  @Patch('summaries/:sid')
  @ApiOperation({ summary: 'Publish or unpublish a summary, or edit its text' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: UpdateSummaryDto,
  ): Promise<PatientSummaryDto> {
    const { clinicId, userId } = this.tenant.get();
    return this.summaries.update(clinicId, id, sid, userId, dto);
  }
}
