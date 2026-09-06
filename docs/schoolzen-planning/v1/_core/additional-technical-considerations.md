# Schoolzen — Additional Technical Considerations

Status: **FINAL** — v1

Cross-cutting concerns beyond the module pages and error-handling
architecture — things Claude Code should account for while
implementing, even though most don't have their own UI page. Backup/
disaster-recovery is deliberately out of scope here (addressed
separately later). File storage (photos/documents) already runs on
Cloudinary — noted below for completeness, not redesigned.

---

## File storage — Cloudinary (existing, no change)

Student/Staff photos already upload to Cloudinary. As more document
types get added (Admission's ID proofs, Staff documents, Certificate
PDFs), the same Cloudinary account handles them — organize by a
folder-per-school convention (`schoolzen/{schoolId}/students/...`,
`.../certificates/...`) so a school's assets stay logically grouped
and a bulk-delete (e.g. if a school account is closed) is one folder
operation, not a scan across a flat namespace.

## Notifications system

Fee Reminder is currently the only designed notification (WhatsApp).
As the app grows, other events need notifying too: a Leave Request
awaiting approval, a Payroll run ready to review, a new Admission
submitted. Rather than building bespoke send-logic per event:
- One **Notification** collection/service, category-tagged the same
  way errors are (an event has a `type`, a `module`, a `recipient`,
  a `channel`) — a single dispatch service that knows how to send via
  WhatsApp, Email, SMS, or in-app, so a new module wanting to notify
  someone calls the same service rather than integrating a provider
  itself.
- An in-app notification bell (header, next to the profile dropdown)
  for anything not urgent enough to be a push/SMS — most staff-facing
  events (a leave was approved, a payroll run finished generating)
  belong here first; SMS/WhatsApp reserved for parent-facing or
  time-sensitive events (fee reminders, an emergency school closure).

## Multi-language / i18n

Not designed into any page's HTML yet — every label in this package is
hardcoded English text. Before scaling beyond English-medium schools,
route all UI strings through Angular's i18n (`@angular/localize`) or a
translation service (`ngx-translate`) rather than hardcoding — retrofit
is far more expensive than building it in from the start of
implementation. Hindi is the obvious first additional language given
the target market.

## Print CSS — browser print vs. generated PDF

Every printable document in this package (Admission Letter, Fee
Receipt, Admit Card, Marksheet, Transfer Certificate) is currently
designed as an in-app modal with a "Print" button, implying the
browser's native print dialog (`window.print()` with a `@media print`
stylesheet hiding everything except the document). This works but
gives inconsistent output across browsers/printer settings. For
documents that must look identical every time regardless of the
parent's browser (Marksheet, TC — anything that becomes an official
record), consider generating a server-side PDF (e.g. `puppeteer` or
`pdfkit`) from the same HTML template instead, and offer both "Print"
(quick, in-browser) and "Download PDF" (canonical, consistent).

## File upload handling

Beyond photos (Cloudinary), the app accepts CSV (Bulk Assign Cards),
Excel (Student Import/Export), and will likely need document uploads
(ID proofs, signed forms). Standardize on one upload component/
service app-wide — file-type validation, a max-size limit, and a
consistent progress/error UI — rather than each module's upload button
being a one-off `<input type="file">` with its own ad-hoc handling.

## Pagination

List pages in this package show demo rows without addressing what
happens past a few hundred/thousand records (Manage Students at
scale, AttendanceRecord, FeePayment history). Use cursor-based
pagination (per `database-architecture`'s indexing notes, if that
document is available) — a shared `<app-paginator>` component so every
module's table paginates identically, rather than each list page
inventing its own "load more" or page-number UI.

## Loading states — skeletons, not spinners alone

Every page in this package shows fully-populated demo data with no
loading state designed. A shared skeleton-row component (grey
placeholder bars matching each table's actual column shapes) gives a
much better perceived-performance feel than a single centered spinner,
especially on slower connections — worth building once as a shared
component alongside `<app-data-table>`.

## Background job queue

Several actions in this package are described as instant but are
actually slow/bulk operations that should NOT block the HTTP request:
Excel Import (validating + writing hundreds of rows), Bulk Assign
Cards, WhatsApp Fee Reminder sends, PDF generation for Bulk Print
(Marksheet/Admit Card/TC), and Payroll's "Generate for selected" when
selecting many staff at once. Use a job queue (`bullmq` on Redis is
the standard Node choice) — the API responds immediately with "started,
check back," and the UI polls or gets a WebSocket/SSE push when done,
rather than a request hanging for tens of seconds or timing out at
scale.

## Rate limiting / API throttling

Referenced in the error-handling architecture (`RateLimitError`
exists) but the actual limiting logic isn't specified. Use
`express-rate-limit` (with a Redis store for multi-instance
deployments, since scaling to millions of users means more than one
API server) — apply stricter limits to auth endpoints (login attempts)
and bulk-action endpoints (WhatsApp sends, Excel import) than to
ordinary reads.

## Environment configuration

Not addressed anywhere in this package. Standard practice: environment
variables (`dotenv` locally, real env vars in production) for every
secret and environment-specific value (Mongo connection string,
Cloudinary keys, Sentry DSN, WhatsApp provider credentials) — never
hardcoded or committed. Maintain separate configs for
development/staging/production, with staging mirroring production
closely enough to catch issues before they reach real schools.

## Health-check endpoint

A simple `GET /health` route (checks Mongo connectivity, returns 200/
503) is table-stakes for any production deployment — load balancers,
uptime monitors, and container orchestrators (if deployed on
Kubernetes/ECS) all need this to know whether an instance is alive
and should keep receiving traffic.

## Caching layer (Redis)

Beyond the job queue and rate-limiter's use of Redis, cache slow-
changing, frequently-read data — Academic Setup's Class/Section/
Stream list, FieldConfig, active AcademicSession — rather than
querying Mongo on every request that needs them (nearly every page,
via its filter dropdowns). Invalidate the cache on write (a Class
edit, a session activation) rather than using a blind TTL, so users
never see stale config after making a change.

## Search at scale

MongoDB's text index (used for Student/Staff name search) is adequate
at moderate scale. If Student search noticeably slows down as the
platform grows toward its ~2M-student target, prefer **MongoDB Atlas
Search** over Elasticsearch — it runs inside the same Atlas cluster
with no separate server/infra to provision or pay for, unlike
Elasticsearch which requires its own hosted cluster and adds real
infra cost. Only consider Elasticsearch if Atlas Search genuinely
can't meet a specific need Atlas doesn't support — don't reach for it
by default.
