import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Field, Input, Select, Textarea } from '../../common/Input';
import { LocalizedInput } from '../../common/LocalizedInput';
import type { PatientFormValues } from './schema';

export type PatientFieldGroup = 'identity' | 'contact' | 'notes' | 'preference';

/** Form controls shared by the add modal and the profile edit tabs. */
export function PatientFields({
  register,
  control,
  errors,
  groups,
}: {
  register: UseFormRegister<PatientFormValues>;
  control: Control<PatientFormValues>;
  errors: FieldErrors<PatientFormValues>;
  groups: PatientFieldGroup[];
}) {
  const { t } = useTranslation();
  const err = (key: keyof PatientFormValues) => errors[key]?.message as string | undefined;
  const nameField = (key: 'firstNameI18n' | 'lastNameI18n', label: string) => (
    <div className="sm:col-span-2">
      <Controller
        control={control}
        name={key}
        render={({ field }) => (
          <LocalizedInput
            label={label}
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
  );
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
          {nameField('firstNameI18n', t('patients.fields.firstName'))}
          {nameField('lastNameI18n', t('patients.fields.lastName'))}
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
