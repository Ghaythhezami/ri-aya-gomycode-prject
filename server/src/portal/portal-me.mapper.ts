import type { PortalMe } from '@riaya/shared';
import { normalizeLocalized } from '@riaya/shared';
import { localizedNames, personName } from '../common/mappers';

type PatientFields = {
  id: string;
  firstName: string;
  lastName: string;
  firstNameI18n: unknown;
  lastNameI18n: unknown;
  phone: string;
  dateOfBirth: Date;
  contactPreference: string;
};

export type AccountWithPatient = {
  id: string;
  clinicId: string;
  patientId: string;
  email: string;
  preferredLocale: string;
  aiConsentAt: Date | null;
  emailVerifiedAt: Date | null;
  onboardingCompletedAt: Date | null;
  patient: PatientFields;
};

export function toPortalMe(
  account: AccountWithPatient,
  clinicName: string,
  clinicTimezone = 'UTC',
): PortalMe {
  const p = account.patient;
  const names = localizedNames(p);
  const locale = account.preferredLocale;
  return {
    accountId: account.id,
    patientId: account.patientId,
    clinicId: account.clinicId,
    clinicName,
    clinicTimezone,
    email: account.email,
    firstName: names.firstName,
    lastName: names.lastName,
    firstNameI18n: normalizeLocalized(p.firstNameI18n),
    lastNameI18n: normalizeLocalized(p.lastNameI18n),
    displayName: personName(p),
    phone: p.phone,
    dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10),
    preferredLocale: locale === 'fr' || locale === 'ar' ? locale : 'en',
    contactPreference: p.contactPreference,
    aiConsent: account.aiConsentAt !== null,
    onboardingCompleted: account.onboardingCompletedAt !== null,
    // emailVerifiedAt is the identity-verified-by-the-clinic timestamp (invite accept or staff).
    verified: Boolean(account.emailVerifiedAt),
  };
}
