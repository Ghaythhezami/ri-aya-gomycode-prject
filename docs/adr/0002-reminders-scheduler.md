# ADR 0002: DB-backed reminder scheduler instead of BullMQ

Status: accepted.

## Context

The brief prefers BullMQ for reminders. The hosted demo runs serverless (Vercel), where no
long-lived worker process exists, and adding a queue dependency was out of scope.

## Decision

Reminders are rows in `reminder_deliveries` (unique appointment + channel + offset) with a
`scheduledFor` time. `ReminderProcessor.processDue(now, limit)` claims PENDING rows that are due
(optimistic `attempts` increment, so two instances never send the same row), sends through a
`ReminderProvider` (mock in the demo) and records SENT or FAILED. It runs every 30 s via
`setInterval` on a long-lived server, via Vercel Cron on `/api/notifications/reminders/process`
(secret from `CRON_SECRET`), and lazily on `GET /notifications/delivery-stats`.

## Consequences

No new infrastructure and idempotent under retries. Latency is bounded by the cron period
(1 minute on Vercel). Moving to BullMQ later only replaces the trigger; the processor and provider
interface stay.
