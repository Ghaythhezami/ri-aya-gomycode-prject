import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { AiBudgetExceededException } from './ai-errors';
import { AiGuardRailsService, estimateTokens } from './ai-guard-rails.service';
import { AnthropicClientProvider } from './anthropic-client.provider';
import { budgetTokens, EXTRACTION_MAX_TOKENS, FALLBACK_BETA } from './ai.constants';
import { stripNulls, toStrictJsonSchema } from './json-schema';

import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';

/** Failure of a structured call; `code` is stored as the document `errorCode`. */
export class StructuredOutputError extends Error {
  constructor(
    readonly code:
      | 'AI_UNAVAILABLE'
      | 'AI_BUDGET_EXCEEDED'
      | 'AI_REFUSED'
      | 'AI_MAX_TOKENS'
      | 'AI_INVALID_OUTPUT'
      | 'AI_RATE_LIMITED'
      | 'AI_ERROR',
  ) {
    super(code);
  }
}

/**
 * One non-interactive Claude call that must return JSON matching a zod schema
 * (`output_config.format`), used for document extraction and summary drafts. Streams internally
 * (long outputs) and returns the final message only.
 */
@Injectable()
export class StructuredOutputService {
  private readonly logger = new Logger(StructuredOutputService.name);

  constructor(
    private readonly provider: AnthropicClientProvider,
    private readonly guard: AiGuardRailsService,
  ) {}

  get enabled(): boolean {
    return this.provider.enabled;
  }

  async run<S extends z.ZodType>(params: {
    clinicId: string;
    system: string;
    content: Beta.BetaContentBlockParam[];
    schema: S;
    effort?: 'low' | 'medium' | 'high';
  }): Promise<z.infer<S>> {
    const client = this.provider.client;
    if (!client) throw new StructuredOutputError('AI_UNAVAILABLE');
    // Atomic reservation (output ceiling + input estimate; a file block counts 24k characters).
    const inputChars = params.content.reduce(
      (sum, b) => sum + (b.type === 'text' ? (b as { text: string }).text.length : 24_000),
      params.system.length,
    );
    let reservation;
    try {
      reservation = await this.guard.reserve(
        params.clinicId,
        null,
        estimateTokens(EXTRACTION_MAX_TOKENS, inputChars),
      );
    } catch (error) {
      throw new StructuredOutputError(
        error instanceof AiBudgetExceededException ? 'AI_BUDGET_EXCEEDED' : 'AI_UNAVAILABLE',
      );
    }

    let message: Beta.BetaMessage;
    try {
      message = await client.beta.messages
        .stream({
          model: this.provider.model,
          max_tokens: EXTRACTION_MAX_TOKENS,
          system: params.system,
          messages: [{ role: 'user', content: params.content }],
          output_config: {
            effort: params.effort ?? 'medium',
            format: { type: 'json_schema', schema: toStrictJsonSchema(params.schema) },
          },
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
        })
        .finalMessage();
    } catch (error) {
      await this.guard.settle(reservation, 0);
      this.logger.warn(
        `structured call failed: ${error instanceof Anthropic.APIError ? `status ${error.status}` : (error as Error).name}`,
      );
      throw new StructuredOutputError(
        error instanceof Anthropic.APIError && error.status === 429
          ? 'AI_RATE_LIMITED'
          : 'AI_ERROR',
      );
    }

    await this.guard.settle(reservation, budgetTokens(message.usage));

    if (message.stop_reason === 'refusal') throw new StructuredOutputError('AI_REFUSED');
    if (message.stop_reason === 'max_tokens') throw new StructuredOutputError('AI_MAX_TOKENS');

    const text = message.content
      .filter((b): b is Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      const parsed = params.schema.safeParse(stripNulls(JSON.parse(text)));
      if (!parsed.success) throw new Error('schema');
      return parsed.data;
    } catch {
      throw new StructuredOutputError('AI_INVALID_OUTPUT');
    }
  }
}
