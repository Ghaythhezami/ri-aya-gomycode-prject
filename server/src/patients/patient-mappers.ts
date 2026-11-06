import type { PatientDetail, PatientListItem } from '@riaya/shared';
import { normalizeLocalized } from '@riaya/shared';
import { initials, localizedNames, maskPhone, personName } from '../common/mappers';

export interface PatientRow {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  /** Optional so rows from selects without the JSON columns still map. */
  firstNameI18n?: unknown;
  lastNameI18n?: unknown;
  dateOfBirth: Date;
  phone: string;
  email: string | null;
  gender: string | null;
  address: string | null;
  status: string;
  clinicalNotes: string | null;
  adminNotes: string | null;
  contactPreference: string;
  createdAt: Date;
}

export interface PatientVisits {
  lastVisit: Date | null;
  nextAppointment: Date | null;
}

export function toPatientListItem(row: PatientRow, visits?: PatientVisits): PatientListItem {
  const names = localizedNames(row);
  return {
    id: row.id,
    code: row.code,
    firstName: row.firstName,
    lastName: row.lastName,
    name: personName(row),
    initials: initials(names.firstName, names.lastName),
    phoneMasked: maskPhone(row.phone),
    gender: row.gender,
    status: row.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    lastVisit: visits?.lastVisit?.toISOString() ?? null,
    nextAppointment: visits?.nextAppointment?.toISOString() ?? null,
  };
}

export function toPatientDetail(
  row: PatientRow,
  canReadClinicalNotes: boolean,
  visits?: PatientVisits,
): PatientDetail {
  const { phoneMasked: _masked, ...base } = toPatientListItem(row, visits);
  void _masked;
  const detail: PatientDetail = {
    ...base,
    firstNameI18n: normalizeLocalized(row.firstNameI18n),
    lastNameI18n: normalizeLocalized(row.lastNameI18n),
    phone: row.phone,
    email: row.email,
    dateOfBirth: row.dateOfBirth.toISOString().slice(0, 10),
    address: row.address,
    contactPreference: (['SMS', 'EMAIL', 'PHONE'].includes(row.contactPreference)
      ? row.contactPreference
      : 'SMS') as PatientDetail['contactPreference'],
    adminNotes: row.adminNotes,
    canReadClinicalNotes,
    createdAt: row.createdAt.toISOString(),
  };
  if (canReadClinicalNotes) detail.clinicalNotes = row.clinicalNotes;
  return detail;
}

/** Audit snapshot; clinical notes are never copied into the audit trail. */
export function patientAuditSnapshot(row: PatientRow & { archivedAt?: Date | null }) {
  return {
    code: row.code,
    firstName: row.firstName,
    lastName: row.lastName,
    firstNameI18n: normalizeLocalized(row.firstNameI18n),
    lastNameI18n: normalizeLocalized(row.lastNameI18n),
    dateOfBirth: row.dateOfBirth.toISOString().slice(0, 10),
    phone: row.phone,
    email: row.email,
    gender: row.gender,
    address: row.address,
    status: row.status,
    contactPreference: row.contactPreference,
    adminNotes: row.adminNotes,
    hasClinicalNotes: !!row.clinicalNotes,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}
