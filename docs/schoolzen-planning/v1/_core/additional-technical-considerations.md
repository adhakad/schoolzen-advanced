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
folder-per-school convention (`schoolzen/{adminId}/students/...`,
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

**This is where backend-side translation genuinely belongs** — unlike
API error responses (see `error-handling/README.md`'s "Error codes
vs. categories" section, which are NEVER translated by the backend),
a WhatsApp/Email/SMS send has no frontend render step: the recipient
just gets text. So the Notification dispatch service resolves
language from the **recipient's stored `preferredLanguage`** (a field
on Student/Staff, set once, never from request headers — there's no
"request" for an async send) and renders the message from a
per-language template (`i18next` or equivalent, with real ICU
pluralization/interpolation — `{{count}} fees pending`, not string
concatenation) before handing it to the WhatsApp/Email/SMS provider.
A CI/startup check diffs every language's template key set the same
way as the frontend's `errors.*` keys — a template missing in one
language must fail a build, not silently fall back at 2am when a fee
reminder actually needs to go out.

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
scale. **Every job carries a dedup/idempotency key** (natural key of
what it's processing, e.g. `excel-import:{adminId}:{fileHash}` or
`device-sync:{adminId}:{deviceId}:{batchId}`) so a worker crash-and-
retry mid-batch can never double-process rows or double-send
messages — this generalizes the same `jobId`-dedup idea Attendance's
device-sync already needs.

See `attendance/attendance-overview.md`'s "Device sync — WDMS integration, two-speed pipeline" section for the canonical, fully-worked example of this pattern (WDMS token auth, `punchHash`/`jobId` dedup, fast-path Socket.io emit + slow-path reconciliation) — any future module touching biometric/device data follows that same shape rather than re-deriving it.

## Audit / activity log

One `ActivityLog` collection (`adminId`, `staffId`, `action`,
`module`, `targetId`, `meta`, `createdAt`) + a shared `logActivity()`
helper, called from any controller doing a sensitive write (role/
permission changes, a class delete-with-confirmation, a leave
approval, a payroll run, a co-admin's Super-Admin role assignment).
Never a reinvented `performedBy`/`createdBy` shape duplicated per
module — one collection, one helper, every module calls it the same
way.

**Principle — log what matters, not everything.** This is a security/accountability trail, not analytics: a system that logs every read becomes both a storage burden and useless as an audit trail, since a genuine security event gets buried under routine noise.
- **DO log**: auth events (login success/failure, logout, refresh failure); every Create/Update/Delete across every module (role/permission changes, leave approve/reject/cancel, payroll generate/lock/unlock, salary payment record/confirm/dispute, device assign/activate/block); access to specifically sensitive reads (viewing another staff member's salary, a payroll record).
- **DO NOT log**: routine navigation, list/dashboard GETs, repeated no-op polling reads, frontend-only UI state (tab switches, modal open/close).
- Call `logActivity()` explicitly from the specific controller actions that matter — never as blanket middleware intercepting every request; explicit call sites keep the log meaningful and greppable in review. Fire-and-forget (don't await it in the response path; a logging failure never breaks the actual operation).

**Extended `ActivityLog` shape**: `actorType:'staff'|'admin'|'sales'`, `changes:{before,after}` (only the changed fields, never a full-document dump — and never the raw value of a sensitive field like a password or full bank account number; log that it changed, not its before/after value), `ipAddress`, `userAgent`, `deviceFootprint:{ip, approxLocation, userAgent, deviceType}`. `approxLocation` is city/region-level from IP geolocation only, for anomaly purposes ("this login came from a different city than usual") — never precise GPS, never browser geolocation permission. Indexes: `{adminId,timestamp:-1}` (recent activity), `{adminId,actorId,timestamp:-1}` (one person's trail), `{adminId,module,targetId}` (full history of one record).

Frontend surface: an admin-only "Recent Activity" view under Settings (sidebar-reached, filterable by module/actor/date range, paginated), plus a lightweight "My Recent Logins" section in each staff member's own profile (last few logins with device/location — a self-service "was this me?" check).

## Rate limiting / API throttling

Referenced in the error-handling architecture (`RateLimitError`
exists) but the actual limiting logic isn't specified. Use
`express-rate-limit` (with a Redis store for multi-instance
deployments, since scaling to millions of users means more than one
API server) — reusing the same Redis connection already in the stack
for BullMQ, not a second store. Add `helmet` alongside it for standard
secure headers — both are one-time app.js wiring, not per-module work.

**Per-operation limits, not one blanket number** — different endpoints carry different abuse risk:
- Login endpoints (admin/staff/sales): aggressive — e.g. 5 attempts / 15 min per IP+identifier, with backoff/temporary lockout on repeated failure. Highest-value brute-force target.
- Token refresh: moderate — e.g. 10-20/hour per account.
- Write-heavy/bulk endpoints (Leave apply, bulk-assign, WhatsApp sends): e.g. 30-60/min per account — high enough to never bother a real user, low enough to blunt scripted abuse.
- Manual-trigger endpoints (device "Sync Now"): a light per-adminId cap (e.g. 1 per 30s) purely to stop redundant Redis/Mongo load, not for security.
- General authenticated-route baseline: a generous backstop (e.g. 300-600/min per account) against a runaway frontend bug or a compromised token being used for scraping.

Request-body validation (`req.body`/`req.params`) for anything beyond
the FieldConfig-driven custom fields uses **Joi or Zod** at the route/
controller boundary, throwing the existing `ValidationError` on
failure — never hand-rolled `if (!req.body.x) throw ...` checks
scattered per field.

## Security checklist — three layers, defense in depth

A check on only one layer isn't sufficient — a compromised frontend, a direct API call skipping the UI, or a leaked DB credential each bypass a different layer, so all three need their own enforcement.

- **Backend**: `helmet` headers; Joi/Zod validation on every write route (audit for any route still accepting raw `req.body`); NoSQL-injection guard (never pass a client-supplied filter object straight into a Mongoose query — whitelist expected keys); route-param type checks (an `:id` validated as a plausible ObjectId/String shape before use); output sanitization (`.select()`/projection audited so no read endpoint ever returns password hashes or JWT secrets); CORS whitelisting real frontend origins, never a reflected/wildcard origin; production error responses carry no stack traces or internal paths (full detail server-side only); `npm audit` on both backend and frontend as a standing checklist item.
- **Frontend**: no `[innerHTML]`/`bypassSecurityTrust*` on unsanitized user content; tokens only through the existing storage-service pattern, never a stray raw `localStorage.setItem('token', …)`; every route guard fails closed (denies on error/ambiguous state, never accidentally allows through); no stray `console.log` of tokens or full API responses in production builds.
- **Database**: least-privilege DB user (scoped to this app's own database, never an admin-level connection string); network access restricted to actual production server IPs, never `0.0.0.0/0`; encryption at rest/in-transit confirmed (managed Mongo's default, `mongodb+srv://` TLS); sensitive identifiers masked on read where the full value isn't needed (e.g. a payroll list shows "Account ending in 4417," never the full bank account number); automated backups enabled and the restore procedure documented.

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
Stream list, FieldConfig, active AcademicSession, resolved Role
permissions — rather than querying Mongo on every request that needs
them (nearly every page, via its filter dropdowns). Invalidate the
cache on write (a Class edit, a session activation, a role change)
rather than using a blind TTL, so users never see stale config after
making a change.

Route every module's caching through one **centralized `CacheService`**
(`backend/modules/services/cache/cache.service.js`) rather than each
controller writing its own Redis calls:
```
getClient()                          // reuses the BullMQ Redis connection
get(key) / set(key, value, ttl) / del(key)
delPattern(pattern)                  // bulk invalidate, e.g. "adminId:*"
wrap(key, ttlSeconds, fetchFn)       // cache-aside helper
```
Key convention: `{adminId}:{module}:{resource}`. A module switches
caching on with one `cacheService.wrap(...)` call around its existing
query — no module hand-writes Redis `get`/`set` itself. Build the
service now; wire it into a given endpoint only when that module's
own prompt calls for it.

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
