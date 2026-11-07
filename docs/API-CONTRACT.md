# Clinic operations API contract

All routes are under `/api`, require `Authorization: Bearer <access token>` unless marked
**public**, and are scoped to the clinic in the token (`TenantContext.get()`), never to an id in
the body or query. Response and input types are in `packages/shared/src/schemas/clinic.ts`.

Errors use the global shape `{ code, message, details? }` (`HttpExceptionFilter`). `message` is
localised from `Accept-Language`; the UI translates `code` through `errors.<CODE>`.

Pagination: `page` (1-based), `limit` (default 20, max 100), `sort` (`field` or `-field`).
Dates: `YYYY-MM-DD` = local clinic date; instants are ISO 8601 UTC.

Role names: SA = SUPER_ADMIN, CA = CLINIC_ADMIN, DR = DOCTOR, RC = RECEPTIONIST.
A DOCTOR whose identity is linked to a doctor profile in the active clinic sees only their own
appointments in list/calendar endpoints (`doctorId` forced to their profile).

## Reference

| Method | Path                       | Roles | Response                        |
| ------ | -------------------------- | ----- | ------------------------------- |
| GET    | `/clinic/reference`        | all   | `ClinicReference` (cached 60 s) |
| GET    | `/rooms`                   | all   | `RoomDto[]`                     |
| POST   | `/rooms` `{ name, kind? }` | SA CA | `RoomDto`                       |

## Patients (PAT-1, PAT-2)

| Method | Path                                                        | Roles       | Response                                                                                                   |
| ------ | ----------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/patients?search&status&gender&page&limit&sort`            | all         | `Paginated<PatientListItem>`; `search` matches name, code, phone; archived hidden unless `status=ARCHIVED` |
| GET    | `/patients/duplicates?firstName&lastName&dateOfBirth&phone` | all         | `DuplicateCheckResult`                                                                                     |
| POST   | `/patients` `CreatePatientInput`                            | SA CA RC DR | `PatientDetail`; 409 `DUPLICATE_PATIENT` `{ details: { matches } }` unless `force`                         |
| GET    | `/patients/:id`                                             | all         | `PatientDetail` (`clinicalNotes` omitted for RC)                                                           |
| PATCH  | `/patients/:id` `UpdatePatientInput`                        | all         | `PatientDetail`; RC sending `clinicalNotes` → 403                                                          |
| POST   | `/patients/:id/archive`                                     | SA CA RC    | `PatientDetail`                                                                                            |
| GET    | `/patients/:id/appointments`                                | all         | `{ upcoming: AppointmentListItem[], past: AppointmentListItem[] }`                                         |

## Doctors and availability (DOC-1, DOC-2)

| Method | Path                                                                               | Roles         | Response                                                                                                |
| ------ | ---------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| GET    | `/doctors?date&search&specialty`                                                   | all           | `DoctorCard[]` (utilisation for `date`, default today)                                                  |
| GET    | `/doctors/:id?date`                                                                | all           | `DoctorDetail`                                                                                          |
| POST   | `/doctors` `CreateDoctorInput`                                                     | SA CA         | `DoctorDetail`                                                                                          |
| PATCH  | `/doctors/:id`                                                                     | SA CA         | `DoctorDetail`                                                                                          |
| POST   | `/doctors/:id/deactivate`                                                          | SA CA         | `{ flagged: number }` (future appointments get `needsReschedule`)                                       |
| POST   | `/doctors/:id/activate`                                                            | SA CA         | `DoctorDetail`                                                                                          |
| PUT    | `/doctors/:id/working-hours` `{ intervals: WorkingInterval[], confirm?: boolean }` | SA CA DR(own) | `DoctorDetail`; 409 `HOURS_CONFLICT` `{ details: { conflicts: HoursConflict[] } }` when not confirmed   |
| POST   | `/doctors/:id/leaves` `{ startsAt, endsAt, reason? }`                              | SA CA DR(own) | `LeaveDto`                                                                                              |
| DELETE | `/doctors/:id/leaves/:leaveId`                                                     | SA CA DR(own) | `{ success: true }`                                                                                     |
| GET    | `/doctors/:id/slots?date&durationMinutes`                                          | all           | `SlotDto[]` (every grid slot, `available` false when taken, locked, in a break, a leave or in the past) |
| GET    | `/specialties`                                                                     | all           | `string[]`                                                                                              |

## Appointments (APP-1 … APP-5)

| Method | Path                                                                          | Roles        | Response                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/appointments?from&to&doctorId&specialty&status&type&search&page&limit&sort` | all          | `Paginated<AppointmentListItem>` (`status`, `type` accept comma lists)                                                                                                                                                       |
| GET    | `/appointments/calendar?from&to&doctorId`                                     | all          | `AppointmentListItem[]` (max 2000)                                                                                                                                                                                           |
| GET    | `/appointments/:id`                                                           | all          | `AppointmentDetail`                                                                                                                                                                                                          |
| POST   | `/appointments` `CreateAppointmentInput`                                      | SA CA RC     | `AppointmentDetail`; 409 `SLOT_CONFLICT` `{ details: SlotConflictDetails }`; 422 `OUTSIDE_WORKING_HOURS`                                                                                                                     |
| PATCH  | `/appointments/:id` `UpdateAppointmentInput`                                  | SA CA RC     | `AppointmentDetail` (reschedule: same conflict rules)                                                                                                                                                                        |
| PATCH  | `/appointments/:id/type` `ChangeAppointmentTypeInput`                         | SA CA RC     | `AppointmentDetail` (SCHEDULED/CONFIRMED future only, else 409 `ILLEGAL_TRANSITION` / 422; end = start + type duration unless `keepDuration`; 409 `SLOT_CONFLICT`, 422 `OUTSIDE_WORKING_HOURS`; emits `appointment.updated`) |
| POST   | `/appointments/:id/status` `{ status, reason? }`                              | all (DR own) | `AppointmentDetail`; 409 `ILLEGAL_TRANSITION`                                                                                                                                                                                |
| POST   | `/appointments/:id/cancel` `{ reason }`                                       | SA CA RC     | `AppointmentDetail`; 400 `CANCEL_REASON_REQUIRED`; 409 `CANCELLATION_POLICY` for a late cancel by RC                                                                                                                         |
| POST   | `/appointments/bulk` `{ ids, action: 'CONFIRM' \| 'CANCEL', reason? }`        | SA CA RC     | `BulkActionResult`                                                                                                                                                                                                           |
| GET    | `/appointments/:id/alternatives`                                              | all          | `AlternativeSlot[]` (≤ 3)                                                                                                                                                                                                    |
| POST   | `/appointments/locks` `{ doctorId, startsAt, durationMinutes }`               | SA CA RC     | `SlotLock` (Redis `slot:{doctor}:{start}`, TTL 300 s); 409 `SLOT_LOCKED`                                                                                                                                                     |
| DELETE | `/appointments/locks/:token`                                                  | SA CA RC     | `{ success: true }`                                                                                                                                                                                                          |
| POST   | `/appointments/reminders/:deliveryId/retry`                                   | SA CA RC     | `ReminderDto`                                                                                                                                                                                                                |

