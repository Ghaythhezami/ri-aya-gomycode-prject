/**
 * Clinic-operations contract shared by the API (`server/`) and the backoffice.
 *
 * Every response DTO the backoffice reads is declared here, so a shape change is
 * a compile error on both sides. Timestamps are ISO 8601 UTC strings; the clinic
 * time zone is applied in the UI. The full endpoint list is in docs/API-CONTRACT.md.
 */

import type { LocalizedText } from './platform';

export const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** The three system appointment types every clinic has; clinics add their own (AppointmentTypeDto). */
export const APPOINTMENT_TYPES = ['CONSULTATION', 'FOLLOW_UP', 'EMERGENCY'] as const;
export type SystemAppointmentType = (typeof APPOINTMENT_TYPES)[number];
/** Code of one of the clinic's appointment types (system or custom, upper-case). */
export type AppointmentType = string;

/** Default durations in minutes of the system types (each clinic can change them). */
export const DEFAULT_DURATIONS: Record<SystemAppointmentType, number> = {
  CONSULTATION: 30,
  FOLLOW_UP: 15,
  EMERGENCY: 20,
};

/**
 * The appointment state machine (APP-1). A transition not listed here is illegal
 * and the API answers 409 ILLEGAL_TRANSITION.
 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  SCHEDULED: ['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'SCHEDULED'],
  CHECKED_IN: ['IN_PROGRESS', 'NO_SHOW', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses that hold a slot (everything except CANCELLED and NO_SHOW). */
export const ACTIVE_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
];

export const QUEUE_PRIORITIES = ['NORMAL', 'URGENT', 'EMERGENCY'] as const;
export type QueuePriority = (typeof QUEUE_PRIORITIES)[number];

export const QUEUE_STATUSES = [
  'WAITING',
  'CALLED',
  'IN_CONSULTATION',
  'COMPLETED',
  'NO_SHOW',
  'RESCHEDULED',
] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const OPTIMIZATION_OBJECTIVES = ['MIN_WAIT', 'MAX_UTILISATION', 'REDUCE_GAPS'] as const;
export type OptimizationObjective = (typeof OPTIMIZATION_OBJECTIVES)[number];

