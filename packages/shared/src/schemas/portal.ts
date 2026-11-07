/**
 * Patient portal and AI assistant contracts (ADR 0005). The API DTOs mirror these.
 */
import type { LocalizedText } from './platform';

// ------------------------------------------------------------------ portal identity

export interface PortalClinic {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  selfRegistration: boolean;
}

export interface PortalRegisterInput {
  clinicId: string;
  email: string;
  password: string;
  firstNameI18n: LocalizedText;
  lastNameI18n: LocalizedText;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  phone: string;
  preferredLocale: 'en' | 'fr' | 'ar';
  acceptPrivacy: true;
  aiConsent?: boolean;
}

export interface PortalAcceptInviteInput {
  token: string;
  /** YYYY-MM-DD; must match the patient record (the invite alone is not enough). */
  dateOfBirth: string;
  email: string;
  password: string;
  acceptPrivacy: true;
  aiConsent?: boolean;
}

export interface PortalLoginInput {
  clinicId: string;
  email: string;
  password: string;
}

export interface PortalMe {
  accountId: string;
  patientId: string;
  clinicId: string;
  clinicName: string;
  /** IANA time zone of the clinic; appointment times are shown in it. */
  clinicTimezone: string;
  email: string;
  firstName: string;
  lastName: string;
  firstNameI18n: LocalizedText;
  lastNameI18n: LocalizedText;
  displayName: string;
  phone: string;
  dateOfBirth: string;
  preferredLocale: 'en' | 'fr' | 'ar';
  contactPreference: string;
  aiConsent: boolean;
  onboardingCompleted: boolean;
  /**
   * Identity checked by the clinic (front desk at a visit, or the account came from an
   * invite). Unverified self-registered accounts can book but cannot upload documents or
   * use the assistant, and receive no reminders.
   */
  verified: boolean;
}

/** Portal status of a patient, for staff (patient profile). */
export interface PatientPortalStatus {
  hasAccount: boolean;
  verified: boolean;
  email: string | null;
  createdAt: string | null;
  source: 'STAFF' | 'PORTAL';
  possibleDuplicateOfId: string | null;
}

export interface PortalAuthResponse {
  accessToken: string;
  me: PortalMe;
}

export interface PortalProfileInput {
  firstNameI18n?: LocalizedText;
  lastNameI18n?: LocalizedText;
  phone?: string;
  preferredLocale?: 'en' | 'fr' | 'ar';
  contactPreference?: 'SMS' | 'EMAIL';
  aiConsent?: boolean;
  onboardingCompleted?: boolean;
}

export interface PortalInvite {
  /** Token travels in the URL fragment (`#token=`) so it never reaches server logs or Referer. */
  url: string;
  expiresAt: string;
}

// ------------------------------------------------------------------ self-service

export interface PortalDoctor {
  id: string;
  name: string;
  specialty: string;
  initials: string;
}

/** Bookable (active, non-emergency) appointment type. */
export interface PortalAppointmentType {
  /** Code sent back as `type` when booking. */
  type: string;
  name: string;
  durationMinutes: number;
}

export interface PortalSlot {
  startsAt: string;
  endsAt: string;
}

export interface PortalAppointment {
  id: string;
  code: string;
  doctor: PortalDoctor;
  type: string;
  typeName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  /** Cancellation/reschedule allowed now (status and clinic notice period). */
  canChange: boolean;
  reason: string | null;
}

export interface PortalBookInput {
  doctorId: string;
  type: string;
  startsAt: string;
  reason?: string;
}

export interface PortalRescheduleInput {
  startsAt: string;
  doctorId?: string;
}

export interface PortalSummary {
  id: string;
  content: string;
  publishedAt: string;
  authorName: string;
}

// ------------------------------------------------------------------ documents and summaries

