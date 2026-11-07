import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import type { AssistantProposal, AssistantStreamEvent } from '@riaya/shared';
import { AuditService } from '../audit/audit.service';
import { todayIn } from '../core/clinic-time';
import { AnthropicClientProvider } from './anthropic-client.provider';
import { AiBudgetExceededException, AiUnavailableException } from './ai-errors';
import { AiGuardRailsService, estimateTokens } from './ai-guard-rails.service';
import { wrapToolData } from './ai-format';
import { toStrictJsonSchema } from './json-schema';
import { systemPromptFor, volatileBlock } from './prompts';
import {
  CHAT_MAX_TOKENS,
  FALLBACK_BETA,
  MAX_CONVERSATION_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_TOOL_ROUNDS,
  type ActorType,
} from './ai.constants';
import {
  ConversationStore,
  toApiMessages,
  type ActorRef,
  type StoredMessage,
} from './conversation.store';
import { AssistantToolsService } from './tools/assistant-tools.service';
import { ToolError, type AssistantTool, type ToolActor, type ToolResult } from './tools/tool-types';

import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
type Block = Beta.BetaContentBlockParam;

/** Who is chatting: built by the controller from the verified token. */
export interface ChatSession {
  actor: ToolActor;
  ref: ActorRef;
  displayName: string;
  clinicName: string;
  /** Staff user id for audit rows (patients have none). */
  auditUserId: string | null;
  pageContext?: { patientId?: string; date?: string };
}

export interface PreparedChat {
  conversationId: string;
  history: StoredMessage[];
  message: string;
}

export type Emit = (event: AssistantStreamEvent) => void;

const toolSchemaCache = new WeakMap<AssistantTool, Record<string, unknown>>();

function toApiTool(tool: AssistantTool): Beta.BetaTool {
  let schema = toolSchemaCache.get(tool);
  if (!schema) {
    schema = toStrictJsonSchema(tool.schema);
    toolSchemaCache.set(tool, schema);
  }
  return {
    name: tool.name,
    description: tool.description,
    input_schema: schema as Beta.BetaTool.InputSchema,
    strict: true,
    eager_input_streaming: true,
  };
}

/** Stable code and message for an API failure; never the raw provider message. */
export function mapApiError(error: unknown): { code: string; message: string } {
  if (error instanceof AiBudgetExceededException) {
    return { code: 'AI_BUDGET_EXCEEDED', message: 'The assistant budget is used up for today' };
  }
  if (error instanceof AiUnavailableException) {
    return { code: 'AI_UNAVAILABLE', message: 'The assistant is not available right now' };
  }
  if (error instanceof Anthropic.APIError) {
    if (error.status === 429)
      return { code: 'AI_RATE_LIMITED', message: 'The assistant is busy, try again shortly' };
    if (error.status === 529 || (error.status ?? 0) >= 500) {
      return { code: 'AI_OVERLOADED', message: 'The assistant is temporarily unavailable' };
    }
    if (error.status === 401 || error.status === 403) {
      return { code: 'AI_UNAVAILABLE', message: 'The assistant is not available right now' };
    }
  }
  return { code: 'AI_ERROR', message: 'The assistant could not answer' };
}

@Injectable()
export class AssistantEngine {
  private readonly logger = new Logger(AssistantEngine.name);

  constructor(
    private readonly provider: AnthropicClientProvider,
    private readonly guard: AiGuardRailsService,
    private readonly store: ConversationStore,
    private readonly tools: AssistantToolsService,
    private readonly audit: AuditService,
  ) {}