Booking runs in a SERIALIZABLE transaction; the `appointments_no_overlap` exclusion constraint is
the last line of defence (a 23P01 error maps to 409 `SLOT_CONFLICT` with alternatives).

## Appointment types

Names are `LocalizedText`; `displayName` follows `Accept-Language`, then the clinic default language.
Appointment DTOs carry `type` (code) plus `typeName` and `typeColor`.

| Method | Path                                        | Capability       | Response                                                                                                                            |
| ------ | ------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/appointment-types?includeInactive`        | viewAppointments | `AppointmentTypeDto[]` (sortOrder, code; `usageCount`)                                                                              |
| POST   | `/appointment-types` `AppointmentTypeInput` | manageSettings   | `AppointmentTypeDto`; 409 duplicate code; 422 duration (5-480, step 5), colour, name, more than 50 types                            |
| PATCH  | `/appointment-types/:id`                    | manageSettings   | `AppointmentTypeDto`; system types keep their code, EMERGENCY keeps `isEmergency`; 422 if no active non-emergency type would remain |
| DELETE | `/appointment-types/:id`                    | manageSettings   | `{ success: true }`; 409 for system or in-use types (deactivate instead)                                                            |

## Queue (QUE-1, QUE-2)

| Method | Path                                                                     | Roles | Response                                       |
| ------ | ------------------------------------------------------------------------ | ----- | ---------------------------------------------- |
| GET    | `/queue`                                                                 | all   | `QueueSnapshot` (today, clinic time zone)      |
| POST   | `/queue/check-in` `{ appointmentId, priority? }`                         | all   | `QueueEntryDto`; 409 `ALREADY_CHECKED_IN`      |
| POST   | `/queue/call-next` `{ doctorId? }`                                       | all   | `QueueEntryDto`; 404 `QUEUE_EMPTY`             |
| POST   | `/queue/:id/start`                                                       | all   | `QueueEntryDto` (appointment → IN_PROGRESS)    |
| POST   | `/queue/:id/complete`                                                    | all   | `QueueEntryDto` (appointment → COMPLETED)      |
| POST   | `/queue/:id/no-show`                                                     | all   | `QueueEntryDto`                                |
| POST   | `/queue/:id/notify-delay` `{ minutes }`                                  | all   | `QueueEntryDto` (creates a DELAY notification) |
| POST   | `/queue/:id/priority` `{ priority }`                                     | all   | `QueueEntryDto`                                |
| GET    | `/public/display/:clinicId` **public**                                   | –     | `PublicDisplay` (numbers and rooms only)       |
| POST   | `/public/check-in/:clinicId` `SelfCheckInInput` **public**, rate limited | –     | `SelfCheckInResult`; 404 `CHECK_IN_NOT_FOUND`  |

Call-next order: priority (EMERGENCY > URGENT > NORMAL), then earliest appointment time, then
earliest check-in. Concurrent callers are serialised (Redis lock or `SELECT … FOR UPDATE SKIP LOCKED`).

## Smart scheduling (SMT-1 … SMT-4)

| Method | Path                                                                | Roles       | Response                                                               |
| ------ | ------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| GET    | `/scheduling/day?date`                                              | SA CA RC DR | `SchedulingDay`                                                        |
| GET    | `/scheduling/metrics?date`                                          | SA CA RC DR | `DayMetrics` (Redis, TTL 60 s, invalidated on any appointment change)  |
| POST   | `/scheduling/optimize` `{ date, objective }`                        | SA CA RC    | `OptimizationProposal`                                                 |
| GET    | `/scheduling/proposals/:id`                                         | SA CA RC    | `OptimizationProposal`                                                 |
| POST   | `/scheduling/validate-move` `{ appointmentId, doctorId, startsAt }` | SA CA RC    | `MoveValidation`                                                       |
| POST   | `/scheduling/proposals/:id/apply`                                   | SA CA RC    | `OptimizationProposal` (state APPLIED); 409 `STALE_PROPOSAL`           |
| POST   | `/scheduling/proposals/:id/undo`                                    | SA CA RC    | `OptimizationProposal` (state UNDONE); 409 `UNDO_EXPIRED` after 15 min |

## Dashboard and analytics (ANA-1, ANA-2)

| Method | Path                                            | Roles                             | Response                                                                                                                                                                           |
| ------ | ----------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/dashboard`                                    | all                               | `DashboardDto` (cached 60 s)                                                                                                                                                       |
| GET    | `/analytics?from&to&scope=clinic\|organization` | SA CA DR (`organization` SA only) | `AnalyticsDto`                                                                                                                                                                     |
| GET    | `/analytics/export.csv?from&to&scope`           | SA CA                             | streamed `text/csv; charset=utf-8` with BOM                                                                                                                                        |
| GET    | `/analytics/export.pdf?from&to&scope`           | SA CA                             | `application/pdf`                                                                                                                                                                  |
| GET    | `/analytics/insights?from&to`                   | SA CA DR                          | `SchedulingInsights` from the Python scheduler service (default last 180 days, max 730); `503 SERVICE_UNAVAILABLE` when `SCHEDULER_URL` is unset or the service is down (ADR 0003) |

