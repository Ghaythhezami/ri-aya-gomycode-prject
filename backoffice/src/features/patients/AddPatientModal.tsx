import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { PatientListItem } from '@riaya/shared';
import { Button } from '../../common/Button';
import { Modal } from '../../common/Modal';
import { useToast } from '../../common/Toast';
import { asClinicError } from '../../store/clinicApi';
import { usePatientDuplicatesQuery, useCreatePatientMutation } from './api';
import { duplicateMatches, duplicateQuery } from './duplicates';
import { DuplicateWarning } from './DuplicateWarning';
import { PatientFields } from './PatientFields';
import { useDebounced } from './hooks';
import { firstFilled, useClinicDefaultLanguage } from './names';
import {
  EMPTY_PATIENT_FORM,
  patientFormSchema,
  toCreateInput,
  type PatientFormValues,
} from './schema';

export function AddPatientModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const defaultLanguage = useClinicDefaultLanguage();
  const [create, { isLoading }] = useCreatePatientMutation();
  const [serverMatches, setServerMatches] = useState<PatientListItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: EMPTY_PATIENT_FORM,
  });

  useEffect(() => {
    if (!open) {
      reset(EMPTY_PATIENT_FORM);
      setServerMatches([]);
      setFormError(null);
    }
  }, [open, reset]);

  const watched = useWatch({ control });
  const debounced = useDebounced(
    JSON.stringify({
      firstName: firstFilled(watched.firstNameI18n),
      lastName: firstFilled(watched.lastNameI18n),
      dateOfBirth: watched.dateOfBirth,
      phone: watched.phone,
    }),
  );
  const query = open ? duplicateQuery(JSON.parse(debounced)) : null;
  const { data: dup } = usePatientDuplicatesQuery(query ?? {}, { skip: !query });
  const liveMatches = serverMatches.length > 0 || !query ? [] : (dup?.matches ?? []);

  const submit = (force: boolean) =>
    handleSubmit(async (values) => {
      setFormError(null);
      try {
        const input = toCreateInput(values, defaultLanguage);
        const created = await create(force ? { ...input, force: true } : input).unwrap();
        toast.success(t('patients.toast.created'));
        onCreated(created.id);
      } catch (raw) {
        const error = asClinicError(raw);
        const matches = duplicateMatches(error);
        if (error?.status === 409 && matches.length > 0) {
          setServerMatches(matches);
          return;
        }
        setFormError(
          t(`errors.${error?.code}`, { defaultValue: error?.message ?? t('errors.generic') }),
        );
      }
    })();

  return (
    <Modal
      open={open}
      title={t('patients.add.title')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isLoading}>
            {t('clinic.cancel')}
          </Button>
          {serverMatches.length > 0 ? (
            <Button type="button" onClick={() => void submit(true)} disabled={isLoading}>
              {t('patients.duplicates.createAnyway')}
            </Button>
          ) : (
            <Button type="button" onClick={() => void submit(false)} disabled={isLoading}>
              {t('patients.add.submit')}
            </Button>
          )}
        </>
      }
    >
      <form
        className="max-h-[65vh] space-y-4 overflow-y-auto pe-1"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(serverMatches.length > 0);
        }}
        noValidate
      >
        <PatientFields
          register={register}
          control={control}
          errors={errors}
          groups={['identity', 'contact', 'preference', 'notes']}
        />
        <DuplicateWarning matches={liveMatches} />
        <DuplicateWarning
          matches={serverMatches}
          onUse={(p) => {
            onClose();
            onCreated(p.id);
          }}
        />
        {formError && (
          <p role="alert" className="text-sm text-error">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