export const DOCUMENT_STATUSES = ['PENDING', 'PROCESSING', 'READY', 'FAILED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_CATEGORIES = [
  'lab_result',
  'prescription',
  'imaging_report',
  'referral',
  'discharge_summary',
  'other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export interface DocumentValue {
  name: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  flag: 'low' | 'normal' | 'high' | 'abnormal' | null;
}

export interface DocumentExtraction {
  title: string;
  findings: string[];
  values: DocumentValue[];
  medications: { name: string; dose: string | null; frequency: string | null }[];
  patientSummary: string;
}

export interface PatientDocumentDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: 'STAFF' | 'PATIENT';
  status: DocumentStatus;
  category: DocumentCategory | null;
  documentDate: string | null;
  summary: string | null;
  extraction: DocumentExtraction | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface PatientDocumentDetail extends PatientDocumentDto {
  extractedText: string | null;
}

export interface PatientSummaryDto {
  id: string;
  content: string;
  patientContent: string | null;
  visibleToPatient: boolean;
  publishedAt: string | null;
  authorName: string;
  createdAt: string;
  sources: { kind: 'appointment' | 'document' | 'note'; id: string; label: string }[];
}

export interface SummaryDraft {
  content: string;
  patientContent: string;
  sources: PatientSummaryDto['sources'];
}

export interface SaveSummaryInput {
  content: string;
  patientContent?: string;
  visibleToPatient?: boolean;
  sources?: PatientSummaryDto['sources'];
}

// ------------------------------------------------------------------ assistant

export const ASSISTANT_PERSONAS = ['staff', 'doctor', 'patient'] as const;
export type AssistantPersona = (typeof ASSISTANT_PERSONAS)[number];

export interface AssistantChatInput {
  conversationId?: string;
  message: string;
  /** Staff only: optional page context, e.g. the patient being viewed. */
  context?: { patientId?: string; date?: string };
}

/**
 * Set when the conversation read patient-supplied text (uploaded documents, booking reasons)
 * before this proposal: the UI warns that the content may be manipulated.
 */
export type ProposalWarning = 'patient_supplied_content';

/** A data change the assistant suggests; the UI confirms it through the normal REST route. */
export type AssistantProposal = { warning?: ProposalWarning } & (
  | {
      id: string;
      action: 'book_appointment';
      preview: string;
      params: {
        patientId?: string;
        doctorId: string;
        type: string;
        startsAt: string;
        reason?: string;
      };
    }
  | {
      id: string;
      action: 'reschedule_appointment';
      preview: string;
      params: { appointmentId: string; startsAt: string; doctorId?: string };
    }
  | {
      id: string;
      action: 'cancel_appointment';
      preview: string;
      params: { appointmentId: string; reason?: string };
    }
  | { id: string; action: 'check_in'; preview: string; params: { appointmentId: string } }
  | {
      id: string;
      action: 'save_summary';
      preview: string;
      params: {
        patientId: string;
        content: string;
        patientContent?: string;
        visibleToPatient: boolean;
      };
    }
  | {
      id: string;
      action: 'add_clinical_note';
      preview: string;
      params: { patientId: string; note: string };
    }
);

/** Server-Sent Events of the assistant chat stream (`event:` name → `data:` JSON). */
export type AssistantStreamEvent =
  | { event: 'conversation'; data: { conversationId: string; persona: AssistantPersona } }
  | { event: 'text'; data: { delta: string } }
  | { event: 'tool'; data: { name: string; status: 'running' | 'done' | 'error' } }
  | { event: 'proposal'; data: AssistantProposal }
  | { event: 'done'; data: { stopReason: string; inputTokens: number; outputTokens: number } }
  | { event: 'error'; data: { code: string; message: string } };

export interface AssistantConversationSummary {
  id: string;
  persona: AssistantPersona;
  title: string | null;
  updatedAt: string;
}

export interface AssistantStatus {
  enabled: boolean;
  persona: AssistantPersona | null;
  /** Why it is unavailable: NOT_CONFIGURED, DISABLED_BY_CLINIC, CONSENT_REQUIRED, FORBIDDEN. */
  reason: string | null;
}
