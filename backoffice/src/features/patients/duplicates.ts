import type { PatientListItem } from '@riaya/shared';
import type { DuplicateParams } from './api';

export interface DuplicateInput {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  phone?: string;
}

const DOB = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query for GET /patients/duplicates, or null when there is not enough typed yet:
 * name + date of birth, or a phone of at least 6 digits.
 */
export function duplicateQuery(input: DuplicateInput): DuplicateParams | null {
  const firstName = input.firstName?.trim() ?? '';
  const lastName = input.lastName?.trim() ?? '';
  const dateOfBirth = input.dateOfBirth?.trim() ?? '';
  const phone = input.phone?.trim() ?? '';
  const params: DuplicateParams = {};
  if (firstName.length >= 2 && lastName.length >= 2 && DOB.test(dateOfBirth)) {
    params.firstName = firstName;
    params.lastName = lastName;
    params.dateOfBirth = dateOfBirth;
  }
  if (phone.replace(/\D/g, '').length >= 6) params.phone = phone;
  return Object.keys(params).length > 0 ? params : null;
}

/** Matches carried by a 409 DUPLICATE_PATIENT error (`details.matches`), or []. */
export function duplicateMatches(error: unknown): PatientListItem[] {
  if (!error || typeof error !== 'object') return [];
  const e = error as { code?: string; details?: { matches?: unknown } };
  if (e.code !== 'DUPLICATE_PATIENT') return [];
  return Array.isArray(e.details?.matches) ? (e.details.matches as PatientListItem[]) : [];
}
