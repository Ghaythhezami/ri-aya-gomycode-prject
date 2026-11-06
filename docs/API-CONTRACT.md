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

| Method | Path | Roles | Response |
| --- | --- | --- | --- |
| GET | `/clinic/reference` | all | `ClinicReference` (cached 60 s) |
| GET | `/rooms` | all | `RoomDto[]` |
| POST | `/rooms` `{ name, kind? }` | SA CA | `RoomDto` |

## Patients (PAT-1, PAT-2)

| Method | Path | Roles | Response |
| --- | --- | --- | --- |
| GET | `/patients?search&status&gender&page&limit&sort` | all | `Paginated<PatientListItem>`; `search` matches name, code, phone; archived hidden unless `status=ARCHIVED` |
| GET | `/patients/duplicates?firstName&lastName&dateOfBirth&phone` | all | `DuplicateCheckResult` |
| POST | `/patients` `CreatePatientInput` | SA CA RC DR | `PatientDetail`; 409 `DUPLICATE_PATIENT` `{ details: { matches } }` unless `force` |
| GET | `/patients/:id` | all | `PatientDetail` (`clinicalNotes` omitted for RC) |
| PATCH | `/patients/:id` `UpdatePatientInput` | all | `PatientDetail`; RC sending `clinicalNotes` → 403 |
| POST | `/patients/:id/archive` | SA CA RC | `PatientDetail` |
| GET | `/patients/:id/appointments` | all | `{ upcoming: AppointmentListItem[], past: AppointmentListItem[] }` |

## Doctors and availability (DOC-1, DOC-2)

| Method | Path | Roles | Response |
| --- | --- | --- | --- |
| GET | `/doctors?date&search&specialty` | all | `DoctorCard[]` (utilisation for `date`, default today) |
| GET | `/doctors/:id?date` | all | `DoctorDetail` |
| POST | `/doctors` `CreateDoctorInput` | SA CA | `DoctorDetail` |
| PATCH | `/doctors/:id` | SA CA | `DoctorDetail` |
| POST | `/doctors/:id/deactivate` | SA CA | `{ flagged: number }` (future appointments get `needsReschedule`) |
| POST | `/doctors/:id/activate` | SA CA | `DoctorDetail` |
| PUT | `/doctors/:id/working-hours` `{ intervals: WorkingInterval[], confirm?: boolean }` | SA CA DR(own) | `DoctorDetail`; 409 `HOURS_CONFLICT` `{ details: { conflicts: HoursConflict[] } }` when not confirmed |
| POST | `/doctors/:id/leaves` `{ startsAt, endsAt, reason? }` | SA CA DR(own) | `LeaveDto` |
| DELETE | `/doctors/:id/leaves/:leaveId` | SA CA DR(own) | `{ success: true }` |
| GET | `/doctors/:id/slots?date&durationMinutes` | all | `SlotDto[]` (every grid slot, `available` false when taken, locked, in a break, a leave or in the past) |
| GET | `/specialties` | all | `string[]` |

## Appointments (APP-1 … APP-5)

| Method | Path | Roles | Response |
| --- | --- | --- | --- |
| GET | `/appointments?from&to&doctorId&specialty&status&type&search&page&limit&sort` | all | `Paginated<AppointmentListItem>` (`status`, `type` accept comma lists) |
| GET | `/appointments/calendar?from&to&doctorId` | all | `AppointmentListItem[]` (max 2000) |
| GET | `/appointments/:id` | all | `AppointmentDetail` |
| POST | `/appointments` `CreateAppointmentInput` | SA CA RC | `AppointmentDetail`; 409 `SLOT_CONFLICT` `{ details: SlotConflictDetails }`; 422 `OUTSIDE_WORKING_HOURS` |
| PATCH | `/appointments/:id` `UpdateAppointmentInput` | SA CA RC | `AppointmentDetail` (reschedule: same conflict rules) |
| POST | `/appointments/:id/status` `{ status, reason? }` | all (DR own) | `AppointmentDetail`; 409 `ILLEGAL_TRANSITION` |
| POST | `/appointments/:id/cancel` `{ reason }` | SA CA RC | `AppointmentDetail`; 400 `CANCEL_REASON_REQUIRED`; 409 `CANCELLATION_POLICY` for a late cancel by RC |
| POST | `/appointments/bulk` `{ ids, action: 'CONFIRM' \| 'CANCEL', reason? }` | SA CA RC | `BulkActionResult` |
| GET | `/appointments/:id/alternatives` | all | `AlternativeSlot[]` (≤ 3) |
| POST | `/appointments/locks` `{ doctorId, startsAt, durationMinutes }` | SA CA RC | `SlotLock` (Redis `slot:{doctor}:{start}`, TTL 300 s); 409 `SLOT_LOCKED` |
| DELETE | `/appointments/locks/:token` | SA CA RC | `{ success: true }` |
| POST | `/appointments/reminders/:deliveryId/retry` | SA CA RC | `ReminderDto` |

Booking runs in a SERIALIZABLE transaction; the `appointments_no_overlap` exclusion constraint is
the last line of defence (a 23P01 error maps to 409 `SLOT_CONFLICT` with alternatives).

## Queue (QUE-1, QUE-2)

