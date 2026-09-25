# Schoolzen — Centralized Error Handling Architecture

Status: **FINAL** — v1

This is the single reference for how errors are created, categorized,
logged, and shown to the user across the ENTIRE app — backend and
frontend, every module, present and future. No route handler or
Angular component writes its own ad-hoc `try/catch → res.status().json()`
or `catch(err) { alert(...) }` — everything funnels through what's
described here.

---

## Why category-wise, not module-wise

Errors are organized by **category** (what kind of failure it is —
validation, not-found, duplicate, permission, auth, rate-limit,
external-service, internal) rather than by module (Student errors,
Fees errors, Payroll errors), for one concrete reason: **HTTP status
codes and user-facing handling are category-driven, not module-
driven.** A "duplicate key" error looks and behaves identically
whether it's a duplicate Admission Number (Student) or a duplicate
Receipt Number (Fees) — same HTTP 409, same friendly-message shape,
same frontend toast styling. Organizing by module would mean
duplicating that handling logic 12+ times (once per module) instead
of once per category.

Every error still carries a `module` field (e.g. `"student"`,
`"fees"`) for logging/reporting — so a support engineer can still
filter "show me every error from Fees this week" — but that's a TAG
on a category-organized error, not the organizing principle itself.
This is what makes the system scale to more modules for free: a new
module never needs a new error-handling code path, it just throws the
existing category classes with its own `module` tag and `context`.

## Packages used (industry-standard, chosen for MEAN + scale)

**Backend:**
- **`express-async-errors`** — patches Express so any `async` route
  handler's rejected promise is automatically caught and forwarded to
  the error middleware, without wrapping every single route in
  `try/catch`. This is the difference between "every developer must
  remember to catch" and "it's structurally impossible to forget."
- **`winston`** — structured JSON logging (not `console.log`). Used by
  Uber, PayPal, and most Node services at MNC scale. Configured once,
  used everywhere via the shared logger.
- **`@sentry/node`** — production error tracking and alerting. At
  millions-of-users scale, you cannot rely on someone noticing a log
  line — Sentry aggregates, deduplicates, and alerts on error spikes
  per category/module automatically.
- **`http-errors`** (optional, lightweight) — for the rare case of
  throwing a plain HTTP error without needing Schoolzen's richer
  `AppError` shape (e.g. inside third-party middleware glue code).
- **`joi`** or **`express-validator`** — input validation that throws
  into the SAME `ValidationError` category, never a separately-shaped
  error.

**Frontend (Angular):**
- **A single `HttpInterceptor`** — every HTTP call in the app passes
  through this one interceptor; no component's HTTP subscription
  needs its own error branch for the common cases.
- **`@ngx-translate/core`** — resolves an error's `code` to a
  localized string (`errors.<code>` key) inside the interceptor;
  falls back to the server's English `message` when a locale is
  missing that key. Same library used for the app's general i18n
  (per `state-management.md`), not a separate one just for errors.
