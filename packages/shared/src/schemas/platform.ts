/**
 * Contracts for localized data, custom roles (RBAC), appointment types, user profile,
 * onboarding and the realtime ticket. The API DTOs mirror these field for field.
 */
import type { Capability } from '../permissions';
import type { UserRole } from './tenancy';

// ------------------------------------------------------------------ localized data

export const DATA_LOCALES = ['en', 'fr', 'ar'] as const;
export type DataLocale = (typeof DATA_LOCALES)[number];

/**
 * A user-entered value in up to three languages. Any subset may be filled; readers pick the
 * requested language, then the clinic default, then any non-empty value, then the canonical
 * (single-language) column the entity still keeps for search, sorting and exports.
 */
export type LocalizedText = Partial<Record<DataLocale, string>>;

/** Longest accepted value per language for names (first name, last name, role, type). */
export const LOCALIZED_NAME_MAX = 120;

/** Trim every language, drop empty ones and anything that is not a supported locale. */
export function normalizeLocalized(input: unknown, max = LOCALIZED_NAME_MAX): LocalizedText {
  const out: LocalizedText = {};
  if (!input || typeof input !== 'object') return out;
  for (const locale of DATA_LOCALES) {
    const raw = (input as Record<string, unknown>)[locale];
    if (typeof raw === 'string') {
      const value = raw.trim().slice(0, max);
      if (value) out[locale] = value;
    }
  }
  return out;
}

/** The value to show for `locale`, with the fallback chain described on LocalizedText. */
export function pickLocalized(
  text: LocalizedText | null | undefined,
  locale: string | null | undefined,
  canonical = '',
  defaultLocale?: string | null,
): string {
  const t = text ?? {};
  const order = [locale, defaultLocale, ...DATA_LOCALES].filter(Boolean) as string[];
  for (const l of order) {
    const v = t[l as DataLocale];
    if (v && v.trim()) return v;
  }
  return canonical;
}

/** True when the value has at least one non-empty language. */
export function hasLocalized(text: LocalizedText | null | undefined): boolean {
  return DATA_LOCALES.some((l) => Boolean(text?.[l]?.trim()));
}

// ------------------------------------------------------------------ RBAC

/** A role of the clinic: one of the four system roles (customisable) or a custom role. */
export interface RoleDto {
  /** null for a system role the clinic has not customised yet. */
  id: string | null;
  /** System roles use the UserRole name; custom roles a slug. */
  key: string;
  name: LocalizedText;
  /** `name` resolved for the request language. */
  displayName: string;
  description: LocalizedText;
  /** Data-scope behaviour and legacy role of the members (a DOCTOR-based role sees its own schedule). */
  baseRole: UserRole;
  capabilities: Capability[];
  isSystem: boolean;
  /** SUPER_ADMIN cannot be edited; the clinic admin keeps the locked capabilities. */
  editable: boolean;
  memberCount: number;
}

export interface RoleInput {
  name: LocalizedText;
  description?: LocalizedText;
  baseRole: UserRole;
  capabilities: Capability[];
}

export interface CapabilityMeta {
  key: Capability;
  group: CapabilityGroup;
}

export type CapabilityGroup =
  | 'workspace'
  | 'appointments'
  | 'patients'
  | 'doctors'
  | 'scheduling'
  | 'analytics'
  | 'communication'
  | 'administration';

export interface PermissionsMatrix {
  capabilities: CapabilityMeta[];
  roles: RoleDto[];
}

/** Assign a role (system key or custom role id) to a member of the clinic. */
export interface AssignRoleInput {
  roleKey: string;
}

// ------------------------------------------------------------------ appointment types

/** Colour keys of appointment types; each maps to a design token. */
export const APPOINTMENT_TYPE_COLORS = [
  'primary',
  'info',
  'success',
  'warning',
  'alert',
  'violet',
] as const;
export type AppointmentTypeColor = (typeof APPOINTMENT_TYPE_COLORS)[number];

export interface AppointmentTypeDto {
  id: string;
  /** Upper-case code stored on appointments (CONSULTATION, FOLLOW_UP, EMERGENCY or custom). */
  code: string;
  name: LocalizedText;
  displayName: string;
  durationMinutes: number;
  color: AppointmentTypeColor;
  /** Never moved by the optimiser; bypasses the cancellation notice. */
  isEmergency: boolean;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  /** Appointments of this type (an in-use type can be deactivated, not deleted). */
  usageCount: number;
}

export interface AppointmentTypeInput {
  name: LocalizedText;
  /** Custom types only; derived from the English or first name when omitted. */
  code?: string;
  durationMinutes: number;
  color?: AppointmentTypeColor;
  isEmergency?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

/** Change the type of an existing appointment; its end time follows the new duration. */
export interface ChangeAppointmentTypeInput {
  type: string;
  /** Keep the current end time instead of applying the type's duration. */
  keepDuration?: boolean;
}

// ------------------------------------------------------------------ profile and onboarding

export interface ProfileDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  firstNameI18n: LocalizedText;
  lastNameI18n: LocalizedText;
  displayName: string;
  phone: string | null;
  jobTitle: string | null;
  preferredLocale: DataLocale;
  role: UserRole;
  roleKey: string;
  roleName: string;
  capabilities: Capability[];
  onboardingCompletedAt: string | null;
}

export interface ProfileInput {
  firstNameI18n?: LocalizedText;
  lastNameI18n?: LocalizedText;
  phone?: string | null;
  jobTitle?: string | null;
  preferredLocale?: DataLocale;
}

export const ONBOARDING_STEPS = [
  'profile',
  'clinic',
  'hours',
  'appointmentTypes',
  'doctors',
  'team',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingState {
  /** True when the clinic finished or skipped onboarding. */
  completed: boolean;
  /** Only administrators see the clinic steps; others see `profile`. */
  steps: { key: OnboardingStep; done: boolean }[];
}

// ------------------------------------------------------------------ realtime

/** One-time ticket to open the realtime socket on the comms service (ADR 0004). */
export interface RealtimeTicket {
  /** Socket.IO origin of the comms service, or null when realtime is not configured. */
  url: string | null;
  /** Socket.IO path on that origin. */
  path: string;
  ticket: string | null;
  expiresAt: string | null;
}

/**
 * Server-to-client events of the realtime socket (Socket.IO). The domain events relayed from
 * `riaya:events` keep their names (see schemas/realtime.ts).
 */
export const SOCKET_EVENTS = [
  'notification.created',
  'notification.read',
  'chat.message',
  'chat.read',
  'queue.updated',
  'appointment.created',
  'appointment.updated',
  'appointment.cancelled',
  'appointment.rescheduled',
] as const;
export type SocketEventName = (typeof SOCKET_EVENTS)[number];
