import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_ANTHROPIC_MODEL } from './ai.constants';

/**
 * The one place that builds the Claude client (ADR 0005). Without `ANTHROPIC_API_KEY` there is
 * no client and every AI route answers 503 AI_UNAVAILABLE. Tests replace this provider with a
 * fake exposing `client`, `model` and `enabled`.
 */
@Injectable()
export class AnthropicClientProvider {
  readonly client: Anthropic | null;
  readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY')?.trim();
    this.client = apiKey ? new Anthropic({ apiKey, maxRetries: 2 }) : null;
    this.model = config.get<string>('ANTHROPIC_MODEL')?.trim() || DEFAULT_ANTHROPIC_MODEL;
  }

  get enabled(): boolean {
    return this.client !== null;
  }
}
