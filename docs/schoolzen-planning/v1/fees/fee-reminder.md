# Fees — Fee Reminder

Status: **FINAL**
Reference: `fee-reminder.html`

Saved filters that resolve to a LIVE student list on demand, reviewed before every send — never a stored, static recipient list.

---

## Frontend

**Table**: Class, Payment Below (%, or "No filter"), No Payment Since (days), Gap Since Last Reminder (days), Send ("To Send" WhatsApp-icon button — re-runs the filter fresh), Remove.

**Create Filter modal**: Class (required) + Paid Below % (optional, blank = no threshold) + No Payment Since days + Gap Since Last Reminder days (avoids re-pinging someone reminded very recently).

**Review & Send modal**: opened by "To Send" — shows the LIVE list matching the filter right now (checkbox-selectable, so specific people can be excluded from this particular send), each with mobile/paid%/due/total, before actually dispatching.

**Delete**: removes only the saved filter definition — no reminders sent or student data affected (per the side panel's own tip, this is a lightweight delete, not the type-to-confirm heavy pattern).

## Backend

Schema — `FeeReminderFilter`: `adminId`, `classId`, `paidBelowPercent` (nullable), `noPaymentSinceDays` (nullable), `gapSinceLastReminderDays`. No stored recipient list — `GET /:id/preview` re-runs the filter against current `StudentFeeRecord` data every time. `POST /:id/send` **enqueues a BullMQ job** (never sends synchronously inside the request — a filter can resolve to hundreds of recipients, and `additional-technical-considerations.md`'s job-queue list names WhatsApp Fee Reminder sends explicitly) which dispatches through the shared `services/whatsapp/` service per-recipient and records each student's `lastReminderSentAt` timestamp in a batched `bulkWrite` after the send completes, not one write per message. The confirmed-recipient list from the Review & Send modal is passed into the job as its input, not re-resolved inside the worker (what the admin reviewed is exactly who gets messaged).