## Notifications and reminders (RT-3, APP-5)

| Method | Path                                          | Roles | Response            |
| ------ | --------------------------------------------- | ----- | ------------------- |
| GET    | `/notifications?category&unread&cursor&limit` | all   | `NotificationPage`  |
| GET    | `/notifications/unread-count`                 | all   | `{ count }`         |
| POST   | `/notifications/:id/read`                     | all   | `{ success: true }` |
| POST   | `/notifications/read-all`                     | all   | `{ updated }`       |
| GET    | `/notifications/delivery-stats`               | all   | `DeliveryStats`     |

## Settings and audit (SET-1, AUTH-3)

| Method | Path                                         | Roles | Response                                                           |
| ------ | -------------------------------------------- | ----- | ------------------------------------------------------------------ |
| GET    | `/settings`                                  | SA CA | `ClinicSettingsDto`                                                |
| PUT    | `/settings` `UpdateSettingsInput`            | SA CA | `ClinicSettingsDto` (audited, cache cleared)                       |
| GET    | `/settings/roles`                            | SA CA | `RoleSummary[]`                                                    |
| GET    | `/audit?entity&actorId&from&to&cursor&limit` | SA CA | `CursorPage<AuditDto>` (read only — no update/delete routes exist) |

## Chat (RT-2)

