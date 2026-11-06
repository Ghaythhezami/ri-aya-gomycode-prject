import { useEffect, useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { DoctorDetail } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Input, Select } from '../../common/Input';
import { LocalizedInput } from '../../common/LocalizedInput';
import { Modal } from '../../common/Modal';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { useClinicReferenceQuery } from '../shared/api';
import { toLocalizedValue, useClinicDefaultLanguage } from '../patients/names';
import { useCreateDoctorMutation, useUpdateDoctorMutation } from './api';
import {
  EMPTY_DOCTOR_FORM,
  doctorFormSchema,
  toDoctorInput,
  type DoctorFormInput,
  type DoctorFormValues,
} from './schema';

/** Create (admins) or edit a doctor / staff member. */
export function DoctorFormModal({
  open,
  doctor,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Present when editing. */
  doctor?: DoctorDetail;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const listId = useId();
  const { data: reference } = useClinicReferenceQuery();
  const defaultLanguage = useClinicDefaultLanguage();
  const [create, { isLoading: creating }] = useCreateDoctorMutation();
  const [update, { isLoading: updating }] = useUpdateDoctorMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const initial: DoctorFormInput = doctor
    ? {
        firstNameI18n: toLocalizedValue(doctor.firstNameI18n, doctor.firstName, defaultLanguage),
        lastNameI18n: toLocalizedValue(doctor.lastNameI18n, doctor.lastName, defaultLanguage),
        specialty: doctor.specialty,
        consultationMinutes: doctor.consultationMinutes,
        licenseNumber: doctor.licenseNumber ?? '',
        roomId: doctor.room?.id ?? '',
      }
    : EMPTY_DOCTOR_FORM;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DoctorFormInput, unknown, DoctorFormValues>({
    resolver: zodResolver(doctorFormSchema),
    defaultValues: initial,
  });

  useEffect(() => {
    if (open) {
      reset(initial);
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doctor?.id]);

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const body = toDoctorInput(values, defaultLanguage);
    try {
      const saved = doctor
        ? await update({ id: doctor.id, body }).unwrap()
        : await create(body).unwrap();
      toast.success(t(doctor ? 'doctors.toast.updated' : 'doctors.toast.created'));
      onSaved?.(saved.id);
      onClose();
    } catch (raw) {
      const e = asClinicError(raw);
      setFormError(t(`errors.${e?.code}`, { defaultValue: e?.message ?? t('errors.generic') }));
    }
  });

  const err = (k: keyof DoctorFormInput) => errors[k]?.message as string | undefined;
  const busy = creating || updating;

  return (
    <Modal
      open={open}
      title={t(doctor ? 'doctors.form.editTitle' : 'doctors.form.addTitle')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
            {t('clinic.cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            {t(doctor ? 'clinic.save' : 'doctors.form.create')}
          </Button>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(e) => void submit(e)}
        className="grid max-h-[65vh] gap-4 overflow-y-auto pe-1 sm:grid-cols-2"
      >
        {(['firstNameI18n', 'lastNameI18n'] as const).map((key) => (
          <div key={key} className="sm:col-span-2">
            <Controller
              control={control}
              name={key}
              render={({ field }) => (
                <LocalizedInput
                  label={t(
                    key === 'firstNameI18n' ? 'doctors.form.firstName' : 'doctors.form.lastName',
                  )}
                  name={key}
                  required
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={err(key)}
                  autoComplete="off"
                />
              )}
            />
          </div>
        ))}
        <Field
          label={t('doctors.form.specialty')}
          error={err('specialty')}
          help={t('doctors.form.specialtyHelp')}
        >
          <Input list={listId} autoComplete="off" {...register('specialty')} />
        </Field>
        <datalist id={listId}>
          {(reference?.specialties ?? []).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <Field label={t('doctors.form.minutes')} error={err('consultationMinutes')}>
          <Input
            type="number"
            min={5}
            max={240}
            step={5}
            dir="ltr"
            {...register('consultationMinutes')}
          />
        </Field>
        <Field label={t('doctors.form.room')}>
          <Select {...register('roomId')}>
            <option value="">{t('doctors.form.noRoom')}</option>
            {(reference?.rooms ?? [])
              .filter((r) => r.isActive || r.id === doctor?.room?.id)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label={t('doctors.form.license')}>
          <Input dir="ltr" autoComplete="off" {...register('licenseNumber')} />
        </Field>
        {formError && (
          <p role="alert" className="text-sm text-error sm:col-span-2">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