| Method | Path | Roles | Response |
| --- | --- | --- | --- |
| GET | `/queue` | all | `QueueSnapshot` (today, clinic time zone) |
| POST | `/queue/check-in` `{ appointmentId, priority? }` | all | `QueueEntryDto`; 409 `ALREADY_CHECKED_IN` |
| POST | `/queue/call-next` `{ doctorId? }` | all | `QueueEntryDto`; 404 `QUEUE_EMPTY` |
| POST | `/queue/:id/start` | all | `QueueEntryDto` (appointment → IN_PROGRESS) |
| POST | `/queue/:id/complete` | all | `QueueEntryDto` (appointment → COMPLETED) |
| POST | `/queue/:id/no-show` | all | `QueueEntryDto` |
| POST | `/queue/:id/notify-delay` `{ minutes }` | all | `QueueEntryDto` (creates a DELAY notification) |
| POST | `/queue/:id/priority` `{ priority }` | all | `QueueEntryDto` |
| GET | `/public/display/:clinicId` **public** | – | `PublicDisplay` (numbers and rooms only) |
| POST | `/public/check-in/:clinicId` `SelfCheckInInput` **public**, rate limited | – | `SelfCheckInResult`; 404 `CHECK_IN_NOT_FOUND` |

Call-next order: priority (EMERGENCY > URGENT > NORMAL), then earliest appointment time, then
earliest check-in. Concurrent callers are serialised (Redis lock or `SELECT … FOR UPDATE SKIP LOCKED`).

## Smart scheduling (SMT-1 … SMT-4)

| Method | Path | Roles | Response |
| --- | --- | --- | --- |
| GET | `/scheduling/day?date` | SA CA RC DR | `SchedulingDay` |
| GET | `/scheduling/metrics?date` | SA CA RC DR | `DayMetrics` (Redis, TTL 60 s, invalidated on any appointment change) |
| POST | `/scheduling/optimize` `{ date, objective }` | SA CA RC | `OptimizationProposal` |
| GET | `/scheduling/proposals/:id` | SA CA RC | `OptimizationProposal` |
| POST | `/scheduling/validate-move` `{ appointmentId, doctorId, startsAt }` | SA CA RC | `MoveValidation` |
| POST | `/scheduling/proposals/:id/apply` | SA CA RC | `OptimizationProposal` (state APPLIED); 409 `STALE_PROPOSAL` |
| POST | `/scheduling/proposals/:id/undo` | SA CA RC | `OptimizationProposal` (state UNDONE); 409 `UNDO_EXPIRED` after 15 min |

## Dashboard and analytics (ANA-1, ANA-2)

| Method | Path | Roles | Response |
| --- | --- | --- | --- |
| GET | `/dashboard` | all | `DashboardDto` (cached 60 s) |
| GET | `/analytics?from&to&scope=clinic\|organization` | SA CA DR (`organization` SA only) | `AnalyticsDto` |
| GET | `/analytics/export.csv?from&to&scope` | SA CA | streamed `text/csv; charset=utf-8` with BOM |
| GET | `/analytics/export.pdf?from&to&scope` | SA CA | `application/pdf` |

## Notifications and reminders (RT-3, APP-5)

| Method | Path | Roles | Response |
| --- | --- | --- | --- |
| GET | `/notifications?category&unread&cursor&limit` | all | `NotificationPage` |
| GET | `/notifications/unread-count` | all | `{ count }` |
| POST | `/notifications/:id/read` | all | `{ success: true }` |
| POST | `/notifications/read-all` | all | `{ updated }` |
| GET | `/notifications/delivery-stats` | all | `DeliveryStats` |

## Settings and audit (SET-1, AUTH-3)

| Method | Path | Roles | Response |
| --- | --- | --- | --- |
| GET | `/settings` | SA CA | `ClinicSettingsDto` |
| PUT | `/settings` `UpdateSettingsInput` | SA CA | `ClinicSettingsDto` (audited, cache cleared) |
| GET | `/settings/roles` | SA CA | `RoleSummary[]` |
| GET | `/audit?entity&actorId&from&to&cursor&limit` | SA CA | `CursorPage<AuditDto>` (read only — no update/delete routes exist) |

## Chat (RT-2)

| Method | Path | Roles | Response |
| --- | --- | --- | --- |
| GET | `/chat/conversations` | all | `ConversationDto[]` |
| POST | `/chat/conversations` `{ memberIds, title? }` | all | `ConversationDto` |
| GET | `/chat/conversations/:id/messages?before&limit=30` | members | `CursorPage<ChatMessageDto>` (newest first) |
| POST | `/chat/conversations/:id/messages` `{ body }` | members | `ChatMessageDto` (persisted before the response) |
| POST | `/chat/conversations/:id/read` | members | `{ success: true }` |
| GET | `/chat/staff` | all | `PersonRef[]` (members of the active clinic) |

## Domain events

After a successful commit the API publishes to Redis channel `riaya:events` (contract in
`packages/shared/src/schemas/realtime.ts`): `appointment.created`, `.cancelled`, `.rescheduled`,
`queue.updated`. The realtime service relays them to the clinic room. When Redis or the realtime
service is absent (hosted demo), the backoffice falls back to polling.
