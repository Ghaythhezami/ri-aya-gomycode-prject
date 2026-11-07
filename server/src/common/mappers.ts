import type {
  AppointmentListItem,
  DataLocale,
  AppointmentStatus,
  AppointmentType,
  DoctorRef,
  PersonRef,
} from '@riaya/shared';
import { DATA_LOCALES, normalizeLocalized, pickLocalized } from '@riaya/shared';
import { RequestLocale } from './locale/request-locale';

const MINUTE = 60_000;

/** "AB" from first + last name. */
export function initials(firstName: string, lastName: string): string {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return `${first}${last}`.toUpperCase() || '?';
}

/**
 * Optional localized-name columns. Rows loaded without them (selects of other modules) still
 * map: an absent or empty value falls back to the canonical column.
 */
export interface NameI18nFields {
  firstNameI18n?: unknown;
  lastNameI18n?: unknown;
}

/** One localized value for the current request language (canonical column as last resort). */
export function localizedValue(i18n: unknown, canonical: string): string {
  return pickLocalized(normalizeLocalized(i18n), RequestLocale.get(), canonical);
}

/** First and last name in the request language. */
export function localizedNames(person: {
  firstName: string;
  lastName: string;
  firstNameI18n?: unknown;
  lastNameI18n?: unknown;
}): { firstName: string; lastName: string } {
  return {
    firstName: localizedValue(person.firstNameI18n, person.firstName),
    lastName: localizedValue(person.lastNameI18n, person.lastName),
  };
}

/** "First Last" in the request language. */
export function personName(person: {
  firstName: string;
  lastName: string;
  firstNameI18n?: unknown;
  lastNameI18n?: unknown;
}): string {
  const n = localizedNames(person);
  return `${n.firstName} ${n.lastName}`.replace(/\s+/g, ' ').trim();
}

/** A room name in the request language. */
export function roomName(room: { name: string; nameI18n?: unknown }): string {
  return localizedValue(room.nameI18n, room.name);
}

export function toPersonRef(person: {
  id: string;
  firstName: string;
  lastName: string;
  firstNameI18n?: unknown;
  lastNameI18n?: unknown;
}): PersonRef {
  const n = localizedNames(person);
  return {
    id: person.id,
    name: personName(person),
    initials: initials(n.firstName, n.lastName),
  };
}

const DOCTOR_TITLE: Record<string, string> = { ar: 'د.', fr: 'Dr' };

export function doctorName(doctor: {
  firstName: string;
  lastName: string;
  firstNameI18n?: unknown;
  lastNameI18n?: unknown;
}): string {
  const title = DOCTOR_TITLE[RequestLocale.get() ?? ''] ?? 'Dr.';
  return `${title} ${personName(doctor)}`.replace(/\s+/g, ' ').trim();
}

export function toDoctorRef(doctor: {
  id: string;
  firstName: string;
  lastName: string;
  firstNameI18n?: unknown;
  lastNameI18n?: unknown;
  specialty: string;
}): DoctorRef {
  const n = localizedNames(doctor);
  return {
    id: doctor.id,
    name: doctorName(doctor),
    initials: initials(n.firstName, n.lastName),
    specialty: doctor.specialty,
  };
}

/** Keeps the country prefix and the last four digits: "+971 50 ••• 1447". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  if (digits.length < 8) return `••• ${last4}`;
  const tokens = phone.trim().split(/\s+/);
  if (phone.trim().startsWith('+') && tokens.length >= 3) {
    return `${tokens[0]} ${tokens[1]} ••• ${last4}`;
  }
  if (phone.trim().startsWith('+')) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ••• ${last4}`;
  }
  return `${digits.slice(0, 2)} ••• ${last4}`;
}

/** Prisma `include` that gives toAppointmentListItem everything in ONE query. */
export const APPOINTMENT_LIST_INCLUDE = {
  patient: {
    select: {
      id: true,
      code: true,
      firstName: true,
      lastName: true,
      firstNameI18n: true,
      lastNameI18n: true,
    },
  },
  doctor: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      firstNameI18n: true,
      lastNameI18n: true,
      specialty: true,
    },
  },
  room: { select: { id: true, name: true, nameI18n: true } },
} as const;

export interface AppointmentRow {
  id: string;
  code: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  type: string;
  reason: string | null;
  needsReschedule: boolean;
  locked: boolean;
  patient: {
    id: string;
    code: string;
    firstName: string;
    lastName: string;
    firstNameI18n?: unknown;
    lastNameI18n?: unknown;
  };
  doctor: {
    id: string;
    firstName: string;
    lastName: string;
    firstNameI18n?: unknown;
    lastNameI18n?: unknown;
    specialty: string;
  };
  room: { id: string; name: string; nameI18n?: unknown } | null;
}

export function toAppointmentListItem(row: AppointmentRow): AppointmentListItem {
  return {
    id: row.id,
    code: row.code,
    patient: { ...toPersonRef(row.patient), code: row.patient.code },
    doctor: toDoctorRef(row.doctor),
    room: row.room ? { id: row.room.id, name: roomName(row.room) } : null,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    durationMinutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / MINUTE),
    status: row.status as AppointmentStatus,
    type: row.type as AppointmentType,
    reason: row.reason,
    needsReschedule: row.needsReschedule,
    locked: row.locked,
  };
}

/**
 * Per-language copies of display names for stored templates (notifications): `{ patient,
 * patient__en, patient__fr, patient__ar, doctor, … }`. The plain key keeps the request-language
 * (or English) value for old clients; the UI prefers `<key>__<ui language>`.
 */
export function localizedParams(
  names: Record<string, (locale: DataLocale) => string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, render] of Object.entries(names)) {
    for (const locale of DATA_LOCALES) {
      out[`${key}__${locale}`] = RequestLocale.run(locale, () => render(locale));
    }
    out[key] = out[`${key}__${RequestLocale.get() ?? 'en'}`] ?? out[`${key}__en`]!;
  }
  return out;
}
