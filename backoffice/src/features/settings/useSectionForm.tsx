import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, CircleDot, Pencil } from 'lucide-react';
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Path,
  type Resolver,
  type UseFormReturn,
} from 'react-hook-form';
import type { ZodType } from 'zod';
import type { UpdateSettingsInput } from '@riaya/shared';
import { Button } from '../../common/Button';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { useUnsavedGuard } from '../scheduling/useUnsavedGuard';
import { useUpdateSettingsMutation } from './api';
import { mapValidationDetails } from './forms';

export interface SectionForm<V extends FieldValues> {
  form: UseFormReturn<V>;
  onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  saving: boolean;
  dirty: boolean;
  general: string[];
  cancel: () => void;
}

/**
 * Form state shared by every settings section: zod validation with translated field messages,
 * a diff-only PUT, 400 details mapped onto fields, a success toast and the unsaved guard.
 * Input stays in the form on error.
 */
export function useSectionForm<V extends FieldValues>({
  schema,
  defaults,
  build,
  fields,
}: {
  schema: ZodType<V, V>;
  defaults: V;
  /** Payload with only the changed fields; empty means nothing to save. */
  build: (values: V) => UpdateSettingsInput;
  /** Form field names a server validation message can point at. */
  fields: readonly string[];
}): SectionForm<V> {
  const { t } = useTranslation();
  const toast = useToast();
  const [update, state] = useUpdateSettingsMutation();
  const [general, setGeneral] = useState<string[]>([]);
  const form = useForm<V>({
    resolver: zodResolver(schema as never) as Resolver<V>,
    defaultValues: defaults as DefaultValues<V>,
    mode: 'onTouched',
  });
  const dirty = form.formState.isDirty;
  const defaultsKey = JSON.stringify(defaults);

  // Follow server data (after a save or a refetch) unless the user is mid-edit.
  useEffect(() => {
    if (!form.formState.isDirty) form.reset(defaults as DefaultValues<V>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsKey]);

  useUnsavedGuard(dirty, t('settings.leaveConfirm'));

  const onSubmit = form.handleSubmit(async (values) => {
    setGeneral([]);
    const payload = build(values);
    if (Object.keys(payload).length === 0) {
      form.reset(values);
      return;
    }
    try {
      await update(payload).unwrap();
      form.reset(values);
      toast.success(t('settings.saved'));
    } catch (error) {
      const e = asClinicError(error);
      if (e?.status === 400) {
        const { fieldErrors, general: rest } = mapValidationDetails(e.details, fields);
        for (const [name, message] of Object.entries(fieldErrors)) {
          form.setError(name as Path<V>, { type: 'server', message });
        }
        const mapped = Object.keys(fieldErrors).length > 0;
        setGeneral(rest.length > 0 ? rest : mapped ? [] : [e.message]);
        return;
      }
      toast.error(t(`errors.${e?.code ?? 'INTERNAL_ERROR'}`, { defaultValue: e?.message ?? '' }));
    }
  });

  return {
    form,
    onSubmit,
    saving: state.isLoading,
    dirty,
    general,
    cancel: () => {
      form.reset(defaults as DefaultValues<V>);
      setGeneral([]);
    },
  };
}

/** Header chip: "Draft" while pristine, "Unsaved changes" once edited. */
export function DraftChip({ dirty }: { dirty: boolean }) {
  const { t } = useTranslation();
  return dirty ? (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning"
    >
      <Pencil size={12} aria-hidden="true" />
      {t('settings.unsaved')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-primary-dark">
      <CircleDot size={12} aria-hidden="true" />
      {t('settings.draft')}
    </span>
  );
}

/** Card with title, subtitle, state chip, body and Cancel / Save footer. */
export function SectionCard({
  title,
  subtitle,
  dirty,
  saving,
  general,
  onSubmit,
  onCancel,
  children,
}: {
  title: string;
  subtitle?: string;
  dirty: boolean;
  saving: boolean;
  general?: string[];
  onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  onCancel: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      aria-label={title}
      className="rounded-lg border border-border bg-surface shadow-(--shadow-card)"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
        <div>
          <h2 className="text-base font-semibold text-text">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        <DraftChip dirty={dirty} />
      </div>
      <div className="px-6 py-5">
        {general && general.length > 0 && (
          <ul
            role="alert"
            className="mb-4 space-y-1 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error"
          >
            {general.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        {children}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={!dirty || saving}>
          {t('clinic.cancel')}
        </Button>
        <Button type="submit" disabled={!dirty || saving} aria-busy={saving || undefined}>
          <Check size={16} aria-hidden="true" />
          {saving ? t('settings.saving') : t('clinic.save')}
        </Button>
      </div>
    </form>
  );
}
