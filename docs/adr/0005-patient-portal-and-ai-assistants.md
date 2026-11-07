# ADR 0005 — Patient portal, AI assistants (Claude API) and clinical documents

Status: accepted (2026-11-07)

## 1. Patient portal

Patients get their own identity, separate from staff users, so staff RBAC and tenancy code
never sees a patient principal.

- `patient_accounts` (one per patient record, email unique per clinic), refresh tokens with
  rotation and family revocation (`patient_refresh_tokens`), one-time invite links
  (`patient_invites`). Schema: migration `20261107180000_portal_ai_documents`.
- Access token: HS256 with `JWT_ACCESS_SECRET`, `aud: "riaya-portal"`, `typ: "patient"`,
  `sub` = account id, `clinic_id`, `patient_id`, 15 min. The staff strategy rejects any
  token with `aud` = `riaya-portal`; the portal guard accepts only that audience. Refresh
  token: httpOnly cookie `portal_refresh` on path `/api/portal/auth`, 30 days.
- `PortalJwtGuard` (`server/src/portal/auth/portal-jwt.guard.ts`) sets
  `request.patient = { accountId, patientId, clinicId, locale }` and `PatientContext`
  (AsyncLocalStorage) — every portal query is scoped by both `clinicId` and `patientId`
  from the token, never from the body.
- How a patient gets an account:
  1. **Self-registration from the landing page** ("Create your patient account"):
     choose clinic (`GET /api/portal/clinics`, clinics with portal + self-registration on),
     names in EN/FR/AR, birth date, phone, email, password, privacy consent, optional AI
     consent → a **new** patient record (`source = PORTAL`). If phone + birth date match an
     existing record, the new record gets `possibleDuplicateOfId` for staff to merge — it is
     never linked automatically (no account takeover by someone who knows a birth date).
  2. **Invite from the desk**: staff open the patient profile → "Invite to portal" → a
     7-day one-time link + QR code attaches an account to the existing record.
- Onboarding (portal): profile and language, contact preferences, AI consent, first booking.
- Self-service: book (non-emergency active types only, same SERIALIZABLE booking
  transaction, slot lock and exclusion constraint as staff booking, `source = PORTAL`),
  cancel / reschedule within the clinic's cancellation notice, upload documents (reviewed
  by the doctor), read clinician-published summaries.
- Auth hardening: lockout after 5 failures (shared security-state store, own key prefix),
  rate limits on register/login/refresh, password policy as staff, generic errors (no
  account enumeration).

Routes: `/api/portal/clinics`, `/api/portal/auth/{register,login,refresh,logout,accept-invite}`,
`/api/portal/me`, `/api/portal/doctors`, `/api/portal/slots`, `/api/portal/appointments`
(+ `/:id/cancel`, `/:id/reschedule`), `/api/portal/documents`, `/api/portal/summary`;
staff: `POST /api/patients/:id/portal-invite`.

## 2. AI assistants

One `AiModule` (`server/src/ai/`) on the Anthropic TypeScript SDK (`@anthropic-ai/sdk`),
three personas:

| Persona   | Who                                           | Tools (read)                                                                                                                                                                   | Proposals (need a human click)                                    |
| --------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `staff`   | receptionist, clinic admin                    | schedule by day/doctor, find slots, search patients (no clinical notes), alerts (unread notifications, conflicts, no-show risk from insights), queue status, optimiser preview | book, reschedule, cancel, check-in                                |
| `doctor`  | doctors (and admins with `readClinicalNotes`) | own schedule, patient overview incl. clinical notes, documents and their extractions, appointment history                                                                      | save clinical summary, publish patient summary, add clinical note |
| `patient` | portal patients with AI consent               | own appointments, clinic doctors and hours, slots, published summaries, own documents' patient-facing summaries                                                                | book, reschedule, cancel own appointment                          |

- **Tools mirror RBAC:** each tool declares the capability it needs; the tool list sent to
  the model is filtered by the caller's effective capabilities, and every tool re-checks on
  execution with the caller's tenant scope. A tool can never return another clinic's or
  another patient's data.
- **Writes are proposals:** the model never changes data. A proposal tool returns a
  `proposal` (action, parameters, human-readable preview); the UI shows a confirmation card
  and the **normal REST endpoint** performs the change with the user's own token
  (`source = ASSISTANT`), so booking safety, audit and RBAC are exactly the same.
- **Model:** `claude-opus-5-5` (env `ANTHROPIC_MODEL`), adaptive thinking (default on this
  model), `output_config.effort` per route (`low` for chat personas, `medium` for document
  extraction and clinical summaries), server-side refusal fallback
  (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`), `stop_reason` checked
  before reading content.
- **Transport:** `POST /api/assistant/chat` (staff token) and
  `POST /api/portal/assistant/chat` (patient token) stream Server-Sent Events:
  `conversation`, `text` (delta), `tool` (name + status, no raw data), `proposal`,
  `done` (usage), `error` (code). Manual streaming tool loop with `eager_input_streaming`,
  zod validation of every tool input, max 8 tool rounds, parallel tool calls answered in one
  user message.
- **Prompt caching:** frozen system prompt per persona + deterministic tool list with
  `cache_control`; volatile context (date, clinic name, user name) after the breakpoint.
- **Conversations** in `ai_conversations` (content blocks replayed append-only), last 30
  days, per actor. Usage tokens recorded per conversation.
- **Safety:** persona prompts forbid diagnosis and prescriptions, direct emergencies to the
  emergency number and the clinic, answer only from tool data, say when unsure; tool and
  document text is wrapped as untrusted data (prompt-injection defence); patients need
  `aiConsentAt`; clinic switch `aiAssistantsEnabled`; per-user rate limit (Redis) and a daily
  token budget per clinic; audit rows for every proposal confirmed; logs hold ids and
  counts only. Without `ANTHROPIC_API_KEY` every AI route answers `503 AI_UNAVAILABLE`
  and the UI hides the assistant.

## 3. Clinical documents (OCR / PDF)

- Upload PDF, JPEG or PNG (≤ 10 MB, type checked by magic bytes, not the extension) to
  `POST /api/patients/:id/documents` (staff with `readClinicalNotes`) or
  `POST /api/portal/documents` (patient; marked for review). Stored in PostgreSQL
  (`patient_documents.content`, bytea) with SHA-256 de-duplication per patient — adequate
  for the demo volume; object storage (Vercel Blob / S3) is the production swap behind the
  same repository interface.
- Processing runs after the upload returns (status `PENDING → PROCESSING → READY|FAILED`):
  the file goes to Claude as a `document` block (PDF) or `image` block (photos/scans) with a
  structured-output schema: category, document date, OCR text, findings, values with units
  and reference ranges, medications, a clinician summary and a plain-language summary.
- Doctors read documents, extracted values and summaries in the patient profile; the doctor
  assistant uses them as tool data. `POST /api/patients/:id/summary` drafts a patient
  summary from appointments, notes and documents; the doctor edits and saves it
  (`patient_summaries`) and may publish the plain-language version to the portal.

## Consequences

- Patient data (fictional in this demo) is sent to the Claude API for the AI features; a
  real deployment needs a data-processing agreement and the clinic's consent policy.
- Every AI write path reuses an existing, tested REST endpoint, so the assistant adds no new
  way to change data.