export const NOTIFICATION_CATEGORIES = [
  'REMINDER',
  'CONFIRMATION',
  'CANCELLATION',
  'CONFLICT',
  'DELAY',
  'AVAILABILITY',
  'SYSTEM',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type DayPeriod = 'MORNING' | 'AFTERNOON' | 'EVENING';

/** Stable API error codes; the backoffice translates them (`errors.<CODE>`). */
export const CLINIC_ERROR_CODES = [
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'FORBIDDEN',
  'SLOT_CONFLICT',
  'SLOT_LOCKED',
  'OUTSIDE_WORKING_HOURS',
  'ILLEGAL_TRANSITION',
  'CANCEL_REASON_REQUIRED',
  'CANCELLATION_POLICY',
  'DUPLICATE_PATIENT',
  'HOURS_CONFLICT',
  'QUEUE_EMPTY',
  'ALREADY_CHECKED_IN',
  'STALE_PROPOSAL',
  'UNDO_EXPIRED',
  'CHECK_IN_NOT_FOUND',
  'SERVICE_UNAVAILABLE',
  'AI_UNAVAILABLE',
  'CONSENT_REQUIRED',
  'DOCUMENT_INVALID',
  'AI_BUDGET_EXCEEDED',
  'AI_ERROR',
  'CONVERSATION_TOO_LONG',
  'DUPLICATE_DOCUMENT',
  'VERIFICATION_REQUIRED',
  'QUOTA_EXCEEDED',
  'PORTAL_DISABLED',
] as const;
export type ClinicErrorCode = (typeof CLINIC_ERROR_CODES)[number];

// ---------------------------------------------------------------- common

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PersonRef {
  id: string;
  name: string;
  initials: string;
}

export interface DoctorRef extends PersonRef {
  specialty: string;
}

export interface RoomDto {
  id: string;
  /** Localized for the request language (Accept-Language), canonical name as fallback. */
  name: string;
  /** Every language the name was entered in. */
  nameI18n?: LocalizedText;
  kind: string;
  isActive: boolean;
}

// ---------------------------------------------------------------- patients

export type PatientStatus = 'ACTIVE' | 'ARCHIVED';

export interface PatientListItem {
  id: string;
  code: string;
  /** Canonical (single-language) columns, used for sorting and search. */
  firstName: string;
  lastName: string;
  /** Full name localized for the request language. */
  name: string;
  /** Present on detail/edit shapes only. */
  firstNameI18n?: LocalizedText;
  lastNameI18n?: LocalizedText;
  initials: string;
  /** Masked in lists, e.g. "+971 50 ••• 1447". */
  phoneMasked: string;
  gender: string | null;
  status: PatientStatus;
  lastVisit: string | null;
  nextAppointment: string | null;
}

export interface PatientDetail extends Omit<PatientListItem, 'phoneMasked'> {
  phone: string;
  email: string | null;
  dateOfBirth: string;
  address: string | null;
  contactPreference: 'SMS' | 'EMAIL' | 'PHONE';
  adminNotes: string | null;
  /** Present only for DOCTOR, CLINIC_ADMIN and SUPER_ADMIN. */
  clinicalNotes?: string | null;
  canReadClinicalNotes: boolean;
  createdAt: string;
}

export interface CreatePatientInput {
  /** Canonical names; optional when `firstNameI18n`/`lastNameI18n` carry at least one language. */
  firstName?: string;
  lastName?: string;
  firstNameI18n?: LocalizedText;
  lastNameI18n?: LocalizedText;
  dateOfBirth: string; // YYYY-MM-DD
  phone: string;
  email?: string;
  gender?: 'female' | 'male';
  address?: string;
  contactPreference?: 'SMS' | 'EMAIL' | 'PHONE';
  adminNotes?: string;
  /** Create even when duplicates were reported. */
  force?: boolean;
}

export type UpdatePatientInput = Partial<Omit<CreatePatientInput, 'force'>> & {
  clinicalNotes?: string;
};

export interface DuplicateCheckResult {
  matches: PatientListItem[];
}

// ---------------------------------------------------------------- doctors

export type DoctorAvailability =
  'AVAILABLE' | 'IN_CONSULTATION' | 'ON_BREAK' | 'ON_LEAVE' | 'OFF_DUTY' | 'INACTIVE';

export interface WorkingInterval {
  weekday: number; // 0 = Sunday
  startMinute: number;
  endMinute: number;
  kind: 'WORK' | 'BREAK';
}

export interface LeaveDto {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

/** Utilisation of one doctor over a date range (`from`/`to` inclusive, clinic time zone). */
export interface DoctorPeriodStats {
  from: string;
  to: string;
  appointmentsCount: number;
  completedCount: number;
  noShowCount: number;
  bookedMinutes: number;
  availableMinutes: number;
  /** 0..100 */
  utilisation: number;
  /** Local date (YYYY-MM-DD) with the most appointments, null when there are none. */
  busiestDay: string | null;
}

export interface DoctorDailyStats {
  date: string;
  appointments: number;
  utilisation: number;
}

export interface DoctorCard {
  id: string;
  /** Localized for the request language, prefixed "Dr.". */
  name: string;
  firstName: string;
  lastName: string;
  /** Present on detail/edit shapes only. */
  firstNameI18n?: LocalizedText;
  lastNameI18n?: LocalizedText;
  initials: string;
  specialty: string;
  consultationMinutes: number;
  isActive: boolean;
  availability: DoctorAvailability;
  /** "08:00–16:00" for the selected day, null when off. */
  hoursLabel: string | null;
  appointmentsCount: number;
  /** booked minutes / available minutes for the selected day, 0..100. */
  utilisation: number;
  room: RoomDto | null;
  /** Set when the list/detail was requested with `from`/`to`. */
  period?: DoctorPeriodStats;
}

export interface DoctorDetail extends DoctorCard {
  /** Per-day breakdown of `period`, set with `from`/`to`. */
  daily?: DoctorDailyStats[];
  licenseNumber: string | null;
  workingHours: WorkingInterval[];
  leaves: LeaveDto[];
  upcoming: AppointmentListItem[];
}

export interface CreateDoctorInput {
  /** Canonical names; optional when the i18n values carry at least one language. */
  firstName?: string;
  lastName?: string;
  firstNameI18n?: LocalizedText;
  lastNameI18n?: LocalizedText;
  specialty: string;
  consultationMinutes?: number;
  licenseNumber?: string;
  roomId?: string | null;
}

export interface HoursConflict {
  appointmentId: string;
  code: string;
  patientName: string;
  startsAt: string;
}

export interface SlotDto {
  doctorId: string;
  startsAt: string;
  endsAt: string;
  available: boolean;
  period: DayPeriod;
}

export interface AlternativeSlot extends SlotDto {
  doctorName: string;
  /** SAME_DOCTOR or SAME_SPECIALTY */
  kind: 'SAME_DOCTOR' | 'SAME_SPECIALTY';
}

// ---------------------------------------------------------------- appointments

export interface AppointmentListItem {
  id: string;
  code: string;
  patient: PersonRef & { code: string };
  doctor: DoctorRef;
  room: { id: string; name: string } | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  type: AppointmentType;
  /** Type name in the request language (Accept-Language). */
  typeName?: string;
  /** Colour token key of the type (AppointmentTypeColor). */
  typeColor?: string;
  reason: string | null;
  needsReschedule: boolean;
  locked: boolean;
}

export interface ReminderDto {
  id: string;
  channel: 'SMS' | 'EMAIL';
  offsetMinutes: number;
  scheduledFor: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  sentAt: string | null;
  error: string | null;
}

export interface AppointmentDetail extends AppointmentListItem {
  notes: string | null;
  cancelReason: string | null;
  allowedTransitions: AppointmentStatus[];
  reminders: ReminderDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppointmentInput {
  patientId: string;
  doctorId: string;
  startsAt: string;
  type: AppointmentType;
  durationMinutes?: number;
  reason?: string;
  notes?: string;
  roomId?: string;
  reminderChannels?: ('SMS' | 'EMAIL')[];
  /** Token from POST /appointments/locks; released on success. */
  lockToken?: string;
}

export interface UpdateAppointmentInput {
  doctorId?: string;
  startsAt?: string;
  durationMinutes?: number;
  type?: AppointmentType;
  reason?: string;
  notes?: string;
  roomId?: string | null;
  locked?: boolean;
}

/** `details` of a 409 SLOT_CONFLICT. */
export interface SlotConflictDetails {
  alternatives: AlternativeSlot[];
}

export interface SlotLock {
  lockToken: string;
  expiresAt: string;
}

export interface BulkActionResult {
  updated: number;
  failed: { id: string; code: ClinicErrorCode }[];
}

// ---------------------------------------------------------------- queue

export interface QueueEntryDto {
  id: string;
  number: string;
  appointmentId: string;
  appointmentCode: string;
  patient: PersonRef;
  doctor: DoctorRef;
  room: { id: string; name: string } | null;
  appointmentTime: string;
  checkedInAt: string;
  calledAt: string | null;
  startedAt: string | null;
  priority: QueuePriority;
  status: QueueStatus;
  source: 'DESK' | 'QR';
  /** Computed server-side from checkedInAt (or until calledAt). */
  waitingMinutes: number;
  overTarget: boolean;
  delayMinutes: number;
}

export interface QueueSummary {
  waiting: number;
  inConsultation: number;
  averageWaitMinutes: number;
  longestWaitMinutes: number;
  longestWaitNumber: string | null;
  checkedInToday: number;
  completedToday: number;
  targetWaitMinutes: number;
}

export interface QueueSnapshot {
  summary: QueueSummary;
  entries: QueueEntryDto[];
  /** Today's appointments not yet checked in (for the check-in picker). */
  expected: AppointmentListItem[];
  updatedAt: string;
}

/** Public waiting-room display: queue numbers and rooms only, never names. */
export interface PublicDisplay {
  clinicName: string;
  nowServing: { number: string; room: string | null }[];
  waiting: { number: string }[];
  updatedAt: string;
}

export interface SelfCheckInInput {
  appointmentCode: string;
  /** Last four digits of the phone on file. */
  phoneLast4: string;
}

export interface SelfCheckInResult {
  number: string;
  position: number;
}

// ---------------------------------------------------------------- smart scheduling

export interface GridBlock {
  appointmentId: string;
  code: string;
  patientName: string;
  type: AppointmentType;
  /** Localized name of the clinic's appointment type. */
  typeName?: string;
  /** Colour key of the type (APPOINTMENT_TYPE_COLORS). */
  typeColor?: string | null;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  /** EMERGENCY, CHECKED_IN, IN_PROGRESS, COMPLETED or locked → not movable. */
  movable: boolean;
  conflict: boolean;
}

export interface DoctorDayMetrics {
  doctorId: string;
  bookedMinutes: number;
  availableMinutes: number;
  freeMinutes: number;
  idleGapMinutes: number;
  utilisation: number;
  estimatedWaitMinutes: number;
}

export interface DayMetricsTotals {
  appointments: number;
  bookedMinutes: number;
  availableMinutes: number;
  utilisation: number;
  /** free minutes / available minutes, 0..100 */
  availability: number;
  idleGapMinutes: number;
  estimatedWaitMinutes: number;
}

export interface DayMetrics {
  date: string;
  perDoctor: DoctorDayMetrics[];
  totals: DayMetricsTotals;
}

export interface SchedulingDay {
  date: string;
  timezone: string;
  /** Grid bounds, minutes after local midnight. */
  dayStartMinute: number;
  dayEndMinute: number;
  doctors: {
    id: string;
    name: string;
    initials: string;
    specialty: string;
    work: { startsAt: string; endsAt: string }[];
    breaks: { startsAt: string; endsAt: string }[];
    blocks: GridBlock[];
  }[];
  metrics: DayMetrics;
  version: string;
}

export interface ProposalMove {
  appointmentId: string;
  code: string;
  patientName: string;
  fromDoctorId: string;
  toDoctorId: string;
  fromStartsAt: string;
  toStartsAt: string;
  durationMinutes: number;
  reasonKey: string;
}

export interface OptimizationProposal {
  id: string;
  date: string;
  objective: OptimizationObjective;
  version: string;
  status: 'IMPROVED' | 'NO_IMPROVEMENT';
  moves: ProposalMove[];
  before: DayMetricsTotals;
  after: DayMetricsTotals;
  unresolved: { appointmentId: string; code: string; reasonKey: string }[];
  idleDoctors: { doctorId: string; name: string; freeMinutes: number }[];
  createdAt: string;
  state: 'PROPOSED' | 'APPLIED' | 'UNDONE' | 'REJECTED';
  undoUntil: string | null;
  /** Which optimiser produced the proposal: the Python service or the in-process fallback. */
  engine?: 'python' | 'typescript';
}

export interface MoveValidation {
  valid: boolean;
  reasonKey?: string;
}

// ---------------------------------------------------------------- analytics

/** One bucket of a no-show breakdown (rate is Bayesian-smoothed, 0..1). */
export interface InsightRate {
  key: string;
  rate: number;
  count: number;
}

export type InsightRecommendation =
  | {
      kind: 'HIGH_NO_SHOW_SLOT';
      params: { weekday: number; hour: number; rate: number; count: number };
    }
  | { kind: 'PEAK_HOURS'; params: { cells: { weekday: number; hour: number; count: number }[] } }
  | {
      kind: 'UNDERUSED_DOCTOR';
      params: {
        doctorId: string;
        doctorName?: string;
        bookedMinutes: number;
        medianMinutes: number;
      };
    };

/**
 * Large-history scheduling insights computed by the Python scheduler service (ADR 0003).
 * `demand.matrix[weekday][hour]`, weekday 0 = Monday, clinic local time.
 */
export interface SchedulingInsights {
  range: { from: string; to: string; timeZone: string };
  totals: {
    appointments: number;
    completed: number;
    noShows: number;
    cancelled: number;
    noShowRate: number;
  };
  demand: { matrix: number[][]; peak: { weekday: number; hour: number; count: number }[] };
  noShow: {
    byWeekday: InsightRate[];
    byHour: InsightRate[];
    byType: InsightRate[];
    byLeadTime: InsightRate[];
  };
  doctors: {
    doctorId: string;
    doctorName?: string;
    appointments: number;
    bookedMinutes: number;
    noShowRate: number;
    avgDurationMinutes: number;
  }[];
  forecast: { date: string; expected: number }[];
  recommendations: InsightRecommendation[];
  meta: { rowsScanned: number; chunks: number; durationMs: number; engine: string };
}

export interface DashboardDto {
  kpis: {
    todayAppointments: number;
    todayChangePct: number;
    patientsWaiting: number;
    waitingOverTarget: number;
    availableDoctors: number;
    totalDoctors: number;
    utilisation: number;
    avgWaitMinutes: number;
    avgWaitChangePct: number;
  };
  schedule: AppointmentListItem[];
  activity: {
    kind: 'CHECK_IN' | 'CANCELLATION' | 'NEW_PATIENT' | 'REMINDER';
    count: number;
    at: string | null;
  }[];
  insight: { kind: 'OPTIMIZE'; minutesSaved: number } | null;
  weeklyVolume: { date: string; count: number }[];
  statusDistribution: { status: AppointmentStatus; count: number }[];
  doctorUtilisation: { doctorId: string; name: string; utilisation: number }[];
  waitTrend: { date: string; minutes: number }[];
}

export type AnalyticsScope = 'clinic' | 'organization';

export interface AnalyticsDto {
  range: { from: string; to: string };
  previous: { from: string; to: string };
  scope: AnalyticsScope;
  kpis: {
    volume: number;
    volumeChangePct: number;
    noShowRate: number;
    noShowRateChange: number;
    cancellationRate: number;
    cancellationRateChange: number;
    avgWaitMinutes: number;
    avgWaitChange: number;
    throughputPerDay: number;
    throughputChangePct: number;
    avgDurationMinutes: number;
  };
  volumeByDay: { date: string; count: number }[];
  waitByDay: { date: string; minutes: number }[];
  bySpecialty: { specialty: string; count: number }[];
  statusDistribution: { status: AppointmentStatus; count: number }[];
  doctorUtilisation: { doctorId: string; name: string; utilisation: number }[];
  peakHours: { hour: number; count: number }[];
}

// ---------------------------------------------------------------- notifications

export interface NotificationDto {
  id: string;
  category: NotificationCategory;
  /** i18n keys under `notifications.templates.*`, interpolated with `params`. */
  titleKey: string;
  bodyKey: string;
  params: Record<string, string | number>;
  entityType: 'appointment' | 'patient' | 'doctor' | 'queue' | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationPage extends CursorPage<NotificationDto> {
  unreadCount: number;
}

export interface DeliveryStats {
  successRate: number;
  sms: number;
  email: number;
  pending: number;
  failed: number;
}

// ---------------------------------------------------------------- settings

export interface OpeningDay {
  weekday: number;
  open: number;
  close: number;
  closed: boolean;
}

export interface Department {
  id: string;
  name: string;
  specialties: string[];
}

export interface ClinicSettingsDto {
  clinic: {
    id: string;
    name: string;
    code: string;
    address: string | null;
    timezone: string;
    currency: string;
  };
  contactEmail: string | null;
  phone: string | null;
  defaultLanguage: 'en' | 'ar' | 'fr';
  cancellationNoticeHours: number;
  requireCancelReason: boolean;
  targetWaitMinutes: number;
  slotMinutes: number;
  durations: Record<AppointmentType, number>;
  reminderOffsets: number[];
  reminderChannels: ('SMS' | 'EMAIL')[];
  openingHours: OpeningDay[];
  departments: Department[];
  appearance: { density: 'comfortable' | 'compact'; highContrast: boolean; reduceMotion: boolean };
  updatedAt: string;
}

export type UpdateSettingsInput = Partial<
  Omit<ClinicSettingsDto, 'clinic' | 'updatedAt'> & {
    clinic: Partial<
      Pick<ClinicSettingsDto['clinic'], 'name' | 'address' | 'timezone' | 'currency'>
    >;
  }
>;

export interface RoleSummary {
  role: 'SUPER_ADMIN' | 'CLINIC_ADMIN' | 'DOCTOR' | 'RECEPTIONIST';
  users: number;
  accessLevel: 'FULL' | 'OPERATIONS' | 'CLINICAL' | 'FRONT_DESK';
}

export interface AuditDto {
  id: string;
  action: 'create' | 'update' | 'delete';
  entity: string;
  entityId: string;
  actor: { id: string; name: string } | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

/** Lookup data for selects and filters, cached per clinic. */
export interface ClinicReference {
  clinic: {
    id: string;
    name: string;
    timezone: string;
    /** Clinic default language; canonical names follow it (ADR 0004 §3). */
    defaultLanguage?: 'en' | 'ar' | 'fr';
  };
  doctors: DoctorRef[];
  specialties: string[];
  rooms: RoomDto[];
  durations: Record<AppointmentType, number>;
  slotMinutes: number;
  targetWaitMinutes: number;
}

// ---------------------------------------------------------------- chat

export interface ConversationDto {
  id: string;
  title: string;
  isGroup: boolean;
  members: PersonRef[];
  lastMessage: { body: string; createdAt: string; senderId: string } | null;
  unread: number;
}

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  sender: PersonRef;
  body: string;
  createdAt: string;
  readByOthers: boolean;
}
