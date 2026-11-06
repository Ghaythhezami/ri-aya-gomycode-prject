import { z } from 'zod';
import {
  APPOINTMENT_TYPE_COLORS,
  hasLocalized,
  type AppointmentTypeColor,
  type AppointmentTypeDto,
  type AppointmentTypeInput,
  type LocalizedText,
} from '@riaya/shared';

export const TYPE_MIN_MINUTES = 5;
export const TYPE_MAX_MINUTES = 480;
export const TYPE_STEP_MINUTES = 5;

/** Design token behind each colour key; `violet` has no token yet and falls back to info. */
const COLOR_VARS: Record<AppointmentTypeColor, string> = {
  primary: 'var(--color-primary)',
  info: 'var(--color-info)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  alert: 'var(--color-alert)',
  violet: 'var(--color-violet, var(--color-info))',
};

export function colorVar(color: string): string {
  return COLOR_VARS[color as AppointmentTypeColor] ?? COLOR_VARS.primary;
}

const localizedSchema = z.custom<LocalizedText>((v) => typeof v === 'object' && v !== null);

export const typeFormSchema = z.object({
  name: localizedSchema.refine((v) => hasLocalized(v), 'settings.errors.nameRequired'),
  durationMinutes: z
    .number('settings.errors.number')
    .int('settings.errors.number')
    .min(TYPE_MIN_MINUTES, 'settings.errors.min5')
    .max(TYPE_MAX_MINUTES, 'settings.errors.max480')
    .refine((v) => v % TYPE_STEP_MINUTES === 0, 'settings.errors.step5'),
  color: z.enum(APPOINTMENT_TYPE_COLORS, 'settings.errors.color'),
  isEmergency: z.boolean(),
  isActive: z.boolean(),
});
export type TypeFormValues = z.infer<typeof typeFormSchema>;

export function typeDefaults(type?: AppointmentTypeDto): TypeFormValues {
  return {
    name: type ? { ...type.name } : {},
    durationMinutes: type?.durationMinutes ?? 30,
    color: type?.color ?? 'primary',
    isEmergency: type?.isEmergency ?? false,
    isActive: type?.isActive ?? true,
  };
}

const trimLocalized = (v: LocalizedText): LocalizedText => {
  const out: LocalizedText = {};
  for (const [k, value] of Object.entries(v)) {
    const text = value?.trim();
    if (text) out[k as keyof LocalizedText] = text;
  }
  return out;
};

/**
 * Create: the full input. Edit: only the changed fields; system types never send the
 * emergency flag (locked) and their code is never sent.
 */
export function typePayload(
  values: TypeFormValues,
  existing?: AppointmentTypeDto,
): AppointmentTypeInput | Partial<AppointmentTypeInput> {
  const name = trimLocalized(values.name);
  if (!existing) {
    return {
      name,
      durationMinutes: values.durationMinutes,
      color: values.color,
      isEmergency: values.isEmergency,
      isActive: values.isActive,
    };
  }
  const out: Partial<AppointmentTypeInput> = {};
  if (JSON.stringify(name) !== JSON.stringify(trimLocalized(existing.name))) out.name = name;
  if (values.durationMinutes !== existing.durationMinutes)
    out.durationMinutes = values.durationMinutes;
  if (values.color !== existing.color) out.color = values.color;
  if (!existing.isSystem && values.isEmergency !== existing.isEmergency)
    out.isEmergency = values.isEmergency;
  if (values.isActive !== existing.isActive) out.isActive = values.isActive;
  return out;
}

/** Types in display order (sortOrder, then code). */
export function sortTypes(types: readonly AppointmentTypeDto[]): AppointmentTypeDto[] {
  return [...types].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

/** Move one type up (-1) or down (+1); sortOrder is renumbered to the new positions. */
export function moveType(
  types: readonly AppointmentTypeDto[],
  id: string,
  direction: -1 | 1,
): AppointmentTypeDto[] {
  const list = sortTypes(types);
  const from = list.findIndex((t) => t.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item!);
  return list.map((t, index) => ({ ...t, sortOrder: index }));
}

/** Move the type `id` to the position of `targetId` (drag and drop). */
export function moveTypeTo(
  types: readonly AppointmentTypeDto[],
  id: string,
  targetId: string,
): AppointmentTypeDto[] {
  const list = sortTypes(types);
  const from = list.findIndex((t) => t.id === id);
  const to = list.findIndex((t) => t.id === targetId);
  if (from < 0 || to < 0 || from === to) return list;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item!);
  return list.map((t, index) => ({ ...t, sortOrder: index }));
}

/** The PATCH calls needed to turn `before` into `after`: only types whose sortOrder changed. */
export function reorderChanges(
  before: readonly AppointmentTypeDto[],
  after: readonly AppointmentTypeDto[],
): { id: string; sortOrder: number }[] {
  const old = new Map(before.map((t) => [t.id, t.sortOrder]));
  return after
    .filter((t) => old.get(t.id) !== t.sortOrder)
    .map((t) => ({ id: t.id, sortOrder: t.sortOrder }));
}

/** At least one active, non-emergency type must remain bookable (API rule, 422). */
export function lastBookableType(types: readonly AppointmentTypeDto[], id: string): boolean {
  const remaining = types.filter((t) => t.id !== id && t.isActive && !t.isEmergency);
  return remaining.length === 0;
}

/** Whether the type is the one that would be the last bookable one if it were deactivated. */
export function canDeactivate(types: readonly AppointmentTypeDto[], type: AppointmentTypeDto) {
  return type.isEmergency || !type.isActive || !lastBookableType(types, type.id);
}