| Method | Path                                               | Roles   | Response                                         |
| ------ | -------------------------------------------------- | ------- | ------------------------------------------------ |
| GET    | `/chat/conversations`                              | all     | `ConversationDto[]`                              |
| POST   | `/chat/conversations` `{ memberIds, title? }`      | all     | `ConversationDto`                                |
| GET    | `/chat/conversations/:id/messages?before&limit=30` | members | `CursorPage<ChatMessageDto>` (newest first)      |
| POST   | `/chat/conversations/:id/messages` `{ body }`      | members | `ChatMessageDto` (persisted before the response) |
| POST   | `/chat/conversations/:id/read`                     | members | `{ success: true }`                              |
| GET    | `/chat/staff`                                      | all     | `PersonRef[]` (members of the active clinic)     |

## AI assistants, documents and summaries (ADR 0005)

Without `ANTHROPIC_API_KEY` every route below except the two `status` routes answers `503 AI_UNAVAILABLE`.
Chat streams `text/event-stream`: `conversation`, `text` `{delta}`, `tool` `{name,status}`, `proposal`, `done` `{stopReason,inputTokens,outputTokens}`, `error` `{code,message}`.
Limits: 20 chat requests/min per user (`429 RATE_LIMITED`), daily token budget per clinic (`429 AI_BUDGET_EXCEEDED`), message at most 4000 characters, conversation at most 60 messages (`422 CONVERSATION_TOO_LONG`).