- **A custom `ErrorHandler`** (Angular's built-in extension point) —
  catches uncaught runtime errors (a bug in a component) that never
  even reached an HTTP call.
- **`@sentry/angular`** — mirrors the backend's Sentry setup; a
  frontend crash and the backend error it may have triggered can be
  correlated by request ID (see below).
- **Angular Material's `MatSnackBar`** (already in use per the legacy
  app's `mat-` components) for the actual user-facing toast — no new
  UI library introduced just for this.

## The error category hierarchy (backend)

One base class, one file per category, all in `errors/`:

| Category | HTTP Status | Example |
|---|---|---|
| `ValidationError` | 400 | A required field missing, a value failing a FieldConfig rule |
| `AuthenticationError` | 401 | Invalid/expired session token |
| `PermissionError` | 403 | A teacher without Fees access hits a Fees route |
| `NotFoundError` | 404 | Fetching a Student by an ID that doesn't exist |
| `ConflictError` | 409 | Duplicate Admission No., double-booked Roll No. |
| `RateLimitError` | 429 | Too many requests from one client in a window |
| `ExternalServiceError` | 502 | The WhatsApp reminder provider timed out |
| `InternalError` | 500 | Anything unexpected — the catch-all, never shown raw to the user |

Every category extends `AppError`, which carries: `message` (a
SAFE, user-presentable string — never a raw stack trace or DB
message), `module` (which module raised it), `context` (structured
extra data for logs only, never sent to the client), `isOperational`
(true for expected failures like validation; false for genuine bugs —
this distinction decides whether Sentry pages someone at 2am).

## Correlation IDs — the thread that ties frontend, backend, and logs together

Every request gets a `X-Request-Id` header (generated by a backend
middleware if the frontend didn't already send one). This ID is:
logged with every Winston log line for that request, attached to
every Sentry error (both backend and frontend), and returned in every
API response — so when a user reports "I got an error while collecting
a fee," the ID in their error toast is the exact string a support
engineer searches for in logs/Sentry to see the full request, no
guessing from timestamps.

## Response shape — one contract, every endpoint

```json
{
  "error": {
    "category": "ValidationError",
    "code": "AADHAR_INVALID_FORMAT",
    "message": "Admission number must be a 12-digit number",
    "fields": [{ "field": "aadharNumber", "code": "AADHAR_INVALID_FORMAT", "message": "..." }],
    "requestId": "a1b2c3d4-..."
  }
}
```

`fields` is only present for `ValidationError` (feeds the UI's inline
field-error convention directly, per the Settings module's
established pattern). Every other category omits it. The frontend
never needs to guess the shape — one interface, `ApiError`, covers
every response.

## Error codes vs. categories — and where translation actually happens

`category` (8 values, see the table above) drives coarse, shared
behavior — HTTP status and which generic UI treatment applies (toast
vs. inline vs. redirect). `code` is a separate, fine-grained, STABLE
string identity per specific failure (`AUTH_INVALID_CREDENTIALS`,
`CLASS_HAS_STUDENTS`, `ADMISSION_NO_DUPLICATE`) — this is what makes
i18n possible without touching the backend's error-throwing code.

**The backend never translates `message` itself.** A reference
i18next setup was reviewed while designing this (translating inside
the controller via `i18next.t(...)`, detecting language only from a
querystring) and rejected — its own EN/HI locale files didn't even
have matching key sets, which is exactly the failure mode this design
avoids structurally: real MNC-grade APIs (Stripe, Google Cloud, AWS)
return a stable `code`, never backend-translated prose, precisely so
one backend can serve every locale/client without knowing the caller's
language. `message` stays English and is only ever a fallback.

**Where translation DOES happen:**
- **API responses (this system)** — the Angular `ErrorInterceptor`
  (`../frontend/error.interceptor.ts`) looks up `errors.<code>` via
  `ngx-translate`; if that key is missing in the active locale, it
  falls back to rendering the server's English `message` rather than
  a raw untranslated key. See `resolveMessage()` there.
- **Outbound communications** (WhatsApp/Email/SMS — no frontend render
  step exists for these) — translated on the BACKEND, inside the
  Notification service, using the recipient's stored
  `preferredLanguage`, never per-request headers. See
  `additional-technical-considerations.md`'s Notifications section.

A CI/startup check keeps every locale's `errors.*` (frontend) and
notification-template (backend) key sets in parity — a language
missing a key is a build failure, not a silent runtime fallback
discovered by a user.

Reuse an existing `code` for the same kind of failure across modules
(e.g. every "duplicate unique field" case can share a derived
`<FIELD>_DUPLICATE` pattern, per `ConflictError.fromMongoDuplicateKey`)
rather than inventing a new one per call site — codes are meant to be
as reusable as categories, just more specific.

## Frontend handling — category maps to UI treatment, once

The `HttpInterceptor` reads `error.category` and applies ONE
consistent treatment per category, app-wide:
- `ValidationError` → don't toast; let the calling component show
  inline field errors from `fields` (matches the app's established
  "inline error, not a popup" convention for forms).
- `ConflictError`, `NotFoundError`, `PermissionError`,
  `ExternalServiceError` → a `MatSnackBar` toast with the server's
  `message` directly (it's already written to be user-safe).
  `AuthenticationError` → redirect to login, no toast needed (the
  redirect IS the feedback).
  `RateLimitError` → a toast asking to wait, with a small backoff
  countdown if the response includes a `retryAfter` value.
- `InternalError` (or anything uncategorized) → a generic "Something
  went wrong, please try again" toast — the real message is never
  shown to the user, only logged (with the request ID) to Sentry.

A new module never writes new interceptor logic — it just throws the
right category on the backend and the frontend already knows what to
do.

## Scalability notes (millions of users, more modules later)

- **Adding a module never touches this system** — it reuses the 8
  categories and tags its own `module` string. No error-handling code
  is ever "per module."
- **Sentry sampling** — at high volume, sample non-critical categories
  (e.g. `ValidationError`, which is expected and frequent) at a lower
  rate than `InternalError`/`ExternalServiceError` (sampled at 100%,
  since those need eyes on every occurrence).
- **Structured logs, not string logs** — Winston's JSON output means
  log aggregation tools (CloudWatch, Datadog, ELK) can query/alert on
  `category`+`module` combinations without regex-parsing log text —
  essential once log volume is too large for a human to read directly.
- **`isOperational` flag** — lets a process-level handler distinguish
  "an expected, handled failure" from "an unexpected bug that may have
  left the process in a bad state" — only the latter should ever
  trigger a process restart/alert-the-on-call-engineer response.

## Response messages — centralized constants, never hardcoded strings per controller

The same "never scatter it inline" principle that governs errors
applies to SUCCESS messages too — `res.status(200).json('Class deleted
successfully.')` hardcoded inside a controller is the success-path
version of the exact problem this whole error-handling architecture
exists to avoid on the failure path.

- A shared `backend/modules/helpers/messages/common.messages.js` holds
  generic CRUD message BUILDERS (not one hardcoded string per entity)
  — e.g. `success.created(entity)`, `success.updated(entity)`,
  `success.deleted(entity)` each returning a consistently-formatted
  string (`"${entity} deleted successfully."`) — so "Class deleted
  successfully," "Subject deleted successfully," and every other
  entity's delete message come from ONE function, not N duplicated
  string literals across N controllers.
- Use SHORT, consistent keys for anything that isn't a simple CRUD
  builder (module-specific messages) — grouped per module the same
  way everything else in the backend is
  (`modules/helpers/messages/<module>.messages.js`), never inlined
  directly in a controller.
- Where a message needs dynamic data (a count, a name), build it by
  passing the value into the message function/template — never by
  concatenating ad hoc strings at the call site in a controller; the
  concatenation logic lives in the messages file, the controller just
  calls `success.deleted('Class')` or `messages.classHasStudents(count)`.

This keeps wording consistent across the whole app (no "deleted
successfully" in one controller and "has been removed" in another for
the same action) and means a wording change happens in one file, not
a grep-and-replace across every controller that ever returned a
similar message.

## Files in this reference

- `backend/errors/AppError.js` — base class
- `backend/errors/ValidationError.js`, `NotFoundError.js`,
  `ConflictError.js`, `PermissionError.js`, `AuthenticationError.js`,
  `RateLimitError.js`, `ExternalServiceError.js`, `InternalError.js`
- `backend/middleware/requestId.js` — correlation ID middleware
- `backend/middleware/errorHandler.js` — the single Express error
  middleware every error funnels through
- `backend/utils/logger.js` — Winston setup
- `frontend/error.interceptor.ts` — the single Angular HTTP interceptor
- `frontend/global-error-handler.ts` — catches uncaught runtime errors
- `frontend/api-error.model.ts` — the shared TypeScript interface