  /** Checks that must pass before the SSE stream opens, so failures are plain JSON errors. */
  async prepare(
    session: ChatSession,
    input: { conversationId?: string; message: string },
    opts: { requireConsentForAccountId?: string } = {},
  ): Promise<PreparedChat> {
    this.guard.assertConfigured();
    const message = input.message?.trim() ?? '';
    if (!message || message.length > MAX_MESSAGE_CHARS) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `message must be 1 to ${MAX_MESSAGE_CHARS} characters`,
      });
    }
    await this.guard.assertClinicEnabled(session.actor.clinicId);
    if (opts.requireConsentForAccountId) {
      // Unverified (self-registered, not yet confirmed by the clinic) accounts cannot chat.
      await this.guard.assertPatientVerified(
        opts.requireConsentForAccountId,
        session.actor.clinicId,
      );
      await this.guard.assertPatientConsent(
        opts.requireConsentForAccountId,
        session.actor.clinicId,
      );
    }
    await this.guard.consumeRate(`${session.ref.type}:${session.ref.id}`);
    await this.guard.assertBudget(
      session.actor.clinicId,
      session.actor.persona === 'patient' ? (session.actor.accountId ?? null) : null,
    );
    // Retention (30 days): drop this actor's expired conversations, plus a throttled global sweep.
    await this.store.purgeExpired(session.ref).catch(() => undefined);

    if (input.conversationId) {
      const conv = await this.store.load(session.ref, session.actor.persona, input.conversationId);
      if (conv.messages.length >= MAX_CONVERSATION_MESSAGES) {
        throw new UnprocessableEntityException({
          code: 'CONVERSATION_TOO_LONG',
          message: 'This conversation is full; start a new one',
        });
      }
      return { conversationId: conv.id, history: conv.messages, message };
    }
    const conv = await this.store.create(session.ref, session.actor.persona, message.slice(0, 80));
    return { conversationId: conv.id, history: [], message };
  }

  async stream(
    session: ChatSession,
    prep: PreparedChat,
    emit: Emit,
    signal: AbortSignal,
  ): Promise<void> {
    const client = this.provider.client;
    if (!client) {
      emit({
        event: 'error',
        data: { code: 'AI_UNAVAILABLE', message: 'The assistant is not available right now' },
      });
      return;
    }
    const { actor } = session;
    const tools = this.tools.forActor(actor);
    const apiTools = tools.map(toApiTool);
    const system: Beta.BetaTextBlockParam[] = [
      // Frozen persona text + the tools above it form the cached prefix.
      { type: 'text', text: systemPromptFor(actor.persona), cache_control: { type: 'ephemeral' } },
      // Volatile context after the breakpoint so it never invalidates the cache.
      {
        type: 'text',
        text: volatileBlock({
          today: todayIn(actor.timezone, actor.now),
          timezone: actor.timezone,
          clinicName: session.clinicName,
          userName: session.displayName,
          pageContext: session.pageContext,
        }),
      },
    ];

    const messages: StoredMessage[] = [...prep.history, { role: 'user', content: prep.message }];
    let safeLength = messages.length;
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason = 'end_turn';
    // True once this turn read text a patient wrote (documents, booking reasons): proposals that
    // follow carry a warning because that text may try to steer the assistant.
    let tainted = false;
    const accountId = actor.persona === 'patient' ? (actor.accountId ?? null) : null;

    emit({
      event: 'conversation',
      data: { conversationId: prep.conversationId, persona: actor.persona },
    });

    try {
      let jsonRetries = 0;
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        if (signal.aborted) return;
        // Atomic budget reservation (max_tokens + input estimate), settled with the real usage.
        const reservation = await this.guard.reserve(
          actor.clinicId,
          accountId,
          estimateTokens(CHAT_MAX_TOKENS, JSON.stringify(messages).length + system[0]!.text.length),
        );
        let used = 0;
        const stream = client.beta.messages.stream(
          {
            model: this.provider.model,
            max_tokens: CHAT_MAX_TOKENS,
            system,
            tools: apiTools,
            tool_choice: { type: 'auto' },
            messages: toApiMessages(messages),
            output_config: { effort: 'low' },
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
          },
          { signal },
        );
        stream.on('text', (delta) => emit({ event: 'text', data: { delta } }));

        let message: Beta.BetaMessage;
        try {
          message = await stream.finalMessage();
          jsonRetries = 0;
          used =
            message.usage.input_tokens +
            (message.usage.cache_creation_input_tokens ?? 0) +
            (message.usage.cache_read_input_tokens ?? 0) +
            message.usage.output_tokens;
          await this.guard.settle(reservation, used);
        } catch (error) {
          await this.guard.settle(reservation, 0);
          if (signal.aborted) return;
          // Eager input streaming can end a tool input as unparseable JSON: re-issue the turn.
          if (!(error instanceof Anthropic.APIError) && jsonRetries++ < 2) continue;
          throw error;
        }

        inputTokens +=
          message.usage.input_tokens +
          (message.usage.cache_creation_input_tokens ?? 0) +
          (message.usage.cache_read_input_tokens ?? 0);
        outputTokens += message.usage.output_tokens;
        stopReason = message.stop_reason ?? 'end_turn';

        if (message.stop_reason === 'refusal') {
          // A refusal can cut a tool_use off mid-input: run nothing and keep it out of history.
          emit({
            event: 'error',
            data: { code: 'AI_REFUSED', message: 'The assistant cannot help with that request' },
          });
          return;
        }
        if (message.stop_reason === 'model_context_window_exceeded') {
          emit({
            event: 'error',
            data: {
              code: 'CONVERSATION_TOO_LONG',
              message: 'This conversation is full; start a new one',
            },
          });
          return;
        }

        const toolUses = message.content.filter(
          (b): b is Beta.BetaToolUseBlock => b.type === 'tool_use',
        );
        const assistant: StoredMessage = { role: 'assistant', content: message.content as Block[] };

        if (message.stop_reason === 'max_tokens' && toolUses.length) {
          emit({
            event: 'error',
            data: { code: 'AI_MAX_TOKENS', message: 'The answer was too long; ask for less' },
          });
          return;
        }
        if (message.stop_reason === 'pause_turn') {
          messages.push(assistant);
          continue;
        }
        if (message.stop_reason !== 'tool_use' || toolUses.length === 0) {
          messages.push(assistant);
          safeLength = messages.length;
          break;
        }
        if (round === MAX_TOOL_ROUNDS) {
          emit({
            event: 'error',
            data: { code: 'AI_TOOL_LIMIT', message: 'The assistant needed too many steps' },
          });
          return;
        }

        // Every tool_use of the turn is answered in ONE user message.
        const proposals: AssistantProposal[] = [];
        const outcomes = await Promise.all(toolUses.map((use) => this.runTool(session, use, emit)));
        const results = outcomes.map((o) => o.block);
        if (outcomes.some((o) => o.patientSupplied)) tainted = true;
        // Proposals go out after every tool of the batch ran, so a parallel read of
        // patient-supplied text still marks them.
        for (const o of outcomes) {
          if (!o.proposal) continue;
          const proposal = {
            id: randomUUID(),
            ...o.proposal,
            ...(tainted ? { warning: 'patient_supplied_content' as const } : {}),
          } as AssistantProposal;
          proposals.push(proposal);
          emit({ event: 'proposal', data: proposal });
          await this.auditProposal(session, prep.conversationId, proposal);
        }
        messages.push({ ...assistant, proposals: proposals.length ? proposals : undefined });
        messages.push({ role: 'user', content: results });
        safeLength = messages.length;
      }
      emit({ event: 'done', data: { stopReason, inputTokens, outputTokens } });
    } catch (error) {
      if (signal.aborted) return;
      this.logger.warn(
        `chat failed: ${error instanceof Anthropic.APIError ? `status ${error.status}` : (error as Error).name}`,
      );
      emit({ event: 'error', data: mapApiError(error) });
    } finally {
      await this.finish(session, prep, messages.slice(0, safeLength), inputTokens, outputTokens);
    }
  }

  private async runTool(
    session: ChatSession,
    use: Beta.BetaToolUseBlock,
    emit: Emit,
  ): Promise<{
    block: Beta.BetaToolResultBlockParam;
    proposal?: ToolResult['proposal'];
    patientSupplied: boolean;
  }> {
    emit({ event: 'tool', data: { name: use.name, status: 'running' } });
    try {
      const result = await this.tools.execute(use.name, use.input, session.actor);
      emit({ event: 'tool', data: { name: use.name, status: 'done' } });
      return {
        block: { type: 'tool_result', tool_use_id: use.id, content: wrapToolData(result.data) },
        proposal: result.proposal,
        patientSupplied: result.patientSupplied === true,
      };
    } catch (error) {
      emit({ event: 'tool', data: { name: use.name, status: 'error' } });
      return {
        block: {
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: error instanceof ToolError ? error.message : 'The tool failed',
        },
        patientSupplied: false,
      };
    }
  }

  /** Audit row for an emitted proposal: ids and action only, no message or note text. */
  private async auditProposal(
    session: ChatSession,
    conversationId: string,
    proposal: AssistantProposal,
  ): Promise<void> {
    try {
      await this.audit.recordStandalone({
        actorUserId: session.auditUserId,
        clinicId: session.actor.clinicId,
        action: 'create',
        entity: 'ai_proposal',
        entityId: proposal.id,
        after: {
          action: proposal.action,
          persona: session.actor.persona,
          actorType: session.ref.type as ActorType,
          actorId: session.ref.id,
          conversationId,
        },
      });
    } catch {
      this.logger.warn('proposal audit row could not be written');
    }
  }

  private async finish(
    session: ChatSession,
    prep: PreparedChat,
    messages: StoredMessage[],
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    try {
      await this.store.save(prep.conversationId, messages, { inputTokens, outputTokens });
    } catch {
      this.logger.warn('conversation could not be saved');
    }
  }
}
