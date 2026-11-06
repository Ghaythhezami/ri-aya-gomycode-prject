import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { CreateDoctorInput, DoctorDetail } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Field, Input, Select } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { useClinicReferenceQuery } from '../shared/api';
import { useCreateDoctorMutation, useUpdateDoctorMutation } from './api';

const schema = z.object({
  firstName: z.string().trim().min(1, 'doctors.errors.required').max(80),
  lastName: z.string().trim().min(1, 'doctors.errors.required').max(80),
  specialty: z.string().trim().min(1, 'doctors.errors.required').max(80),
  consultationMinutes: z.coerce
    .number({ message: 'doctors.errors.minutes' })
    .int('doctors.errors.minutes')
    .min(5, 'doctors.errors.minutes')
    .max(240, 'doctors.errors.minutes'),
  licenseNumber: z.string().max(60),
  roomId: z.string(),
});
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

const EMPTY: FormInput = {
  firstName: '',
  lastName: '',
  specialty: '',
  consultationMinutes: 30,
  licenseNumber: '',
  roomId: '',
};

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
  const [create, { isLoading: creating }] = useCreateDoctorMutation();
  const [update, { isLoading: updating }] = useUpdateDoctorMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const initial: FormInput = doctor
    ? {
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        specialty: doctor.specialty,
        consultationMinutes: doctor.consultationMinutes,
        licenseNumber: doctor.licenseNumber ?? '',
        roomId: doctor.room?.id ?? '',
      }
    : EMPTY;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
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
    const body: CreateDoctorInput = {
      firstName: values.firstName,
      lastName: values.lastName,
      specialty: values.specialty,
      consultationMinutes: values.consultationMinutes,
      roomId: values.roomId || null,
    };
    if (values.licenseNumber.trim()) body.licenseNumber = values.licenseNumber.trim();
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

  const err = (k: keyof FormInput) => errors[k]?.message as string | undefined;
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
        <Field label={t('doctors.form.firstName')} error={err('firstName')}>
          <Input autoComplete="off" {...register('firstName')} />
        </Field>
        <Field label={t('doctors.form.lastName')} error={err('lastName')}>
          <Input autoComplete="off" {...register('lastName')} />
        </Field>
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
