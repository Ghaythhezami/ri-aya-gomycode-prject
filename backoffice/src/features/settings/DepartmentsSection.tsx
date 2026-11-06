import { useMemo, useState } from 'react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { ClinicSettingsDto } from '@riaya/shared';
import { Button } from '../../common/Button';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { Field, Input } from '../../common/Input';
import { useClinicReferenceQuery } from '../shared/api';
import {
  NEW_DEPARTMENT_PREFIX,
  departmentsDefaults,
  departmentsPayload,
  departmentsSchema,
  type DepartmentsValues,
} from './forms';
import { SectionCard, useSectionForm } from './useSectionForm';
import { useSpecialtyLabel } from '../shared/useSpecialtyLabel';

function SpecialtyPicker({
  form,
  index,
  options,
}: {
  form: UseFormReturn<DepartmentsValues>;
  index: number;
  options: string[];
}) {
  const { t } = useTranslation();
  const specialtyLabel = useSpecialtyLabel();
  const name = `departments.${index}.specialties` as const;
  const selected = form.watch(name) ?? [];
  const all = [...new Set([...options, ...selected])];
  const toggle = (specialty: string) => {
    const next = selected.includes(specialty)
      ? selected.filter((s) => s !== specialty)
      : [...selected, specialty];
    form.setValue(name, next, { shouldDirty: true });
  };
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-text">
        {t('settings.departments.specialties')}
      </legend>
      {all.length === 0 ? (
        <p className="text-sm text-muted">{t('settings.departments.noSpecialties')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {all.map((s) => (
            <label
              key={s}
              className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${
                selected.includes(s)
                  ? 'border-primary bg-accent text-primary-dark'
                  : 'border-border text-text'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(s)}
                onChange={() => toggle(s)}
                className="size-4 accent-primary"
              />
              {specialtyLabel(s)}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** SET-1 section 2: departments and the specialties they contain. */
export function DepartmentsSection({ settings }: { settings: ClinicSettingsDto }) {
  const { t } = useTranslation();
  const reference = useClinicReferenceQuery();
  const defaults = useMemo(() => departmentsDefaults(settings), [settings]);
  const { form, onSubmit, saving, dirty, general, cancel } = useSectionForm<DepartmentsValues>({
    schema: departmentsSchema,
    defaults,
    build: (values) => departmentsPayload(values, defaults),
    fields: ['departments', 'name', 'specialties'],
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'departments' });
  const [removing, setRemoving] = useState<number | null>(null);
  const errors = form.formState.errors.departments;
  const options = reference.data?.specialties ?? [];
  const removingName = removing !== null ? form.getValues(`departments.${removing}.name`) : '';

  return (
    <>
      <SectionCard
        title={t('settings.departments.title')}
        subtitle={t('settings.departments.subtitle')}
        dirty={dirty}
        saving={saving}
        general={general}
        onSubmit={onSubmit}
        onCancel={cancel}
      >
        {fields.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">
            {t('settings.departments.empty')}
          </p>
        )}
        <ul className="space-y-4">
          {fields.map((field, index) => (
            <li key={field.id} className="rounded-md border border-border p-4">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Field
                    label={t('settings.departments.name')}
                    error={errors?.[index]?.name?.message}
                  >
                    <Input {...form.register(`departments.${index}.name`)} />
                  </Field>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const d = form.getValues(`departments.${index}`);
                    // Nothing to lose for an untouched new row; otherwise ask first.
                    if (
                      d.id.startsWith(NEW_DEPARTMENT_PREFIX) &&
                      !d.name &&
                      d.specialties.length === 0
                    )
                      remove(index);
                    else setRemoving(index);
                  }}
                  aria-label={t('settings.departments.remove')}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  <span className="hidden sm:inline">{t('settings.departments.remove')}</span>
                </Button>
              </div>
              <div className="mt-4">
                <SpecialtyPicker form={form} index={index} options={options} />
              </div>
            </li>
          ))}
        </ul>
        {errors?.message && (
          <p role="alert" className="mt-3 text-sm text-error">
            {t(errors.message)}
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={() =>
            append(
              { id: `${NEW_DEPARTMENT_PREFIX}${Date.now()}`, name: '', specialties: [] },
              { shouldFocus: true },
            )
          }
        >
          <Plus size={16} aria-hidden="true" />
          {t('settings.departments.add')}
        </Button>
      </SectionCard>
      <ConfirmDialog
        open={removing !== null}
        title={t('settings.departments.removeTitle', { name: removingName })}
        confirmLabel={t('settings.departments.removeConfirm')}
        cancelLabel={t('clinic.cancel')}
        tone="danger"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing !== null) remove(removing);
          setRemoving(null);
        }}
      >
        {t('settings.departments.removeBody')}
      </ConfirmDialog>
    </>
  );
}
