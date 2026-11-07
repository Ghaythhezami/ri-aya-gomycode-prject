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
import { RequireCapability } from '../common/decorators/capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantContext } from '../tenancy/tenant-context';
import type { UserRecord } from '../users/user.types';
import { AiBudgetExceededException } from './ai-errors';
import { AiGuardRailsService } from './ai-guard-rails.service';
import { AssistantEngine } from './assistant-engine.service';
import { AssistantSessionService } from './assistant-session.service';
import { ConversationStore } from './conversation.store';
import { ChatDto } from './dto/chat.dto';
import { runSse } from './sse';

const SSE_DOC = {
  description:
    'Server-Sent Events. Events: conversation, text (delta), tool (name, status), proposal, done (stopReason, inputTokens, outputTokens), error (code, message).',
  content: { 'text/event-stream': { schema: { type: 'string' } } },
};

@ApiTags('assistant')
@ApiBearerAuth()
@Controller('assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireCapability('viewOverview')
export class AssistantController {
  constructor(
    private readonly engine: AssistantEngine,
    private readonly sessions: AssistantSessionService,
    private readonly store: ConversationStore,
    private readonly guard: AiGuardRailsService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether the assistant is available to the signed-in staff member' })
  status(): Promise<AssistantStatus> {
    return this.sessions.staffStatus(this.tenant.get());
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat with the staff or doctor assistant (streamed)' })
  @ApiProduces('text/event-stream')
  @ApiOkResponse(SSE_DOC)
  async chat(@Body() dto: ChatDto, @CurrentUser() user: UserRecord, @Res() res: Response) {
    const session = await this.sessions.staffSession(this.tenant.get(), user, dto.context);
    let prepared;
    try {
      prepared = await this.engine.prepare(session, dto);
    } catch (error) {
      if (error instanceof AiBudgetExceededException) {
        res.status(429).json(error.getResponse());
        return;
      }
      throw error;
    }
    await runSse(res, (emit, signal) => this.engine.stream(session, prepared, emit, signal));
  }

  private async ref() {
    const scope = this.tenant.get();
    this.guard.assertConfigured();
    const { persona } = await this.sessions.staffPersona(scope);
    return {
      persona,
      actor: { clinicId: scope.clinicId, type: 'STAFF_USER' as const, id: scope.userId },
    };
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Your last 20 conversations (30 days)' })
  async conversations() {
    const { actor, persona } = await this.ref();
    return this.store.list(actor, persona);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'One conversation rendered as messages with proposals' })
  async conversation(@Param('id', ParseUUIDPipe) id: string) {
    const { actor, persona } = await this.ref();
    return this.store.detail(actor, persona, id);
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Delete one of your conversations' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const { actor, persona } = await this.ref();
    return this.store.remove(actor, persona, id);
  }
}
