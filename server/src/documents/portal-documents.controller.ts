import {
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { PatientDocumentDto } from '@riaya/shared';
import { RateLimit } from '../common/throttle/rate-limit';
import { PatientContext } from '../portal/auth/patient-context';
import { PortalJwtGuard } from '../portal/auth/portal-jwt.guard';
import { MAX_DOCUMENT_BYTES, type UploadedDocumentFile } from './document-file';
import { DocumentsService, QuotaExceededException } from './documents.service';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('portal/documents')
@UseGuards(PortalJwtGuard)
export class PortalDocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly patient: PatientContext,
  ) {}

  @Post()
  @RateLimit(5)
  @ApiOperation({
    summary: 'Upload one of your documents (PDF, JPEG, PNG up to 10 MB)',
    description:
      '5 per minute. 403 VERIFICATION_REQUIRED until the clinic verified the account; 429 QUOTA_EXCEEDED beyond 20 documents or 50 MB per 24 hours.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  async upload(
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const dto: PatientDocumentDto = await this.documents.uploadForPatient(
        this.patient.get(),
        file,
      );
      res.status(201).json(dto);
    } catch (error) {
      // The global filter renames every 429 to RATE_LIMITED; answer the quota code directly.
      if (error instanceof QuotaExceededException) {
        res.status(429).json(error.getResponse());
        return;
      }
      throw error;
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Your documents (patient-facing fields only; summaries appear after clinician review)',
  })
  list(): Promise<PatientDocumentDto[]> {
    const { clinicId, patientId } = this.patient.get();
    return this.documents.listForPatient(clinicId, patientId);
  }
}
