import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AssistantStatus } from '@riaya/shared';
import { PatientContext } from '../portal/auth/patient-context';
import { PortalJwtGuard } from '../portal/auth/portal-jwt.guard';
import { AiBudgetExceededException } from './ai-errors';
import { AiGuardRailsService } from './ai-guard-rails.service';
import { AssistantEngine } from './assistant-engine.service';
import { AssistantSessionService } from './assistant-session.service';
import { ACTOR_PATIENT, type ActorType } from './ai.constants';
import { ConversationStore } from './conversation.store';
import { PortalChatDto } from './dto/chat.dto';
import { runSse } from './sse';

@ApiTags('assistant')
@ApiBearerAuth()
@Controller('portal/assistant')
@UseGuards(PortalJwtGuard)
export class PortalAssistantController {
  constructor(
    private readonly engine: AssistantEngine,
    private readonly sessions: AssistantSessionService,
    private readonly store: ConversationStore,
    private readonly guard: AiGuardRailsService,
    private readonly patient: PatientContext,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether the assistant is available to the signed-in patient' })
  status(): Promise<AssistantStatus> {
    return this.sessions.patientStatus(this.patient.get());
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat with the patient assistant (streamed; needs AI consent)' })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description:
      'Server-Sent Events. Events: conversation, text (delta), tool (name, status), proposal, done (stopReason, inputTokens, outputTokens), error (code, message).',
    content: { 'text/event-stream': { schema: { type: 'string' } } },
  })
  async chat(@Body() dto: PortalChatDto, @Res() res: Response) {
    const principal = this.patient.get();
    const session = await this.sessions.patientSession(principal);
    let prepared;
    try {
      prepared = await this.engine.prepare(session, dto, {
        requireConsentForAccountId: principal.accountId,
      });
    } catch (error) {
      if (error instanceof AiBudgetExceededException) {
        res.status(429).json(error.getResponse());
        return;
      }
      throw error;
    }
    await runSse(res, (emit, signal) => this.engine.stream(session, prepared, emit, signal));
  }

  private ref() {
    const principal = this.patient.get();
    this.guard.assertConfigured();
    return {
      clinicId: principal.clinicId,
      type: ACTOR_PATIENT as ActorType,
      id: principal.accountId,
    };
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Your last 20 conversations (30 days)' })
  conversations() {
    return this.store.list(this.ref(), 'patient');
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'One conversation rendered as messages with proposals' })
  conversation(@Param('id', ParseUUIDPipe) id: string) {
    return this.store.detail(this.ref(), 'patient', id);
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Delete one of your conversations' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.store.remove(this.ref(), 'patient', id);
  }
}
