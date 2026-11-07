import { z } from 'zod';
import {
  type ClinicSettingsDto,
  type Department,
  type OpeningDay,
  type UpdateSettingsInput,
} from '@riaya/shared';

/** Slot sizes the API accepts. */
export const SLOT_OPTIONS = [5, 10, 15, 20, 30] as const;
export const MAX_REMINDERS = 4;

const required = 'settings.errors.required';
const tooLong = 'settings.errors.tooLong';
const numberMsg = 'settings.errors.number';

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9\s().-]{6,}$/;

// ----------------------------------------------------------------- clinic information

const localizedName = z
  .object({
    en: z.string().max(120, tooLong).optional(),
    fr: z.string().max(120, tooLong).optional(),
    ar: z.string().max(120, tooLong).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x?.trim()), required);

export const clinicSchema = z.object({
  /** Clinic name per language (en, fr, ar); the API derives the canonical name. */
  nameI18n: localizedName,
  address: z.string().trim().max(255, tooLong),
  contactEmail: z
    .string()
    .trim()
    .max(254, tooLong)
    .refine((v) => v === '' || EMAIL.test(v), 'settings.errors.email'),
  phone: z
    .string()
    .trim()
    .max(40, tooLong)
    .refine((v) => v === '' || PHONE.test(v), 'settings.errors.phone'),
  defaultLanguage: z.enum(['en', 'ar', 'fr']),
  timezone: z.string().min(1, required).refine(isTimeZone, 'settings.errors.timezone'),
});
export type ClinicValues = z.infer<typeof clinicSchema>;

export function clinicDefaults(s: ClinicSettingsDto): ClinicValues {
  return {
    nameI18n: {
      en: s.clinic.nameI18n?.en ?? (s.defaultLanguage === 'en' ? s.clinic.name : ''),
      fr: s.clinic.nameI18n?.fr ?? (s.defaultLanguage === 'fr' ? s.clinic.name : ''),
      ar: s.clinic.nameI18n?.ar ?? (s.defaultLanguage === 'ar' ? s.clinic.name : ''),
    },
    address: s.clinic.address ?? '',
    contactEmail: s.contactEmail ?? '',
    phone: s.phone ?? '',
    defaultLanguage: s.defaultLanguage,
    timezone: s.clinic.timezone,
  };
}

/** Only the fields that differ from what is saved. */
export function clinicPayload(v: ClinicValues, saved: ClinicValues): UpdateSettingsInput {
  const out: UpdateSettingsInput = {};
  const clinic: NonNullable<UpdateSettingsInput['clinic']> = {};
  if (JSON.stringify(v.nameI18n) !== JSON.stringify(saved.nameI18n)) {
    clinic.nameI18n = Object.fromEntries(
      Object.entries(v.nameI18n).map(([k, x]) => [k, (x ?? '').trim()]),
    );
  }
  if (v.address !== saved.address) clinic.address = v.address || (null as unknown as string);
  if (v.timezone !== saved.timezone) clinic.timezone = v.timezone;
  if (Object.keys(clinic).length > 0) out.clinic = clinic;
  if (v.contactEmail !== saved.contactEmail)
    out.contactEmail = v.contactEmail || (null as unknown as string);
  if (v.phone !== saved.phone) out.phone = v.phone || (null as unknown as string);
  if (v.defaultLanguage !== saved.defaultLanguage) out.defaultLanguage = v.defaultLanguage;
  return out;
}

// ----------------------------------------------------------------- departments

export const departmentsSchema = z
  .object({
    departments: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().trim().min(1, required).max(120, tooLong),
          specialties: z.array(z.string()),
        }),
      )
      .max(50, 'settings.errors.tooMany'),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.departments.forEach((d, index) => {
      const key = d.name.trim().toLowerCase();
      if (key && seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['departments', index, 'name'],
          message: 'settings.errors.duplicate',
        });
      }
      seen.add(key);
    });
  });
export type DepartmentsValues = z.infer<typeof departmentsSchema>;

export function departmentsDefaults(s: ClinicSettingsDto): DepartmentsValues {
  return {
    departments: s.departments.map((d: Department) => ({
      id: d.id,
      name: d.name,
      specialties: [...d.specialties],
    })),
  };
}

export const NEW_DEPARTMENT_PREFIX = 'new-';

