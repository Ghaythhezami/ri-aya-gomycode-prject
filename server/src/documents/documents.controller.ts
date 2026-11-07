import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { PatientDocumentDetail, PatientDocumentDto } from '@riaya/shared';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RateLimit } from '../common/throttle/rate-limit';
import { TenantContext } from '../tenancy/tenant-context';
import { MAX_DOCUMENT_BYTES, type UploadedDocumentFile } from './document-file';
import { DocumentsService } from './documents.service';

const UPLOAD_BODY = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary', description: 'PDF, JPEG or PNG, up to 10 MB' },
    },
  },
};

@ApiTags('documents')
@ApiBearerAuth()
@Controller('patients/:id/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireCapability('readClinicalNotes')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  @RateLimit(20)
  @ApiOperation({
    summary: 'Upload a document (PDF, JPEG, PNG); extraction runs after the upload',
    description:
      '422 DOCUMENT_INVALID for another file type, 409 with the existing id for a duplicate.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(UPLOAD_BODY)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedDocumentFile | undefined,
  ): Promise<PatientDocumentDto> {
    const { clinicId, userId } = this.tenant.get();
    return this.documents.upload({
      clinicId,
      patientId: id,
      uploadedBy: 'STAFF',
      uploaderId: userId,
      auditUserId: userId,
      file,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Documents of a patient' })
  list(@Param('id', ParseUUIDPipe) id: string): Promise<PatientDocumentDto[]> {
    return this.documents.list(this.tenant.get().clinicId, id);
  }

  @Get(':docId')
  @ApiOperation({ summary: 'One document with its extraction and extracted text' })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ): Promise<PatientDocumentDetail> {
    return this.documents.detail(this.tenant.get().clinicId, id, docId);
  }

  @Get(':docId/file')
  @ApiOperation({ summary: 'Download the original file' })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiOkResponse({ description: 'The file bytes (attachment)' })
  async file(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Res() res: Response,
  ) {
    const file = await this.documents.file(this.tenant.get().clinicId, id, docId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(file.content));
  }

  @Delete(':docId')
  @ApiOperation({ summary: 'Delete a document' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.documents.remove(clinicId, id, docId, userId);
  }

  @Post(':docId/review')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark the document as reviewed by the clinician' })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ): Promise<PatientDocumentDetail> {
    const { clinicId, userId } = this.tenant.get();
    return this.documents.review(clinicId, id, docId, userId);
  }

  @Post(':docId/process')
  @HttpCode(200)
  @ApiOperation({ summary: 'Run the extraction again' })
  process(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ): Promise<PatientDocumentDetail> {
    return this.documents.reprocess(this.tenant.get().clinicId, id, docId);
  }
}
