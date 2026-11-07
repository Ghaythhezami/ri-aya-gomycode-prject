import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InsightsService } from '../../analytics/insights.service';
import { ClinicSettingsReader } from '../../core/clinic-settings.reader';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { QueueService } from '../../queue/queue.service';
import { SchedulingService } from '../../scheduling/scheduling.service';
import { AiDataService } from '../ai-data.service';
import { doctorTools } from './doctor-tools';
import { patientTools } from './patient-tools';
import { staffTools } from './staff-tools';
import type { ToolDeps } from './tool-deps';
import { ToolError, type AssistantTool, type ToolActor, type ToolResult } from './tool-types';

/** True when the tool output holds a non-empty appointment `reason` (written by the patient). */
function hasReason(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((v) => hasReason(v, depth + 1));
  return Object.entries(value).some(
    ([k, v]) =>
      (k === 'reason' && typeof v === 'string' && v.trim() !== '') || hasReason(v, depth + 1),
  );
}

/**
 * The tool catalogue. The list sent to the model is filtered by persona and by the caller's
 * effective capabilities; `execute` re-checks both, so a tool the model was never offered (or
 * invents) cannot run.
 */
@Injectable()
export class AssistantToolsService {
  private readonly logger = new Logger(AssistantToolsService.name);
  private readonly catalogue: AssistantTool[];

  constructor(
    prisma: PrismaService,
    data: AiDataService,
    settings: ClinicSettingsReader,
    queue: QueueService,
    notifications: NotificationsService,
    scheduling: SchedulingService,
    moduleRef: ModuleRef,
  ) {
    const deps: ToolDeps = {
      prisma,
      data,
      settings,
      queue,
      notifications,
      scheduling,
      // The analytics module does not export InsightsService; it is only present where the
      // scheduler service is configured, so resolve it lazily and tolerate its absence.
      insights: () => {
        try {
          return moduleRef.get(InsightsService, { strict: false });
        } catch {
          return null;
        }
      },
    };
    // Deterministic order: the tool list is part of the cached prompt prefix.
    this.catalogue = [...staffTools(deps), ...doctorTools(deps), ...patientTools(deps)];
  }

  private allowed(tool: AssistantTool, actor: ToolActor): boolean {
    return (
      tool.personas.includes(actor.persona) &&
      (!tool.capability || actor.capabilities.has(tool.capability))
    );
  }

  /** Tools offered to this caller, in catalogue order. */
  forActor(actor: ToolActor): AssistantTool[] {
    return this.catalogue.filter((t) => this.allowed(t, actor));
  }

  async execute(name: string, rawInput: unknown, actor: ToolActor): Promise<ToolResult> {
    const tool = this.forActor(actor).find((t) => t.name === name);
    if (!tool) throw new ToolError('Unknown tool or not permitted');
    const parsed = tool.schema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ToolError(
        `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
    }
    try {
      const result = await tool.run(parsed.data, actor);
      // Staff and doctor tools that return an appointment reason expose patient-written text.
      if (actor.persona !== 'patient' && hasReason(result.data)) result.patientSupplied = true;
      return result;
    } catch (error) {
      if (error instanceof ToolError) throw error;
      // Ids and class only: never the message, which may embed query arguments.
      this.logger.warn(`tool ${name} failed: ${(error as Error).name}`);
      throw new ToolError('The tool failed; try again or tell the user it is unavailable');
    }
  }
}
