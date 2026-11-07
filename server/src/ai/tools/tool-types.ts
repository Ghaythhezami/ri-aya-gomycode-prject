import type { AssistantPersona, AssistantProposal, Capability, UserRole } from '@riaya/shared';
import { z } from 'zod';

/** The caller a tool runs for. Built from the verified JWT, never from the model's input. */
export interface ToolActor {
  persona: AssistantPersona;
  clinicId: string;
  timezone: string;
  locale: 'en' | 'fr' | 'ar';
  /** Effective capabilities (staff and doctors). Empty for patients. */
  capabilities: ReadonlySet<Capability>;
  /** Staff user id. */
  userId?: string;
  role?: UserRole;
  /** Doctor profile linked to the signed-in doctor. */
  doctorId?: string | null;
  /** Portal principal: the only patient a patient-persona tool may read. */
  patientId?: string;
  accountId?: string;
  now: Date;
}

/** `AssistantProposal` without the server-generated id. */
export type ProposalDraft = AssistantProposal extends infer P
  ? P extends { id: string }
    ? Omit<P, 'id'>
    : never
  : never;

export interface ToolResult {
  data: unknown;
  /** Set by proposal tools: shown to the user as a confirmation card, never executed here. */
  proposal?: ProposalDraft;
  /** The data carries text a patient wrote (booking reason, uploaded document): untrusted. */
  patientSupplied?: boolean;
}

/** A tool failure the model can read and recover from (sent as an `is_error` result). */
export class ToolError extends Error {}

export interface AssistantTool {
  name: string;
  description: string;
  schema: z.ZodType;
  /** Capability the caller must hold (checked on listing and again on execution). */
  capability?: Capability;
  personas: readonly AssistantPersona[];
  run(input: unknown, actor: ToolActor): Promise<ToolResult>;
}

export function defineTool<S extends z.ZodType>(def: {
  name: string;
  description: string;
  schema: S;
  capability?: Capability;
  personas: readonly AssistantPersona[];
  run: (input: z.infer<S>, actor: ToolActor) => Promise<ToolResult>;
}): AssistantTool {
  return {
    name: def.name,
    description: def.description,
    schema: def.schema,
    capability: def.capability,
    personas: def.personas,
    run: (input, actor) => def.run(input as z.infer<S>, actor),
  };
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const dateField = z.string().regex(DATE_RE).describe('Local clinic date, YYYY-MM-DD');
export const instantField = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'invalid date-time')
  .describe('ISO 8601 date-time with offset, copied from a slot returned by find_slots');
export const idField = z.string().describe('Identifier (UUID) returned by another tool');
