import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { QueueModule } from '../queue/queue.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AiDataService } from './ai-data.service';
import { AiGuardRailsService } from './ai-guard-rails.service';
import { AnthropicClientProvider } from './anthropic-client.provider';
import { AssistantController } from './assistant.controller';
import { AssistantEngine } from './assistant-engine.service';
import { AssistantSessionService } from './assistant-session.service';
import { ConversationStore } from './conversation.store';
import { PortalAssistantController } from './portal-assistant.controller';
import { AssistantToolsService } from './tools/assistant-tools.service';
import { StructuredOutputService } from './structured-output.service';

/**
 * AI assistants on the Claude API (ADR 0005 section 2): staff, doctor and patient personas,
 * a streamed tool loop, proposals instead of writes. The Anthropic client provider is exported
 * for the documents module (extraction and summary drafts).
 */
@Module({
  imports: [QueueModule, NotificationsModule, SchedulingModule],
  controllers: [AssistantController, PortalAssistantController],
  providers: [
    AnthropicClientProvider,
    AiGuardRailsService,
    AiDataService,
    AssistantToolsService,
    AssistantSessionService,
    ConversationStore,
    AssistantEngine,
    StructuredOutputService,
  ],
  exports: [AnthropicClientProvider, AiGuardRailsService, StructuredOutputService],
})
export class AiModule {}