export function departmentsPayload(
  v: DepartmentsValues,
  saved: DepartmentsValues,
): UpdateSettingsInput {
  if (JSON.stringify(v.departments) === JSON.stringify(saved.departments)) return {};
  return {
    departments: v.departments.map((d) => ({
      // Fresh departments have no id yet; the server assigns one.
      ...(d.id.startsWith(NEW_DEPARTMENT_PREFIX) ? {} : { id: d.id }),
      name: d.name.trim(),
      specialties: d.specialties,
    })) as Department[],
  };
}

// ----------------------------------------------------------------- working hours

export function minutesToTime(minutes: number): string {
  const m = Math.min(Math.max(minutes, 0), 1439);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const timeField = z.string().regex(/^\d{2}:\d{2}$/, required);

export const hoursSchema = z.object({
  days: z
    .array(
      z.object({
        weekday: z.number(),
        closed: z.boolean(),
        open: timeField,
        close: timeField,
      }),
    )
    .length(7)
    .superRefine((days, ctx) => {
      days.forEach((d, index) => {
        if (!d.closed && d.open && d.close && timeToMinutes(d.open) >= timeToMinutes(d.close)) {
          ctx.addIssue({
            code: 'custom',
            path: [index, 'close'],
            message: 'settings.errors.closeAfterOpen',
          });
        }
      });
    }),
});
export type HoursValues = z.infer<typeof hoursSchema>;

export function hoursDefaults(s: ClinicSettingsDto): HoursValues {
  const byDay = new Map(s.openingHours.map((d) => [d.weekday, d]));
  return {
    days: Array.from({ length: 7 }, (_, weekday) => {
      const d = byDay.get(weekday);
      return {
        weekday,
        closed: d?.closed ?? true,
        open: minutesToTime(d?.open ?? 480),
        close: minutesToTime(d?.close ?? 1080),
      };
    }),
  };
}

export function hoursPayload(
  v: HoursValues,
  saved: HoursValues,
  original: OpeningDay[],
): UpdateSettingsInput {
  if (JSON.stringify(v.days) === JSON.stringify(saved.days)) return {};
  const byDay = new Map(original.map((d) => [d.weekday, d]));
  return {
    openingHours: v.days.map((d) => {
      const prev = byDay.get(d.weekday);
      return {
        weekday: d.weekday,
        closed: d.closed,
        // Unchanged times keep their saved value (a close of 24:00 is shown as 23:59).
        open: prev && minutesToTime(prev.open) === d.open ? prev.open : timeToMinutes(d.open),
        close: prev && minutesToTime(prev.close) === d.close ? prev.close : timeToMinutes(d.close),
      };
    }),
  };
}

// ----------------------------------------------------------------- appointments

// Durations per type are managed with the appointment types (appointmentTypes.ts).
export const appointmentsSchema = z.object({
  slotMinutes: z
    .number(numberMsg)
    .refine((v) => (SLOT_OPTIONS as readonly number[]).includes(v), 'settings.errors.slot'),
  cancellationNoticeHours: z
    .number(numberMsg)
    .int(numberMsg)
    .min(0, 'settings.errors.min0')
    .max(72, 'settings.errors.max72'),
  targetWaitMinutes: z
    .number(numberMsg)
    .int(numberMsg)
    .min(1, 'settings.errors.min1')
    .max(240, 'settings.errors.max240'),
  requireCancelReason: z.boolean(),
});
export type AppointmentsValues = z.infer<typeof appointmentsSchema>;

export function appointmentsDefaults(s: ClinicSettingsDto): AppointmentsValues {
  return {
    slotMinutes: s.slotMinutes,
    cancellationNoticeHours: s.cancellationNoticeHours,
    targetWaitMinutes: s.targetWaitMinutes,
    requireCancelReason: s.requireCancelReason,
  };
}

export function appointmentsPayload(
  v: AppointmentsValues,
  saved: AppointmentsValues,
): UpdateSettingsInput {
  const out: UpdateSettingsInput = {};
  if (v.slotMinutes !== saved.slotMinutes) out.slotMinutes = v.slotMinutes;
  if (v.cancellationNoticeHours !== saved.cancellationNoticeHours)
    out.cancellationNoticeHours = v.cancellationNoticeHours;
  if (v.targetWaitMinutes !== saved.targetWaitMinutes) out.targetWaitMinutes = v.targetWaitMinutes;
  if (v.requireCancelReason !== saved.requireCancelReason)
    out.requireCancelReason = v.requireCancelReason;
  return out;
}

// ----------------------------------------------------------------- reminders

export const remindersSchema = z
  .object({
    offsets: z
      .array(
        z.object({
          hours: z
            .number(numberMsg)
            .min(0.25, 'settings.errors.offsetMin')
            .max(168, 'settings.errors.offsetMax'),
        }),
      )
      .max(MAX_REMINDERS, 'settings.errors.tooMany'),
    sms: z.boolean(),
    email: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    value.offsets.forEach((o, index) => {
      const minutes = Math.round(o.hours * 60);
      if (seen.has(minutes)) {
        ctx.addIssue({
          code: 'custom',
          path: ['offsets', index, 'hours'],
          message: 'settings.errors.duplicateOffset',
        });
      }
      seen.add(minutes);
    });
  });
export type RemindersValues = z.infer<typeof remindersSchema>;

export function remindersDefaults(s: ClinicSettingsDto): RemindersValues {
  return {
    offsets: [...s.reminderOffsets].sort((a, b) => b - a).map((m) => ({ hours: m / 60 })),
    sms: s.reminderChannels.includes('SMS'),
    email: s.reminderChannels.includes('EMAIL'),
  };
}

export function remindersPayload(v: RemindersValues, saved: RemindersValues): UpdateSettingsInput {
  const out: UpdateSettingsInput = {};
  const minutes = (x: RemindersValues) =>
    x.offsets.map((o) => Math.round(o.hours * 60)).sort((a, b) => b - a);
  if (JSON.stringify(minutes(v)) !== JSON.stringify(minutes(saved)))
    out.reminderOffsets = minutes(v);
  if (v.sms !== saved.sms || v.email !== saved.email) {
    out.reminderChannels = [
      ...(v.sms ? (['SMS'] as const) : []),
      ...(v.email ? (['EMAIL'] as const) : []),
    ];
  }
  return out;
}

// ----------------------------------------------------------------- appearance

export const appearanceSchema = z.object({
  density: z.enum(['comfortable', 'compact']),
  highContrast: z.boolean(),
  reduceMotion: z.boolean(),
});
export type AppearanceValues = z.infer<typeof appearanceSchema>;

export function appearanceDefaults(s: ClinicSettingsDto): AppearanceValues {
  return { ...s.appearance };
}

export function appearancePayload(
  v: AppearanceValues,
  saved: AppearanceValues,
): UpdateSettingsInput {
  const diff: Partial<AppearanceValues> = {};
  if (v.density !== saved.density) diff.density = v.density;
  if (v.highContrast !== saved.highContrast) diff.highContrast = v.highContrast;
  if (v.reduceMotion !== saved.reduceMotion) diff.reduceMotion = v.reduceMotion;
  return Object.keys(diff).length > 0
    ? { appearance: diff as ClinicSettingsDto['appearance'] }
    : {};
}

// ----------------------------------------------------------------- server validation errors

/**
 * Map a 400 validation `details` payload to form fields. Accepts strings such as
 * "clinic.name must be shorter than 121 characters", `{ property, constraints }` objects and
 * `{ field, message }` objects; the last path segment must name a form field.
 * Returns field → message and the messages that matched no field.
 */
export function mapValidationDetails(
  details: unknown,
  fields: readonly string[],
): { fieldErrors: Record<string, string>; general: string[] } {
  const fieldErrors: Record<string, string> = {};
  const general: string[] = [];
  const list = Array.isArray(details)
    ? details
    : details && typeof details === 'object'
      ? Object.entries(details)
      : [];

  const place = (path: string, message: string) => {
    const segments = path.split(/[.[\]]+/).filter(Boolean);
    const last = [...segments].reverse().find((s) => fields.includes(s));
    if (last) fieldErrors[last] ??= message;
    else general.push(message);
  };

  for (const item of list) {
    if (typeof item === 'string') {
      const match = /^([\w.[\]]+)\s/.exec(item);
      const path = match?.[1] ?? '';
      const head = path.split('.').find((s) => fields.includes(s)) ?? path;
      place(fields.includes(head) ? head : path, item);
    } else if (Array.isArray(item) && typeof item[0] === 'string') {
      const value = item[1];
      place(item[0], Array.isArray(value) ? String(value[0]) : String(value));
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const path = String(o.field ?? o.property ?? o.path ?? '');
      const constraints =
        o.constraints && typeof o.constraints === 'object'
          ? Object.values(o.constraints as object)
          : [];
      place(path, String(o.message ?? constraints[0] ?? ''));
    }
  }
  return { fieldErrors, general };
}