| Method | Path                                                                              | Roles / capability   | Response                                                                              |
| ------ | --------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/assistant/status`                                                               | `viewOverview`       | `AssistantStatus`                                                                     |
| POST   | `/assistant/chat` `AssistantChatInput`                                            | `viewOverview`       | SSE `AssistantStreamEvent`                                                            |
| GET    | `/assistant/conversations`                                                        | `viewOverview`       | `AssistantConversationSummary[]` (last 20, 30 days)                                   |
| GET    | `/assistant/conversations/:id`                                                    | `viewOverview`       | `{ id, persona, title, updatedAt, messages: { role, text, proposals[] }[] }`          |
| DELETE | `/assistant/conversations/:id`                                                    | `viewOverview`       | `{ success: true }`                                                                   |
| GET    | `/portal/assistant/status`                                                        | patient              | `AssistantStatus` (`CONSENT_REQUIRED` without AI consent)                             |
| POST   | `/portal/assistant/chat` `{ message, conversationId? }`                           | patient (AI consent) | SSE `AssistantStreamEvent` (`403 CONSENT_REQUIRED` before the stream)                 |
| GET    | `/portal/assistant/conversations[/:id]`                                           | patient              | as the staff routes                                                                   |
| DELETE | `/portal/assistant/conversations/:id`                                             | patient              | `{ success: true }`                                                                   |
| POST   | `/patients/:id/documents` (multipart `file`)                                      | `readClinicalNotes`  | `PatientDocumentDto`; `422 DOCUMENT_INVALID`, `409 DUPLICATE_DOCUMENT` `{documentId}` |
| GET    | `/patients/:id/documents`                                                         | `readClinicalNotes`  | `PatientDocumentDto[]`                                                                |
| GET    | `/patients/:id/documents/:docId`                                                  | `readClinicalNotes`  | `PatientDocumentDetail`                                                               |
| GET    | `/patients/:id/documents/:docId/file`                                             | `readClinicalNotes`  | file bytes (`Content-Disposition: attachment`, `nosniff`)                             |
| DELETE | `/patients/:id/documents/:docId`                                                  | `readClinicalNotes`  | `{ success: true }`                                                                   |
| POST   | `/patients/:id/documents/:docId/review`                                           | `readClinicalNotes`  | `PatientDocumentDetail` (sets `reviewedAt`)                                           |
| POST   | `/patients/:id/documents/:docId/process`                                          | `readClinicalNotes`  | `PatientDocumentDetail` (extraction runs again)                                       |
| POST   | `/portal/documents` (multipart `file`)                                            | patient              | `PatientDocumentDto` (`uploadedBy: PATIENT`, no summary yet)                          |
| GET    | `/portal/documents`                                                               | patient              | `PatientDocumentDto[]` own uploads and reviewed documents; no `extractedText`         |
| POST   | `/patients/:id/summary/draft`                                                     | `readClinicalNotes`  | `SummaryDraft`                                                                        |
| POST   | `/patients/:id/summaries` `SaveSummaryInput`                                      | `readClinicalNotes`  | `PatientSummaryDto` (`visibleToPatient` sets `publishedAt`; needs `patientContent`)   |
| GET    | `/patients/:id/summaries`                                                         | `readClinicalNotes`  | `PatientSummaryDto[]`                                                                 |
| PATCH  | `/patients/:id/summaries/:sid` `{ visibleToPatient?, content?, patientContent? }` | `readClinicalNotes`  | `PatientSummaryDto` (publish / unpublish)                                             |

## Domain events

After a successful commit the API publishes to Redis channel `riaya:events` (contract in
`packages/shared/src/schemas/realtime.ts`): `appointment.created`, `.cancelled`, `.rescheduled`,
`queue.updated`. The realtime service relays them to the clinic room. When Redis or the realtime
service is absent (hosted demo), the backoffice falls back to polling.

## Patient portal (ADR 0005)

Patient tokens (`aud: riaya-portal`) only; every route is scoped to the token's patient.

| Method      | Path                                                 | Auth                           | Response                                                                                                                        |
| ----------- | ---------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| GET         | `/portal/clinics`                                    | public                         | `PortalClinic[]` (portal-enabled clinics)                                                                                       |
| POST        | `/portal/auth/register`                              | public, 5/min/IP               | `PortalAuthResponse` + `portal_refresh` cookie; new record `source=PORTAL`, unverified; 409 `ACCOUNT_EXISTS`                    |
| POST        | `/portal/auth/accept-invite`                         | public                         | `PortalAuthResponse`; needs token (URL fragment) + matching `dateOfBirth`; account verified                                     |
| POST        | `/portal/auth/login`                                 | public, 10/min/IP              | `PortalAuthResponse`; 401 `INVALID_CREDENTIALS` / `ACCOUNT_LOCKED`                                                              |
| POST        | `/portal/auth/refresh`, `/portal/auth/logout`        | cookie                         | rotation with family revocation                                                                                                 |
| GET / PATCH | `/portal/me`                                         | patient                        | `PortalMe` (`verified`, `clinicTimezone`) / `PortalProfileInput`                                                                |
| GET         | `/portal/doctors`, `/portal/appointment-types`       | patient                        | `PortalDoctor[]`, `PortalAppointmentType[]` (non-emergency)                                                                     |
| GET         | `/portal/slots?doctorId&date&durationMinutes`        | patient                        | `PortalSlot[]` (future, free)                                                                                                   |
| GET         | `/portal/appointments?scope=upcoming\|past`          | patient                        | `PortalAppointment[]`                                                                                                           |
| POST        | `/portal/appointments`                               | patient                        | booking through the staff transaction, `source=PORTAL`; max 3 upcoming (1 if unverified); 409 `SLOT_CONFLICT` with alternatives |
| POST        | `/portal/appointments/:id/cancel`, `/:id/reschedule` | patient                        | within the clinic cancellation notice                                                                                           |
| GET         | `/portal/summary`                                    | patient                        | `PortalSummary \| null` (published patient version only)                                                                        |
| GET / POST  | `/portal/documents`                                  | patient, verified              | own documents (patient-facing fields) / upload (5/min, 20 docs, 50 MB per 24 h)                                                 |
| GET / POST  | `/portal/assistant/status`, `/portal/assistant/chat` | patient, verified + AI consent | `AssistantStatus` / SSE stream                                                                                                  |

Staff routes for the portal:

| Method | Path                          | Capability         | Response                                                                 |
| ------ | ----------------------------- | ------------------ | ------------------------------------------------------------------------ |
| POST   | `/patients/:id/portal-invite` | manageAppointments | `PortalInvite` (7-day one-time link, `#token=`; earlier invites revoked) |
| GET    | `/patients/:id/portal-status` | manageAppointments | `PatientPortalStatus`                                                    |
| POST   | `/patients/:id/portal-verify` | manageAppointments | marks the identity verified at the desk                                  |
