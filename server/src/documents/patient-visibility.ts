/**
 * Which documents of a patient the patient may see: the ones they uploaded and the ones a
 * clinician reviewed. Their plain-language summary is shown only after clinician review.
 */
export const PATIENT_VISIBLE_DOCUMENTS = {
  OR: [{ uploadedBy: 'PATIENT' }, { reviewedAt: { not: null } }],
};
