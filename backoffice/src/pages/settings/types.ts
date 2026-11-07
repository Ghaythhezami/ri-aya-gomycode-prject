/** Shared shapes for the settings screen (BP-035). */

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export interface WorkingHoursBreak {
  start: string;
  end: string;
}

export interface WorkingHoursDay {
  open: boolean;
  start: string;
  end: string;
  breaks: WorkingHoursBreak[];
}

export type ClinicWorkingHours = Record<Weekday, WorkingHoursDay>;

export interface ClinicSettings {
  id: string;
  name: string;
  address: string;
  contactEmail: string;
  phone: string;
  defaultLanguage: 'en' | 'ar' | 'fr';
  timezone: string;
  currency: string;
  workingHours: ClinicWorkingHours;
}

export interface ClinicSettingsUpdate {
  name?: string;
  address?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  defaultLanguage?: 'en' | 'ar' | 'fr';
  timezone?: string;
  workingHours?: ClinicWorkingHours;
}

const day = (open: boolean, start = '08:00', end = '17:00'): WorkingHoursDay => ({
  open,
  start,
  end,
  breaks: [],
});

/** Mirrors the server default: Mon-Thu full day, Fri short day, weekend closed. */
export function defaultWorkingHours(): ClinicWorkingHours {
  return {
    monday: day(true),
    tuesday: day(true),
    wednesday: day(true),
    thursday: day(true),
    friday: day(true, '08:00', '13:00'),
    saturday: day(false),
    sunday: day(false),
  };
}

export const LANGUAGES = ['en', 'ar', 'fr'] as const;

/**
 * A short, curated list rather than every IANA zone. The stored zone is still
 * preserved if it is not in this list, so a custom value is never dropped.
 */
export const TIME_ZONES = [
  'UTC',
  'Africa/Lagos',
  'Africa/Cairo',
  'Africa/Nairobi',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
] as const;

/** Roles shown on the permissions table, in the mockup's order. */
export type RoleAccessLevel = 'full' | 'operations' | 'limited';

export type BaseRole = 'CLINIC_ADMIN' | 'DOCTOR' | 'RECEPTIONIST';

export interface RoleView {
  id: string;
  name: string;
  baseRole: BaseRole | 'SUPER_ADMIN';
  isSystem: boolean;
  editable: boolean;
  accessLevel: RoleAccessLevel;
  permissions: string[];
  users: number;
}

/** Custom roles may only be based on these built-in roles. */
export const CUSTOM_ROLE_BASES: readonly BaseRole[] = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'];
