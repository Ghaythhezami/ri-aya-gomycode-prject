import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisCacheService } from '../cache/redis-cache.service';
import { PrismaService } from '../database/prisma.service';
import { effectiveLimit } from '../common/throttle/rate-limit';
import { AnthropicClientProvider } from './anthropic-client.provider';
import { AiBudgetExceededException, AiUnavailableException } from './ai-errors';
import {
  CHAT_RATE_LIMIT_PER_MINUTE,
  DEFAULT_DAILY_TOKEN_BUDGET,
  DEFAULT_PATIENT_DAILY_TOKEN_BUDGET,
} from './ai.constants';

const DAY_SECONDS = 2 * 24 * 3600;

/** Tokens held against the day counters for one Claude call; settled with the real usage. */
export interface BudgetReservation {
  clinicId: string;
  accountId: string | null;
  tokens: number;
}

/** Rough reservation for one call: the output ceiling plus ~1 token per 3 input characters. */
export function estimateTokens(maxTokens: number, inputChars: number): number {
  return maxTokens + Math.ceil(inputChars / 3);
}

/** Availability, consent, rate limit and token budget checks run before any model call. */
@Injectable()
export class AiGuardRailsService {
  private readonly logger = new Logger(AiGuardRailsService.name);

  constructor(
    private readonly provider: AnthropicClientProvider,
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  get dailyBudget(): number {
    const raw = Number(
      this.config?.get('AI_DAILY_TOKEN_BUDGET') ?? process.env.AI_DAILY_TOKEN_BUDGET,
    );
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_TOKEN_BUDGET;
  }

  get patientDailyBudget(): number {
    const raw = Number(
      this.config?.get('AI_PATIENT_DAILY_TOKEN_BUDGET') ??
        process.env.AI_PATIENT_DAILY_TOKEN_BUDGET,
    );
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PATIENT_DAILY_TOKEN_BUDGET;
  }

  get configured(): boolean {
    return this.provider.enabled;
  }

  assertConfigured(): void {
    if (!this.provider.enabled) throw new AiUnavailableException('NOT_CONFIGURED');
  }

  async clinicEnabled(clinicId: string): Promise<boolean> {
    const row = await this.prisma.clinicSettings.findUnique({
      where: { clinicId },
      select: { aiAssistantsEnabled: true },
    });
    return row?.aiAssistantsEnabled ?? true;
  }

  async assertClinicEnabled(clinicId: string): Promise<void> {
    if (!(await this.clinicEnabled(clinicId))) {
      throw new AiUnavailableException('DISABLED_BY_CLINIC');
    }
  }

  async hasPatientConsent(accountId: string, clinicId: string): Promise<boolean> {
    const account = await this.prisma.patientAccount.findFirst({
      where: { id: accountId, clinicId },
      select: { aiConsentAt: true },
    });
    return !!account?.aiConsentAt;
  }

  /** Patients need `aiConsentAt` on their account. */
  async assertPatientConsent(accountId: string, clinicId: string): Promise<void> {
    if (!(await this.hasPatientConsent(accountId, clinicId))) {
      throw new ForbiddenException({
        code: 'CONSENT_REQUIRED',
        message: 'Turn on the assistant in your profile to use it',
      });
    }
  }

  /**
   * Patients whose identity the clinic has not verified (`emailVerifiedAt` is the "verified by
   * the clinic" timestamp, see PortalAuthService) cannot use the assistant.
   */
  async isPatientVerified(accountId: string, clinicId: string): Promise<boolean> {
    const account = await this.prisma.patientAccount.findFirst({
      where: { id: accountId, clinicId },
      select: { emailVerifiedAt: true },
    });
    return !!account?.emailVerifiedAt;
  }

  async assertPatientVerified(accountId: string, clinicId: string): Promise<void> {
    if (!(await this.isPatientVerified(accountId, clinicId))) {
      throw new ForbiddenException({
        code: 'VERIFICATION_REQUIRED',
        message: 'The clinic needs to confirm your identity first',
      });
    }
  }

  /**
   * 20 chat requests per minute per actor (counter shared through Redis or Postgres).
   * Fails CLOSED: when the security-state store is down the request is refused (503), because an
   * unmetered assistant is an unbounded Claude bill.
   */
  async consumeRate(actorKey: string): Promise<void> {
    const bucket = Math.floor(Date.now() / 60_000);
    let count: number;
    try {
      count = await this.cache.incrementStrict(`ai:rl:${actorKey}:${bucket}`, 70);
    } catch {
      this.logger.warn('rate counter unavailable, refusing the request');
      throw new AiUnavailableException('SECURITY_STATE_UNAVAILABLE');
    }
    if (count > effectiveLimit(CHAT_RATE_LIMIT_PER_MINUTE)) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Too many requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private day(now = new Date()): string {
    return now.toISOString().slice(0, 10);
  }

  private budgetKey(clinicId: string, now = new Date()): string {
    return `ai:budget:${clinicId}:${this.day(now)}`;
  }

  private patientBudgetKey(accountId: string, now = new Date()): string {
    return `ai:budget:patient:${accountId}:${this.day(now)}`;
  }

  /** Cheap read-only pre-check before the SSE stream opens; the atomic gate is `reserve`. */
  async assertBudget(clinicId: string, accountId?: string | null): Promise<void> {
    let used: number;
    let patientUsed = 0;
    try {
      used = (await this.cache.getStrict<number>(this.budgetKey(clinicId))) ?? 0;
      if (accountId) {
        patientUsed = (await this.cache.getStrict<number>(this.patientBudgetKey(accountId))) ?? 0;
      }
    } catch {
      throw new AiUnavailableException('SECURITY_STATE_UNAVAILABLE');
    }
    if (used >= this.dailyBudget) throw new AiBudgetExceededException();
    if (accountId && patientUsed >= this.patientDailyBudget) throw new AiBudgetExceededException();
  }

  /**
   * Atomic reservation before a Claude call: adds `tokens` to the clinic (and, for a patient,
   * the account) day counter and rejects when the reserved total would pass the limit. The
   * increment is atomic in the store, so parallel requests cannot overshoot the ceiling.
   * Call `settle` afterwards with the real usage. Fails closed when the store is down.
   */
  async reserve(
    clinicId: string,
    accountId: string | null,
    tokens: number,
  ): Promise<BudgetReservation> {
    const clinicKey = this.budgetKey(clinicId);
    let clinicTotal: number;
    try {
      clinicTotal = await this.cache.incrementByStrict(clinicKey, tokens, DAY_SECONDS);
    } catch {
      throw new AiUnavailableException('SECURITY_STATE_UNAVAILABLE');
    }
    if (clinicTotal > this.dailyBudget) {
      await this.adjust(clinicKey, -tokens);
      throw new AiBudgetExceededException();
    }
    if (accountId) {
      const patientKey = this.patientBudgetKey(accountId);
      let patientTotal: number;
      try {
        patientTotal = await this.cache.incrementByStrict(patientKey, tokens, DAY_SECONDS);
      } catch {
        await this.adjust(clinicKey, -tokens);
        throw new AiUnavailableException('SECURITY_STATE_UNAVAILABLE');
      }
      if (patientTotal > this.patientDailyBudget) {
        await this.adjust(patientKey, -tokens);
        await this.adjust(clinicKey, -tokens);
        throw new AiBudgetExceededException();
      }
    }
    return { clinicId, accountId, tokens };
  }

  /** Replaces the reservation with the real usage (0 releases it after a failed call). */
  async settle(reservation: BudgetReservation, actualTokens: number): Promise<void> {
    const delta = Math.max(0, actualTokens) - reservation.tokens;
    if (delta === 0) return;
    await this.adjust(this.budgetKey(reservation.clinicId), delta);
    if (reservation.accountId) {
      await this.adjust(this.patientBudgetKey(reservation.accountId), delta);
    }
  }

  private async adjust(key: string, delta: number): Promise<void> {
    try {
      await this.cache.incrementByStrict(key, delta, DAY_SECONDS);
    } catch {
      this.logger.warn('budget counter could not be adjusted');
    }
  }
}
