import { render, screen } from '@testing-library/react';
import { canonicalFor, firstFilled, otherSpellings, toLocalizedValue } from './names';
import { SecondaryNames } from './SecondaryNames';
import { EMPTY_PATIENT_FORM, patientFormSchema, toCreateInput } from './schema';
import { doctorFormSchema, EMPTY_DOCTOR_FORM, toDoctorInput } from '../doctors/schema';

const patient = {
  ...EMPTY_PATIENT_FORM,
  dateOfBirth: '1990-01-01',
  phone: '+971 50 123 4567',
};

describe('patient form validation', () => {
  it('requires at least one language per name', () => {
    const result = patientFormSchema.safeParse(patient);
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message);
    expect(messages).toEqual(['localized.required', 'localized.required']);
  });

  it('accepts a single language per name, even Arabic only', () => {
    const result = patientFormSchema.safeParse({
      ...patient,
      firstNameI18n: { en: '', fr: '', ar: 'ليلى' },
      lastNameI18n: { en: 'Ben Salah', fr: '', ar: '' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a whitespace-only name and values over 120 characters', () => {
    const blank = patientFormSchema.safeParse({
      ...patient,
      firstNameI18n: { en: '  ', fr: '', ar: '' },
      lastNameI18n: { en: 'x', fr: '', ar: '' },
    });
    expect(blank.success).toBe(false);
    const long = patientFormSchema.safeParse({
      ...patient,
      firstNameI18n: { en: 'x'.repeat(121), fr: '', ar: '' },
      lastNameI18n: { en: 'x', fr: '', ar: '' },
    });
    expect(long.success).toBe(false);
  });

  it('sends the canonical name only when typed in the clinic default language', () => {
    const values = patientFormSchema.parse({
      ...patient,
      firstNameI18n: { en: ' Leila ', fr: '', ar: 'ليلى' },
      lastNameI18n: { en: '', fr: '', ar: 'بن صالح' },
    });
    const withEn = toCreateInput(values, 'en');
    expect(withEn.firstName).toBe('Leila');
    expect(withEn.lastName).toBeUndefined();
    expect(withEn.firstNameI18n).toEqual({ en: 'Leila', ar: 'ليلى' });
    expect(withEn.lastNameI18n).toEqual({ ar: 'بن صالح' });
    const unknownDefault = toCreateInput(values);
    expect(unknownDefault.firstName).toBeUndefined();
    expect(toCreateInput(values, 'fr').firstName).toBeUndefined();
  });
});

describe('doctor form validation', () => {
  const base = { ...EMPTY_DOCTOR_FORM, specialty: 'Cardiology' };

  it('requires a name in at least one language', () => {
    const result = doctorFormSchema.safeParse(base);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      'localized.required',
      'localized.required',
    ]);
  });

  it('builds the request body from localized names', () => {
    const values = doctorFormSchema.parse({
      ...base,
      firstNameI18n: { en: 'Amal', fr: '', ar: 'أمل' },
      lastNameI18n: { en: '', fr: 'Haddad', ar: '' },
    });
    const body = toDoctorInput(values, 'fr');
    expect(body.firstNameI18n).toEqual({ en: 'Amal', ar: 'أمل' });
    expect(body.lastNameI18n).toEqual({ fr: 'Haddad' });
    expect(body.firstName).toBeUndefined();
    expect(body.lastName).toBe('Haddad');
    expect(body.roomId).toBeNull();
  });
});

describe('name helpers', () => {
  it('lists the other spellings of a name', () => {
    const first = { en: 'Leila', ar: 'ليلى' };
    const last = { en: 'Ben Salah', ar: 'بن صالح' };
    expect(otherSpellings(first, last, 'Leila Ben Salah')).toEqual(['ليلى بن صالح']);
    expect(otherSpellings(first, last, 'ليلى بن صالح')).toEqual(['Leila Ben Salah']);
    expect(otherSpellings(first, last, 'Dr. Leila Ben Salah')).toEqual(['ليلى بن صالح']);
    expect(otherSpellings({ en: 'Leila' }, { en: 'Ben Salah' }, 'Leila Ben Salah')).toEqual([]);
    expect(otherSpellings(undefined, undefined, 'Leila')).toEqual([]);
  });

  it('falls back to the canonical name for records without translations', () => {
    expect(toLocalizedValue(undefined, 'Leila', 'fr')).toEqual({ en: '', fr: 'Leila', ar: '' });
    expect(toLocalizedValue({ ar: 'ليلى' }, 'Leila')).toEqual({ en: '', fr: '', ar: 'ليلى' });
    expect(canonicalFor({ en: ' ' }, 'en')).toBeUndefined();
    expect(firstFilled({ fr: 'Leïla', ar: 'ليلى' })).toBe('Leïla');
  });

  it('shows the other spellings as secondary text', () => {
    render(
      <SecondaryNames
        first={{ en: 'Leila', ar: 'ليلى' }}
        last={{ en: 'Ben Salah', ar: 'بن صالح' }}
        shown="Leila Ben Salah"
      />,
    );
    const el = screen.getByTestId('secondary-names');
    expect(el).toHaveTextContent('ليلى بن صالح');
    expect(el).not.toHaveTextContent('Leila');
  });

  it('renders nothing when there is no other spelling', () => {
    const { container } = render(
      <SecondaryNames first={{ en: 'Leila' }} last={{ en: 'Ben Salah' }} shown="Leila Ben Salah" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
