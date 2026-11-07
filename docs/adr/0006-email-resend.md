# ADR 0006 — Transactional e-mail with Resend

Status: accepted (2026-11-07)

## Decision

Outgoing e-mail goes through one `MailService` interface (`server/src/mail/mail.service.ts`)
with two transports chosen at start-up (`createMailService`, `server/src/mail/mail.module.ts`):

- `ResendMailService` when `RESEND_API_KEY` is set — HTTPS `POST https://api.resend.com/emails`,
  10 s timeout, `MAIL_FROM` sender (default `RI'AYA <onboarding@resend.dev>`), a `category` tag
  per message type, and an idempotency key for appointment e-mails (same appointment, kind and
  time is sent once even if a job retries).
- `ConsoleMailService` otherwise (local development, tests): logs instead of sending.

## Messages

| Message                                              | Trigger                                                                   | Recipient rule                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Staff password reset                                 | `POST /api/auth/forgot-password`                                          | active user; generic response either way, mail errors swallowed                                           |
| Staff invitation                                     | `POST /api/tenancy/invite`                                                | invited address; response carries `emailSent`                                                             |
| Portal password reset                                | `POST /api/portal/auth/forgot-password`                                   | patient account of that clinic; generic response                                                          |
| Appointment confirmation / cancellation / reschedule | domain events `appointment.created / cancelled / rescheduled`             | patient has an e-mail, `contactPreference = EMAIL`, and (self-registered) the clinic verified the contact |
| Appointment reminder                                 | reminder deliveries on the `EMAIL` channel (daily cron + interval runner) | same as above; failure recorded on the delivery row                                                       |

Templates (`server/src/mail/templates.ts`) are code, in English, French and Arabic (right to
left), with an HTML and a plain-text part. Every interpolated value is HTML-escaped and only
`http(s)` links become buttons. Times are formatted in the clinic time zone and the recipient's
language (portal account language, else the clinic default).

## Safety

- **Reserved domains are never mailed** (`isDeliverable`): `.local`, `.test`, `.example`,
  `.invalid`, `.localhost`, `example.com/.net/.org`. The fictional demo data uses only these, so
  the demo cannot mail a made-up person.
- Logs hold message type, status and ids — never the recipient address or the link.
- Password-reset tokens are stored hashed; the portal link carries the token in the URL fragment.
- SMS stays on the mock gateway until an SMS provider is chosen.

## Consequences

- With the default sender, Resend only delivers to the Resend account owner's own address. A
  real deployment verifies a sending domain in Resend and sets `MAIL_FROM`.
- Domain events run after commit; a mail failure never rolls back or fails a booking.
