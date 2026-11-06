import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_COLORS,
  DEFAULT_DURATIONS,
  type AppointmentTypeColor,
  type AppointmentTypeDto,
  type SystemAppointmentType,
} from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

// The store's tag list does not know `AppointmentTypes`; register it here.
const typesApi = clinicApi.enhanceEndpoints({ addTagTypes: ['AppointmentTypes'] }).injectEndpoints({
  endpoints: (build) => ({
    appointmentTypes: build.query<AppointmentTypeDto[], { includeInactive?: boolean } | void>({
      query: (args) => ({
        url: '/api/appointment-types',
        params: args && args.includeInactive ? { includeInactive: true } : undefined,
      }),
      providesTags: ['AppointmentTypes'],
    }),
  }),
});

export const { useAppointmentTypesQuery } = typesApi;

/** Design token behind each colour key; `violet` has no token yet and falls back to info. */
const TOKEN: Record<AppointmentTypeColor, string> = {
  primary: 'var(--color-primary)',
  info: 'var(--color-info)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  alert: 'var(--color-alert)',
  violet: 'var(--color-violet, var(--color-info))',
};

/** Colour of a system type when the API sends none (older payloads). */
const SYSTEM_COLOR: Record<SystemAppointmentType, AppointmentTypeColor> = {
  CONSULTATION: 'primary',
  FOLLOW_UP: 'info',
  EMERGENCY: 'alert',
};

export function isColorKey(value: string | null | undefined): value is AppointmentTypeColor {
  return (APPOINTMENT_TYPE_COLORS as readonly string[]).includes(value ?? '');
}

/** Colour key for an appointment: its `typeColor`, else the system default, else primary. */
export function resolveColor(color?: string | null, code?: string | null): AppointmentTypeColor {
  if (isColorKey(color)) return color;
  if (code && (APPOINTMENT_TYPES as readonly string[]).includes(code)) {
    return SYSTEM_COLOR[code as SystemAppointmentType];
  }
  return 'primary';
}

/** `var(--color-…)` token of a colour key (unknown keys fall back to primary). */
export function typeToken(color?: string | null, code?: string | null): string {
  return TOKEN[resolveColor(color, code)];
}

/** Tailwind classes (static, so the compiler sees them) for a tinted block of a colour key. */
const BLOCK_CLASS: Record<AppointmentTypeColor, string> = {
  primary: 'border-primary/30 bg-accent text-primary-dark',
  info: 'border-info/30 bg-info/10 text-info',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  alert: 'border-alert/30 bg-alert/10 text-alert',
  violet: 'border-info/30 bg-info/10 text-info',
};

export function typeBlockClasses(color?: string | null, code?: string | null): string {
  return BLOCK_CLASS[resolveColor(color, code)];
}

/** Default minutes of a type: the clinic type, else the system default, else `fallback`. */
export function durationForType(
  types: readonly AppointmentTypeDto[] | undefined,
  code: string,
  fallback = 30,
): number {
  const found = types?.find((type) => type.code === code);
  if (found) return found.durationMinutes;
  return DEFAULT_DURATIONS[code as SystemAppointmentType] ?? fallback;
}

/** Active types ordered by `sortOrder`, then name. */
export function sortTypes(types: readonly AppointmentTypeDto[]): AppointmentTypeDto[] {
  return [...types].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName),
  );
}

/** End instant (ISO) of an appointment after a type change. */
export function previewEnd(
  startsAt: string,
  endsAt: string,
  newDurationMinutes: number,
  keepDuration: boolean,
): string {
  if (keepDuration) return endsAt;
  return new Date(new Date(startsAt).getTime() + newDurationMinutes * 60_000).toISOString();
}

export interface TypeFilterOption {
  code: string;
  label: string;
  inactive: boolean;
}

/** Filter options from all clinic types (inactive ones included, flagged), sorted. */
export function typeFilterOptions(types: readonly AppointmentTypeDto[]): TypeFilterOption[] {
  return sortTypes(types).map((type) => ({
    code: type.code,
    label: type.displayName,
    inactive: !type.isActive,
  }));
}

/**
 * Label resolver: clinic type name first, then the name sent with the appointment,
 * then the system translation, then the raw code.
 */
export function useTypeLabel(): (code: string, typeName?: string | null) => string {
  const { t } = useTranslation();
  const { data } = useAppointmentTypesQuery({ includeInactive: true });
  return useCallback(
    (code, typeName) => {
      const found = data?.find((type) => type.code === code);
      if (found) return found.displayName;
      if (typeName) return typeName;
      if ((APPOINTMENT_TYPES as readonly string[]).includes(code)) {
        return t(`clinic.type.${code}`);
      }
      return code;
    },
    [data, t],
  );
}
