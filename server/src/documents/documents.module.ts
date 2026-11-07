import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DocumentProcessorService } from './document-processor.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PortalDocumentsController } from './portal-documents.controller';
import { SummariesController } from './summaries.controller';
import { SummariesService } from './summaries.service';

/** Clinical documents (upload, OCR/extraction on Claude) and patient summaries (ADR 0005 section 3). */
@Module({
  imports: [AiModule],
  controllers: [DocumentsController, PortalDocumentsController, SummariesController],
  providers: [DocumentsService, DocumentProcessorService, SummariesService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
