import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Field, Input, Select, Textarea } from '../../common/Input';
import type { PatientFormValues } from './schema';

export type PatientFieldGroup = 'identity' | 'contact' | 'notes' | 'preference';

/** Form controls shared by the add modal and the profile edit tabs. */
export function PatientFields({
  register,
  errors,
  groups,
}: {
  register: UseFormRegister<PatientFormValues>;
  errors: FieldErrors<PatientFormValues>;
  groups: PatientFieldGroup[];
}) {
  const { t } = useTranslation();
  const err = (key: keyof PatientFormValues) => errors[key]?.message as string | undefined;
  const preference = (
    <Field label={t('patients.fields.contactPreference')}>
      <Select {...register('contactPreference')}>
        <option value="SMS">{t('patients.contact.SMS')}</option>
        <option value="EMAIL">{t('patients.contact.EMAIL')}</option>
        <option value="PHONE">{t('patients.contact.PHONE')}</option>
      </Select>
    </Field>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.includes('identity') && (
        <>
          <Field label={t('patients.fields.firstName')} error={err('firstName')}>
            <Input autoComplete="off" {...register('firstName')} />
          </Field>
          <Field label={t('patients.fields.lastName')} error={err('lastName')}>
            <Input autoComplete="off" {...register('lastName')} />
          </Field>
          <Field label={t('patients.fields.dateOfBirth')} error={err('dateOfBirth')}>
            <Input type="date" dir="ltr" {...register('dateOfBirth')} />
          </Field>
          <Field label={t('patients.fields.gender')}>
            <Select {...register('gender')}>
              <option value="">{t('patients.gender.unspecified')}</option>
              <option value="female">{t('patients.gender.female')}</option>
              <option value="male">{t('patients.gender.male')}</option>
            </Select>
          </Field>
        </>
      )}
      {groups.includes('contact') && (
        <>
          <Field label={t('patients.fields.phone')} error={err('phone')}>
            <Input type="tel" dir="ltr" autoComplete="off" {...register('phone')} />
          </Field>
          <Field label={t('patients.fields.email')} error={err('email')}>
            <Input type="email" dir="ltr" autoComplete="off" {...register('email')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('patients.fields.address')} error={err('address')}>
              <Input {...register('address')} />
            </Field>
          </div>
        </>
      )}
      {groups.includes('preference') && preference}
      {groups.includes('notes') && (
        <div className="sm:col-span-2">
          <Field label={t('patients.fields.adminNotes')} error={err('adminNotes')}>
            <Textarea rows={3} {...register('adminNotes')} />
          </Field>
        </div>
      )}
    </div>
  );
}
