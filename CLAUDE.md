# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Schoolzen (package name `schooliya`, Angular project name `zoclass`) is a multi-tenant school-management SaaS: an Angular 14 frontend (`src/`) talking to a separate Express/MongoDB backend (`backend/`). There are two authenticated user types — **admin** (school owner/staff) and **teacher** — each with its own login, guard, interceptor, and JWT auth flow, plus public marketing pages (home, pricing, features, contact, etc.).

## Commands

Frontend (run from repo root):
- `npm start` — `ng serve`, dev server
- `npm run build` — production build (`ng build`, outputs to `dist/zoclass`)
- `npm run watch` — dev build with `--watch`
- `npm test` — Karma/Jasmine unit tests
- `ng test --include='**/some.component.spec.ts'` — run a single spec file
- `ng generate component pages/admin/xyz --module=pages/admin/xyz` — scaffold a new feature (see module pattern below)

Backend (run from `backend/`):
- `npm start` — `node app.js` (no dev/watch script defined; use `npx nodemon app.js` for auto-reload)
- No lint or test scripts are defined in either `package.json`.

The backend requires a `.env` file (see `backend/config/config.js`) with `PORT`, `BASE_URL`, and `DB_URL` (MongoDB connection string).

## Architecture

### Frontend (`src/app`)

- **Routing**: all top-level routes are declared in `app-routing.module.ts` as lazy-loaded feature modules (`loadChildren`). Every `admin/*` route is protected by `AdminAuthGuard`, every `teacher/*` route by `TeacherAuthGuard`. Public/marketing routes live under `pages/main`.
- **Feature module pattern**: each page under `pages/admin/*` and `pages/teacher/*` is its own self-contained Angular module with a matching `-routing.module.ts`, `.component.ts/html/css`. New features should follow this same one-module-per-page structure rather than adding to a shared module.
- **Auth**: `guards/admin-auth.guard.ts` and `guards/teacher-auth.guard.ts` gate route access; `interceptors/admin-auth.interceptor.ts` and `teacher-auth.interceptor.ts` attach the `Authorization: Bearer <token>` header to outgoing requests and transparently refresh the access token on a `403` (single in-flight refresh guarded by a `refresh` flag, retries the failed request once). Tokens are managed through `services/auth/*` and persisted via `services/storage.service.ts`.
- **Services** (`services/*.service.ts`): one HTTP service per backend resource, each built as `url = \`${environment.API_URL}/v1/<resource>\`` and thin wrapper methods around `HttpClient`. Follow this convention for new resources instead of calling `HttpClient` directly from components. Multipart requests (e.g. student photo upload) are built by switching to `FormData` when a file field is present, otherwise sending plain JSON — see `services/student.service.ts` for the pattern.
- **Environment config**: `src/environments/environment.ts` / `environment.prod.ts` hold `API_URL`, swapped at build time via `fileReplacements` in `angular.json`.
- **UI stack**: Angular Material + Bootstrap 5 + jQuery/owl.carousel are all loaded globally via `angular.json` `styles`/`scripts` arrays (not per-module imports). Charting uses both ECharts and Highcharts depending on the page. PDF/Excel export uses `jspdf`/`pdf-lib`/`pdfmake`/`html2pdf.js` and `exceljs`/`xlsx` respectively — check existing usages in `services/excel` and `services/print-pdf` before adding a new export flow.

### Backend (`backend/`)

- **Entry point**: `app.js` loads env vars, builds the global config (`global.global_config`), connects to MongoDB (`modules/helpers/database.js`), wires global middleware (body-parser, cookie-parser, cors), starts `cron-job.js`, and mounts all routes via `routes.js`.
- **Routing**: `routes.js` is the single place all route modules are mounted, each under a `/v1/<resource>` prefix (e.g. `/v1/student`, `/v1/fees`, `/v1/admin`). Add new resources here.
- **Per-resource module layout** under `modules/`: `routes/<resource>.js` (Express router, wires validation/upload middleware + controller functions) → `controllers/<resource>.js` (request handlers) → `models/<resource>.js` (Mongoose schema) → `validators/<resource>.js` (Joi schemas). Nested resources (e.g. users, whatsapp-message, devices) get their own subdirectory mirrored across `controllers/`, `models/`, and `routes/`.
- **Auth middleware**: `modules/middleware/admin-auth.js` / `teacher-auth.js` read the `Authorization: Bearer <token>` header and verify it via `services/admin-token`/`services/teacher-token` (JWT access/refresh token services), attaching the decoded user to `req.user`.
- **Validation**: `modules/middleware/validate.js` is a generic Joi-schema-validating middleware factory (`validate(schema)`) used inline in route definitions; it strips unknown fields and returns `400` with the Joi error details on failure.
- **File uploads**: handled by Multer configs in `modules/helpers/file-upload.js` (e.g. `fileUpload.studentImage.single(...)`), applied per-route before validation, with manual error handling for size/type/path errors (see `modules/routes/student.js` for the full pattern used across upload routes).
- **Background jobs**: `cron-job.js` schedules daily jobs (via `node-cron`) for academic session rollover and expired-plan checks, implemented in `modules/services/cron-session-service.js` and `modules/services/cron-plan-service.js`.
- **Third-party integrations**: Razorpay (payments), Twilio (SMS), Nodemailer (email), Cloudinary (media), all configured through env vars and used from the relevant controller/service files.
- **Monthly-snapshot pattern for per-person, per-day data** (established by `Roster`, follow it for anything else with the same shape — e.g. future attendance-linked, per-day-per-person collections): instead of one document per `(person, day)`, store **one document per `(adminId, personType, personId, year, month)`** with a `days: Map<"YYYY-MM-DD", value>` field (`modules/models/roster.js`). This keeps a whole month's worth of a person's data in a single doc — one `findOneAndUpdate` per cell edit (`$set`/`$unset` on `days.<dateKey>`, atomic, no full-doc read), and one scan per `(school, month)` for a full grid rather than 30+ per-day rows. `month` is stored **1-12** (August = `8`), never JS's 0-11 — parse it from the `"YYYY-MM-DD"` string directly via `parseDateKey()` (`modules/helpers/date-only.js`), never through `Date` arithmetic, so nothing can drift a day or a month. Any code reading this shape (e.g. the Phase 6 attendance-reconciliation worker looking up a person's expected shift for a given date) should call `parseDateKey(date)` to get `{ year, month, dateKey }`, run a single `findOne({ adminId, personType, personId, year, month })`, and read `days[dateKey]` off the `.lean()`-ed result — **O(1) per lookup, never a per-day query**. See `modules/services/roster-lookup.js` (`getExpectedShift` / `getExpectedShiftsForDate`) for the reference implementation, including the batched form that resolves a whole school-day in two queries regardless of headcount.

## File & Folder Naming Conventions

Traced from `class`/`student`/`class-subject` (backend) and `class`/`admin-student-fees-structure`/`teacher-student-fees`/`whatsapp-message` (frontend). Use these exactly when scaffolding a new module — the "New Module Checklist" below relies on them.

### Backend (`backend/modules/`)

- **File names**: kebab-case, singular resource name, `.js` — `student.js`, `academic-session.js`, `fees-structure.js`, `admit-card-structure.js`, `issued-transfer-certificate.js`.
- **Same base name across layers**: one resource reuses its exact filename in every layer it needs — `models/student.js`, `validators/student.js`, `controllers/student.js`, `routes/student.js`.
- **Grouped/nested resources**: get a kebab-case (or plain lowercase) group subfolder mirrored across whichever of `models/`, `controllers/`, `routes/` apply — `users/admin-user.js`, `users/teacher-user.js`, `devices/attendance-device.js`, `whatsapp-message/message-wallet.js`. Not every layer needs a file in the group (e.g. `devices` currently has no `validators/devices/` entry) — only add what the resource actually needs.
- **Mongoose model export**: PascalCase + `Model` suffix, e.g. `StudentModel`, `ClassModel`, `FeesCollectionModel` — this is the convention to follow for new models (a couple of older files export without the suffix, e.g. `AdminPlan`; don't copy that exception).
- **Controller handler names**: PascalCase verb+resource for anything beyond a trivial counter — `CreateStudent`, `UpdateStudent`, `DeleteStudent`, `GetSingleStudent`, `GetAllStudentByClass`, `GetStudentPaginationByClass`; plain camelCase only for simple `count<Res>` handlers (`countStudent`, `countClass`).
- **Validator exports**: `create<Res>Schema` and `update<Res>Schema` (camelCase verb, PascalCase resource, `Schema` suffix).

### Frontend (`src/app/`)

- **Feature page folders** (`pages/admin/*`, `pages/teacher/*`): kebab-case. Bare top-level entities keep a short, unprefixed name on the admin side — `class`, `subject`, `teacher`, `student`, `school` — while the *same* entity on the teacher side is prefixed `teacher-` — `teacher-student`, `teacher-admission`, `teacher-dashboard`. This asymmetry is real and intentional-looking (admin relies on the `admin/...` route segment to disambiguate; teacher folder names spell the role out), not something to "fix" — match whichever side you're adding to. Compound/derived features use a longer descriptive kebab chain, generally role-prefixed: `admin-student-fees-structure`, `admin-student-marksheet-result-add`, `teacher-student-marksheet-structure-edit`.
- **Inside a feature folder**: `<name>.component.ts` / `.html` / `.css`, `<name>-routing.module.ts` (hyphen before `routing`, not a dot), `<name>.module.ts`. Class suffixes: `<Name>Component`, `<Name>Module`, `<Name>RoutingModule` (PascalCase of the folder's kebab name). Selector: `app-<kebab-name>` (`app-class`, `app-student`), matching the Angular CLI `prefix: "app"` set in `angular.json`.
- **Services** (`src/app/services/`): kebab-case resource name + `.service.ts` (`class.service.ts`, `class-subject.service.ts`, `fees-structure.service.ts`); class `<PascalName>Service`. Sub-domain groups of services live in a kebab-case subfolder: `auth/admin-auth.service.ts`, `auth/teacher-auth.service.ts`, `excel/excel.service.ts`, `print-pdf/print-pdf.service.ts`, `payment/*`, `whatsapp-message/message-wallet.service.ts`.
- **Guards/interceptors**: `<role>-auth.guard.ts` → `<Role>AuthGuard`; `<role>-auth.interceptor.ts` → `<Role>AuthInterceptor`.
- **Models** (`src/app/modal/`): kebab-case (or single-word) resource name + `.model.ts`, exporting a PascalCase `interface <Res>` — `class.model.ts` → `Class`, `class-subject.model.ts` → `ClassSubject`, `admin.model.ts`, `plans.model.ts`. This is the majority pattern (10 of 13 files) and the one to use for new models. **Known inconsistency, don't extend it**: `student.modal.ts` and `result.modal.ts` use a `.modal.ts` (typo'd) extension, and `classSubject.modal.ts` is a stray camelCase duplicate of `class-subject.model.ts` left over from an incomplete rename — leave these as-is, don't pattern-match new files off them.
- **Nesting depth**: page folders are flat — one level under `pages/admin/` or `pages/teacher/`, not further nested per sub-feature (there's no `pages/admin/student/fees/...`; that's instead its own sibling folder `admin-student-fees`). The only folders that break this flatness are the shared-module folders (`admin-shared`, `teacher-shared`, `main-shared`) and the `common` folder (header/footer/side-nav).

## New Module Checklist

This is the exact file order used for existing resources (traced from `class` and `student`) to add a new resource end-to-end. Follow this order — later files depend on earlier ones existing.

### Backend (`backend/`), for a new resource `<res>`

1. **Model** — `modules/models/<res>.js`: `mongoose.model('<res>', { ...fields })` inline schema literal, manual `createdAt: { type: Date, default: Date.now }`, `module.exports = <Res>Model`. (Nested resources, e.g. a resource that belongs under `users` or `devices`, go in `modules/models/<group>/<res>.js` instead.)
2. **Validator** — `modules/validators/<res>.js`: Joi object(s), typically `create<Res>Schema` and, for partial updates, `update<Res>Schema = create<Res>Schema.fork(Object.keys(create<Res>Schema.describe().keys), (schema) => schema.optional())`. Export both. Skip this file only if the resource is as trivial as `class` (no file upload, few fields) and validate inline in the controller instead — but prefer adding it for anything with >3 fields.
3. **Controller** — `modules/controllers/<res>.js`: `'use strict'`, require the model (and any other models it touches, e.g. a fees/plan model for cross-resource checks), define each handler as `let`/`const` async `(req, res, next) => {...}` wrapped in try/catch (`catch` → `res.status(500).json('Internal Server Error!')`), then a single `module.exports = { HandlerOne, HandlerTwo, ... }` at the bottom. Standard handler set to include for a full CRUD resource: `count<Res>`, `Get<Res>Pagination`, `GetAll<Res>`, `GetSingle<Res>`, `Create<Res>`, `Update<Res>`, `Delete<Res>`.
4. **Middleware wiring (route file)** — `modules/routes/<res>.js`: `'use strict'`, `const router = express.Router();`, destructure the needed controller functions from step 3, then declare routes in this conventional order: `GET /<res>-count`, `POST /<res>-pagination`, `GET /` (list all), `GET /:id`, `POST /` (create — wrap in the `fileUpload.<field>.single(...)` + `validate(create<Res>Schema)` middleware chain from `modules/routes/student.js` if the resource accepts a file), `PUT /:id` (update, same upload/validate wrapping with `update<Res>Schema`), `DELETE /:id`. End with `module.exports = router;`. If the resource needs admin/teacher auth, add `require('../middleware/admin-auth').isAdminAuth` (or `isTeacherAuth`) as a route-level middleware before the controller function.
5. **Mount the route** — `backend/routes.js`: add one line, `app.use('/v1/<res>', require('./modules/routes/<res>'));`, in the same alphabetical/grouping-by-feature order as the surrounding entries. This is the only place a new resource's routes are wired into the running app — forgetting this step means the model/controller/routes exist but are unreachable.
6. *(Optional, only if the resource needs a file upload)* — add a Multer config to `modules/helpers/file-upload.js` following the existing `studentImage` pattern (size/type limits, destination) and reference it from the route file in step 4.
7. *(Optional, only if the resource needs a scheduled job)* — add a `modules/services/cron-<res>-service.js` and schedule it from `backend/cron-job.js`.

### Frontend (`src/app/`), for the same resource `<res>`

1. **Model** — `src/app/modal/<res>.model.ts` (or `.modal.ts` — both extensions exist in this codebase; match whichever the sibling resources use): a plain `export interface <Res> { _id: String, ...fields }` mirroring the Mongoose schema fields the frontend actually reads/writes.
2. **Service** — `src/app/services/<res>.service.ts`: `@Injectable({ providedIn: 'root' })`, `url = \`${environment.API_URL}/v1/<res>\``, inject `HttpClient`, and add one thin method per backend route from step 4 above (`add<Res>`, `get<Res>List`, `get<Res>Count`, `<res>PaginationList`, `update<Res>`, `delete<Res>`), matching each method to its exact backend path/verb.
3. **Feature module directory** — create `src/app/pages/admin/<res>/` (or `pages/teacher/<res>/` for a teacher-facing resource) containing:
   - `<res>.component.ts` / `.html` / `.css` — the page component (form + list + modal state, following the conventions in the "Code Style & Conventions" section below).
   - `<res>-routing.module.ts` — `RouterModule.forChild([{ path: '', component: <Res>Component }])`, `exports: [RouterModule]`.
   - `<res>.module.ts` — `declarations: [<Res>Component]`, `imports: [CommonModule, <Res>RoutingModule, AdminSharedModule]` (or `TeacherSharedModule` under `pages/teacher`). `AdminSharedModule`/`TeacherSharedModule` supply Material, forms, pagination, and shared pipes — import it rather than re-importing those individually.
4. **Wire the route** — `src/app/app-routing.module.ts`: add one lazy route entry in the appropriate admin/teacher section, e.g. `{ path: 'admin/<res>', loadChildren: () => import('src/app/pages/admin/<res>/<res>.module').then((m) => m.<Res>Module), canActivate: [AdminAuthGuard] }`. This is the single registration point that makes the page reachable — there is no central module list beyond this file (`AdminSharedModule`/`app.module.ts` are shared-dependency providers, not per-feature registries).
5. *(Optional)* — if the page needs a nav entry, add it to the sidebar component under `pages/admin/common` (or the teacher equivalent) alongside the other menu items.

### Quick sanity check after scaffolding

- Backend reachable: resource appears under `backend/routes.js` → hits `modules/routes/<res>.js` → controller → model.
- Frontend reachable: `app-routing.module.ts` entry → `<res>.module.ts` → `<res>-routing.module.ts` → component → service → matches the `/v1/<res>` URL mounted above.
- If either registration point (`routes.js` on the backend, `app-routing.module.ts` on the frontend) is skipped, every other file can be correct and the module will still 404.

## Code Style & Conventions

These reflect actual patterns in the codebase (not aspirational rules) — match them when editing nearby code rather than introducing a new style.

### Frontend (Angular components/services)

- **Component state**: all fields are declared at the top of the class with explicit types and inline defaults (`showModal: boolean = false;`), not grouped into view-model objects. Modal/mode flags follow a consistent naming triad: `showModal`, `updateMode`, `deleteMode`, `deleteById`, paired with `errorCheck: Boolean` + `errorMsg: String` for surfacing API errors instead of throwing.
- **Double-submit guard**: mutating actions check/set an `isClick` boolean at the start and reset it in both the success and error callback (see `studentAddUpdate`, `studentDelete` in `student.component.ts`). Apply this to any new create/update/delete handler.
- **CRUD method naming**: `add<Entity>Model()` / `update<Entity>Model()` / `delete<Entity>Model()` open the modal and seed state; a single `<entity>AddUpdate()` method branches on `updateMode` to call either the create or update service method; `<entity>Delete(id)` calls the delete service method. A shared `successDone()` closes the modal, clears messages, refetches the list, and shows a delayed (`setTimeout`, 500–1000ms) `ToastrService` success toast.
- **Subscriptions**: `.subscribe((res) => {...}, err => {...})` using the legacy two-callback form (not the `{next, error}` observer object), with an `if (res) {...}` truthy check inside the success callback rather than branching on HTTP status.
- **Pagination**: list-fetch methods (`getStudents`, `getClass`, etc.) wrap the `.subscribe` call in `new Promise((resolve) => {...})`, build a `params` object with `filters`/`page`/`limit`, and push `{ type: 'page-init', page, totalTableRecords }` through a `paginationValues: Subject<any>` consumed by the shared pagination component.
- **Typing**: components and services use `any` liberally for API request/response payloads even though the project is TypeScript; only enum-like constants and form controls tend to be typed. Don't feel obligated to introduce strict interfaces where the surrounding code doesn't have them — but do type genuinely new, self-contained logic (e.g. pure helper functions) where it's cheap.
- **Services**: one class per backend resource, injected `HttpClient`, a single `url` field built from `environment.API_URL`, thin methods that just shape the request (see `services/student.service.ts`). Requests with a possible file field build a `FormData` conditionally; otherwise send the raw object.
- **Imports**: Angular/RxJS imports first, then absolute `src/app/...` imports for services/models (feature components use absolute paths; some older files use relative `../../../services/...` — prefer absolute `src/app/...` for new code to match the majority).
- **Comments**: sparse overall; when present they're short, imperative, and mark intent or sections (`// Reset error state`, `// --- API Submission ---`), occasionally Hindi/English mixed ("IndexesToDelete ke hisab se..."). Avoid narrating obvious lines; comment only non-obvious business rules (e.g. fee/promotion logic) as the existing code does.

### Backend (Express/Mongoose)

- **File header**: every module starts with `'use strict';`, followed by `require`s (Node/npm packages first, then local `../models/...`, `../services/...`, `../helpers/...`).
- **Controllers**: exported as a `module.exports = { ... }` object at the bottom of the file listing every handler; handlers are declared individually as `let`/`const` async arrow functions above it, not attached directly to `exports` inline. Simple CRUD/count handlers use PascalCase-ish action names (`CreateStudent`, `UpdateStudent`, `DeleteStudent`, `GetSingleStudent`) while trivial counters stay camelCase (`countStudent`, `countClass`) — follow whichever style matches sibling handlers in the same file.
- **Error handling**: every handler wraps its body in `try { ... } catch (error) { return res.status(500).json('Internal Server Error!'); }` — errors are swallowed and never rethrown; the caught `error` is generally unused (occasionally logged with `console.log`/`console.error`, not a logger). Business-rule failures return `res.status(400/404).json('<message>!')` as a **plain string**, not a JSON object — match this in older-style routes. Some newer handlers (e.g. `StudentClassPromote`) instead return `{ errorMsg: '...' }` / `{ successMsg: '...' }` objects; check the specific resource's existing pattern before adding a new endpoint to it, since the two styles aren't interchangeable from the frontend's error-handling code.
- **Validation-in-controller**: rather than centralizing all rules in Joi schemas, controllers re-check uniqueness/business constraints inline with sequential `findOne` existence checks (admission number, Aadhar, roll number, etc.), each returning early with a specific message on conflict. Follow this "fail fast with a specific message" style for new constraints rather than batching errors.
- **Cleanup on failure**: routes that accept an uploaded file use a local `handleError(statusCode, message)` closure that deletes the temp file (`fs.unlinkSync`) before responding, so every early return in that handler goes through `handleError(...)` instead of a bare `res.status(...)`.
- **Models**: defined with `mongoose.model('name', { ...inline schema literal... })` — not `new mongoose.Schema(...)` — with per-field `type`/`required`/`trim`/`lowercase`/`enum`/`default`, and a manual `createdAt: { type: Date, default: Date.now }` field instead of the `{ timestamps: true }` schema option. Foreign keys (`adminId`, `studentId`) are plain `String`/kept as the referenced document's `_id` string rather than `mongoose.Schema.Types.ObjectId` refs — match this when adding relations.
- **Parallelism**: independent lookups/deletes are batched with `Promise.all([...])` (see `DeleteStudent`, `CreateBulkStudentRecord`); multi-document writes that must be atomic use an explicit Mongoose session/transaction (`startSession` → `startTransaction` → `commitTransaction`/`abortTransaction`), as in `CreateBulkStudentRecord`.
- **Middleware factories**: cross-cutting concerns are implemented as functions returning an Express middleware, e.g. `validate(schema)` in `modules/middleware/validate.js` (Joi-validates `req.body`, strips unknown keys, responds `400` with a generic `"Validation failed"` string, logs `error.details` to console). Auth middleware (`isAdminAuth`/`isTeacherAuth`) reads the bearer token, calls the matching token service to verify it, and specifically distinguishes `jwt.TokenExpiredError` from other failures.


# Schoolzen Attendance & Payroll — Architecture & Build Plan

Scale target: ~2000 schools, ~2,000,000 students, punch data concentrated in an 8-10am
daily window. Must feel real-time to users even if full background reconciliation takes
up to ~2 hours. Redis usage kept to the minimum actually required. Existing `student`
and `teacher` collections must not be touched.

---

## 1. Non-negotiable constraints

1. **Do not modify `models/student.js` or `models/teacher.js`.** No new fields, no
   schema changes. All new data lives in new collections that *reference* these by
   their existing `_id` (or `teacherUserId` for teachers).
2. **Redis is used only for**: (a) BullMQ queue backing, (b) an optional short-TTL
   (5-10 min) live-status cache per school. It is *not* a general-purpose cache, not a
   session store, not a token store (WDMS token caching stays as a simple in-memory
   variable with expiry, like the reference project's `wdms-token.js`).
3. **Two-speed processing**: raw punch ingestion must be fast (feels real-time).
   Calculated/reconciled attendance (late/absent/half-day, leave cross-check, roster
   comparison) runs as background batch jobs and is allowed to lag by up to ~2 hours
   during peak load.

---

## 2. New collections (all reference existing data, none modify it)

| Collection | Purpose | Key fields |
|---|---|---|
| `BiometricMapping` | Links a WDMS `emp_code`/RFID card to an existing student/teacher/staff record, without touching those schemas | `schoolId, personType ('student'\|'teacher'\|'staff'), personId, wdmsEmpCode, cardNo` |
| `Department` | Org unit for staff | `schoolId, name, status` |
| `Designation` (Position) | Job title for staff | `schoolId, title, departmentId, status` |
| `Staff` | Non-teaching staff (teachers stay in existing `teacher` collection; `Staff` covers everyone else). A `personType` discriminator lets Attendance/Payroll treat both uniformly | `schoolId, name, departmentId, designationId, joiningDate, status` |
| `Device` | Biometric terminal registry | `schoolId, terminalSn (unique), alias, active` |
| `AttendanceRule` | Per-school config: work start, grace/late-after minutes, half-day-after minutes, overtime toggle | `schoolId (unique), workStart, lateAfter, halfDayAfter, allowOvertime` |
| `Shift` *(optional, Phase 3b)* | Named shift definitions if a school needs more than one rule set | `schoolId, name, startTime, endTime, graceMinutes` |
| `Roster` *(optional, Phase 3b)* | Which staff/shift applies on which date. **Implemented as a monthly snapshot, not one row per day** — see the "Monthly-snapshot pattern" note under Backend architecture | `adminId, personType, personId, year, month (1-12), days: Map<"YYYY-MM-DD", shiftId>` |
| `PunchLog` | Raw WDMS/manual punch, one row per punch | `schoolId, personType, personId, punchTime, punchState, source ('WDMS'\|'MANUAL'), terminalSn, punchHash (unique)` |
| `DailyAttendance` | One row per person per date — the calendar-facing summary | `schoolId, personType, personId, date, inTime, outTime, status ('Present'\|'Absent'\|'HalfDay'\|'Late'\|'Leave'\|'Holiday'), source, isOverridden` |
| `HolidayTemplate` | Reusable yearly holiday list, clonable into a school's calendar | `name (e.g. 'MP Board 2026'), holidays: [{date, title}]` |
| `Holiday` | A school's actual holiday calendar (created by cloning a template, then editable) | `schoolId, date, title` |
| `LeaveType` | Configurable leave categories | `schoolId, name, maxPerYear, paid, status` |
| `LeaveRequest` | Leave applications | `schoolId, personType, personId, leaveTypeId, from, to, status, actionBy, actionAt` |
| `SalaryStructure` | Baseline pay components per staff | `schoolId, staffId, basic, hra, allowances, deductions, effectiveFrom` |
| `Payroll` | Monthly generated payroll | `schoolId, staffId, month, presentDays, absentDays, leaveDays, grossSalary, deductions, netSalary, status ('DRAFT'\|'LOCKED')` |

`punchHash = sha1(schoolId + personId + punchTime)` — same dedupe-guard pattern as the
reference project, unique-indexed to make re-syncs idempotent.

`DailyAttendance` supports **multiple in/out punches per day** (unlike the reference
project's single in/out limit) — store `firstIn`, `lastOut`, and optionally a
`punchCount` so lunch-break/multi-shift punching doesn't break the calculation.

---

## 3. Sync & real-time architecture

### 3.1 WDMS client — pick ONE auth method
Use the **token-based** approach only (`wdms-token.js` pattern): static `WDMS_TOKEN`
env var when available, dynamic `/api/jwt-api-token-auth/` fetch + cache (23h TTL) as
fallback. Drop the Basic-Auth client entirely — having two WDMS clients is the kind of
inconsistency we don't want to carry into Schoolzen.

### 3.2 Real BullMQ Queue → Worker (not cron → child-process)
The reference project defines BullMQ `Queue` objects but its actual workers are
standalone scripts spawned by `node-cron`'s `exec()` — the queues are never consumed.
Fix this: cron **enqueues** jobs (`attendanceQueue.add('sync-school', { schoolId })`),
and a long-running BullMQ **Worker** process consumes them with controlled
concurrency. This is what makes the system control load at scale instead of spawning
2000 uncoordinated child processes at once.

### 3.3 Two-speed pipeline

**Fast path (raw ingestion — must feel instant):**
1. Cron enqueues one lightweight "pull school X" job per school, staggered across the
   8-10am window rather than all at once (see §4).
2. Worker fetches WDMS transactions (paginated), bulk-inserts into `PunchLog` with
   `insertMany({ ordered: false })`, letting the unique `punchHash` index silently
   skip duplicates.
3. Immediately after each batch insert, emit a small Socket.io event to that school's
   room (`school:<id>`) with just the changed person's latest in/out — this is the
   "real-time feel." No heavy computation happens on this path.

**Slow path (reconciliation — allowed to lag):**
4. A **separate** BullMQ queue (`attendance-reconcile`) receives a job per
   school+date whenever new `PunchLog` rows land for it (debounced — don't enqueue on
   every single punch, batch every few minutes).
5. This worker computes/updates `DailyAttendance` — compares against
   `AttendanceRule`/`Roster`, applies Holiday/Leave overrides, sets final
   `status`. This can safely run minutes-to-hours behind; the dashboard already
   showed the raw punch, so nothing feels broken.
6. Payroll generation reads only from `DailyAttendance` (never raw `PunchLog`),
   so it's naturally decoupled from ingestion speed.

### 3.4 Redis usage — kept minimal
- BullMQ connection (required, both queues share one Redis connection).
- Optional: `school:<id>:live` key with a 5-10 min TTL caching the count of
  in/out staff for the dashboard's headline numbers, refreshed by the fast path —
  avoids hammering MongoDB with aggregation queries during the peak window. Everything
  else (WDMS token, session, API response caching) stays out of Redis.

---

## 4. Scale strategy (2000 schools / 2M students, 8-10am peak)

1. **Stagger, don't stampede**: cron doesn't fire all 2000 school-sync jobs at once —
   spread them across the 2-hour window (e.g., a rolling scheduler that assigns each
   school a jittered offset) so WDMS calls and DB writes are smoothed, not spiked.
2. **Compound indexes**: `{schoolId: 1, date: 1}` on `DailyAttendance` and `PunchLog`
   — every read/write is scoped to one school, so this index keeps each query narrow
   even as total data grows into the tens of millions of rows.
3. **Worker concurrency limits, per-queue**: cap how many school-sync jobs run in
   parallel (BullMQ `concurrency` option) so the DB and WDMS endpoints aren't
   overwhelmed; tune based on load testing rather than guessing.
4. **Design for sharding, don't require it on day one**: `schoolId` as the natural
   shard key means MongoDB sharding can be turned on later without a schema
   redesign, if a single replica set stops being enough. Not needed at initial launch.
5. **Batch writes only** — never one Mongoose `.save()` per punch; always
   `insertMany`/`bulkWrite`.

---

## 5. Build phases (unchanged order, now with the pieces above slotted in)

1. **Department + Designation**
2. **Staff** (+ `BiometricMapping` for linking existing teacher/student records to
   WDMS emp codes, without touching those collections)
3. **AttendanceRule** — the simple, single per-school config (work start, late-after,
   half-day-after)
4. **Shift + Roster** — for schools that need more than one rule set: named shifts
   and a day-by-day assignment of staff to a shift, feeding into the reconciliation
   worker as the "expected shift" to compare punches against
5. **Device Management (sales-facing, structurally separated)**: a `Device`
   collection tracking which sales person added a machine, its assignment to a
   school, and its active/blocked status — built as an isolated module (own
   routes/controllers namespace, no dependency on attendance-sync logic) so it
   can be extracted into a standalone app later without a rewrite
6. **Attendance module (the core one)** — WDMS sync infra: token client, BullMQ
   queues (sync + reconcile), cron staggered scheduler, `PunchLog` +
   `DailyAttendance` models, manual-entry endpoint. This reads `Device` only by
   `schoolId + terminalSn` — it never touches sales/assignment fields
7. **Socket.io real-time layer**: per-school rooms, fast-path event emission —
   this is the PetPooja-style "live who's in/out" dashboard
8. **Leave module**: `LeaveType` + `LeaveRequest`, feeding into `DailyAttendance`
   as an override source
9. **Holiday calendar + Holiday Template**: a reusable `HolidayTemplate` (e.g. a
   standard yearly list) that can be cloned into a school's actual `Holiday`
   calendar and then adjusted per school, so every school doesn't need holidays
   entered one-by-one from scratch every year
10. **Payroll module** — `SalaryStructure` + real `Payroll` generation (present
    days, absent days, leave days, deductions, net salary — not the placeholder
    `netSalary: 0` from the reference project)

---

## 6. Claude Code — exact Plan Mode prompts, one per phase

Run these **one at a time**, in Plan Mode (`Shift+Tab` twice), review each plan before
approving, then execute before moving to the next phase.

**Every phase below is full-stack by design**: each prompt explicitly asks for the
backend (model/validator/controller/route, mounted in `routes.js`) *and* the matching
frontend feature module (component/service/routing, per CLAUDE.md's conventions) in
the same plan and the same execution pass. That means after each phase you can run
`npm start` (backend) + `ng serve` (frontend) locally and click through the actual
feature end-to-end — no separate "wire up the UI later" pass, no digging through
backend-only code to figure out if it works.

### Phase 1
```
Read CLAUDE.md fully. Create a detailed plan for two new backend + frontend
modules: Department and Designation, following the exact New Module Checklist
and naming conventions in CLAUDE.md. Designation should optionally reference a
Department. These are for staff, not students. Build both the backend (model,
validator, controller, route mounted in routes.js) and the frontend (component,
service, routing module, wired into app-routing.module.ts) together in this
plan, so the module is clickable and testable end-to-end locally after this
phase — not just backend endpoints. Don't build anything else yet.
```

### Phase 2
```
Read CLAUDE.md fully. Create a detailed plan for a new Staff module (backend +
frontend), covering non-teaching staff — the existing teacher collection stays
untouched and is not part of this module. Staff should reference Department and
Designation. Also plan a new BiometricMapping collection that links a schoolId +
personType ('student'|'teacher'|'staff') + personId to a WDMS emp_code/RFID card
number, without adding any fields to the existing student or teacher models.
Build both backend and frontend together, following the New Module Checklist
and naming conventions, so Staff create/edit/list is clickable and testable
locally after this phase.
```

### Phase 3
```
Read CLAUDE.md fully. Create a detailed plan for an AttendanceRule module: one
config record per school (workStart, lateAfter minutes, halfDayAfter minutes,
allowOvertime), with backend CRUD and a frontend settings form, built together
in the same plan so it's testable end-to-end locally after this phase. Follow
the New Module Checklist and naming conventions. Don't build Shift/Roster yet —
this simpler per-school rule set comes first.
```

### Phase 4
```
Read CLAUDE.md fully. Create a detailed plan for Shift and Roster modules: Shift
(name, startTime, endTime, graceMinutes, per school) and Roster (which staff is
assigned to which shift on which date). Roster should be usable by the upcoming
attendance-reconciliation logic as the "expected shift" for a given person and
date. Build both backend (models/controllers/routes) and frontend (a Shift
manager page and a simple calendar/list-based Roster assignment page) together,
following the New Module Checklist and naming conventions, so both are clickable
and testable locally after this phase.
```

### Phase 5
```
Read CLAUDE.md fully. Create a detailed plan for Phase 5 — Device Management +
sales-user login. Build backend and frontend together.

DEVICE MANAGEMENT (structurally isolated, so it can be extracted into a
separate app later — own namespace, no dependency on attendance-sync logic):
Device collection has terminalSn (unique), alias, terminalName, active,
salesPersonId, addedBy, assignedSchoolId (nullable), assignedAt, and status
('unassigned'|'active'|'blocked'). Devices are NEVER created from free-typed
input — add a "Sync from WDMS" action that calls GET /iclock/api/terminals/
(paginated) through the token-based WDMS client and upserts by terminalSn,
filling alias, terminalName and active from the response while leaving
salesPersonId, assignedSchoolId and status untouched on rows that already
exist; new terminals land as status 'unassigned' with no salesPersonId.
Endpoints needed: sync from WDMS, assign a device to a school, activate/block
a device, list devices by sales person, and a school-wise list grouped by
assignedSchoolId. The assign flow must only show unassigned devices
(assignedSchoolId null) so a machine can never be assigned twice.
Attendance-sync in Phase 6 will only ever read Device by schoolId +
terminalSn.

SALES USER — LOGIN ONLY: a SalesUser collection under users/ alongside
admin-user and teacher-user, with fields name, salesUserId (the login
identifier), password (bcryptjs hash, compared on login), and status. No
role field, no tiers. No registration, no signup route, no OTP, no
forgot-password, no seed script — records are inserted directly in MongoDB
Compass with a pre-generated hash, so the backend only ever reads and
authenticates a SalesUser and never writes one. Mirror the TEACHER auth
pattern exactly, not admin's: guards/teacher-auth.guard.ts,
interceptors/teacher-auth.interceptor.ts, services/auth/teacher-auth.service.ts,
backend modules/middleware/teacher-auth.js and modules/services/teacher-token.js.
Produce SalesAuthGuard, sales-auth.interceptor.ts,
modules/middleware/sales-auth.js, modules/services/sales-token.js, and a
login + refresh route pair only. Sales users are cross-tenant: no adminId in
the JWT payload and no adminId scoping in any Device Management query —
scope by the sales user's own id. Add a /sales/* route group in
app-routing.module.ts with sales/login public and everything else behind
SalesAuthGuard.

Deliverable: sales login page + device management page (WDMS sync, assign,
activate/block, school-wise view) — clickable and testable locally after this
phase. Follow the New Module Checklist and naming conventions in CLAUDE.md.
```

### Phase 6 (the big one — consider splitting further if the plan gets too large)
```
Read CLAUDE.md fully. Create a detailed plan for the attendance sync
infrastructure — this is the core Attendance module:
1. A WDMS API client using token-based auth only (static WDMS_TOKEN env var
   first, falling back to POST /api/jwt-api-token-auth/ with a cached token).
   Single cloud WDMS instance, requests filtered by company UUID, all list
   endpoints (terminals/transactions) fetched with full pagination — never
   assume a single page.
2. Two BullMQ queues — "attendance-sync" (pulls raw punches from WDMS's
   GET /iclock/api/transactions/, paginated, bulk-inserted into a new PunchLog
   collection with a unique punchHash for idempotent dedupe) and
   "attendance-reconcile" (computes/updates a DailyAttendance collection per
   person per date, comparing against AttendanceRule/Roster, Holiday, and Leave
   data, supporting multiple in/out punches per day, not just one).
3. Real BullMQ Workers consuming these queues (not cron spawning child
   processes) — cron only enqueues a staggered "sync school X" job per school
   across a configurable time window so 2000 schools don't sync simultaneously.
4. A manual attendance entry endpoint that writes directly into DailyAttendance
   with source: 'MANUAL' and an isOverridden flag.
5. Calendar-facing read endpoints: given a staff/student + month, return each
   date's status (Present/Absent/HalfDay/Late/Leave/Holiday) from DailyAttendance.
6. Attendance logic must branch by personType: student attendance is computed
   from AttendanceRule only (no Roster — students don't have shifts). Staff and
   teacher attendance is computed from AttendanceRule *and* Roster (Roster
   supplies the expected shift per person per date, per the monthly-snapshot
   lookup pattern in CLAUDE.md's Backend architecture section).

BullMQ reliability:
- One shared ioredis connection instance passed to every Queue and every
  Worker (both queues) — do not create a separate Redis connection per queue.
- Workers must handle SIGTERM for graceful shutdown (finish/requeue the
  in-flight job, close the Redis connection, exit cleanly) instead of dying
  mid-job.
- Set a `stalledInterval` on both Workers so a crashed/stuck job is detected
  and recovered rather than sitting stalled indefinitely.
- Queue defaults: `removeOnComplete: { count: 100 }`, `removeOnFail: { count:
  500 }` on both queues, so Redis doesn't accumulate unbounded job history.

Redis waste prevention:
- Job deduplication via `jobId`: sync jobs use `jobId: schoolId-YYYY-MM-DD`
  and reconcile jobs use `jobId: schoolId-YYYY-MM-DD` too, so BullMQ's
  built-in dedup-by-jobId means only one reconcile job can ever be queued per
  school+date no matter how many punches land for it — this is what makes the
  "debounce" in the two-speed pipeline actually work, no manual debounce timer
  needed.
- Before enqueuing a sync job, cron must skip any school with no active
  assigned device (query the `Device` collection for that schoolId first —
  don't enqueue work with nothing to sync) and any school already synced
  today (a new `SyncState` collection keyed by `schoolId + date`, checked
  before enqueue and marked after a successful sync run).

Two-speed pipeline, precisely:
- Fast path: PunchLog bulk insert (`insertMany({ordered:false})`) then an
  immediate Socket.io emit to that school's room — zero computation on this
  path, just the raw insert and the notify.
- Slow path: the reconcile queue is naturally debounced by the jobId dedup
  above (not a separate debounce timer) and should run on a steady cadence —
  every 5 minutes — rather than firing once per punch batch.

Reliability:
- Multi-document writes to DailyAttendance (or anywhere a partial write would
  leave inconsistent state) use a MongoDB transaction (session/startTransaction/
  commit/abort), matching the pattern already used by `CreateBulkStudentRecord`.
- Every error is logged (not silently swallowed) even where the outward
  response still follows the existing `catch → 500` convention — this
  background pipeline has no human watching a UI when something fails, so the
  log is the only record.
- Expose a worker health-check endpoint (e.g. queue depth / active-worker
  liveness) so a stalled pipeline is observable from outside.

Staggered cron:
- `SYNC_WINDOW_MINUTES` env var (default `120`) defines the rolling window
  sync jobs are spread across. Each active school's offset =
  `index × (SYNC_WINDOW_MINUTES × 60 ÷ totalActiveSchools)` seconds from the
  window's start, so 2000 schools land smoothly across the window instead of
  firing together.

Also plan a frontend calendar-view page (per staff/student, month picker,
day-by-day status) and a manual-entry form, so this is clickable and testable
locally after this phase — not just backend sync jobs running invisibly. Follow
the New Module Checklist and naming conventions. Keep Redis usage limited to
the BullMQ connection — no general-purpose caching.
```

### Phase 7
```
Read CLAUDE.md fully. Create a detailed plan for a real-time attendance
dashboard: Socket.io integration with one room per school, emitting a
lightweight event on every new PunchLog insert (fast path) so the admin UI
shows live in/out status immediately, independent of when the slower
DailyAttendance reconciliation job finishes. Include the frontend dashboard
page itself (live list of who's in/out, updating via the socket connection)
in the same plan, along with an optional short-TTL Redis cache (5-10 min) for
the per-school live in/out counts to avoid repeated heavy aggregation queries
during peak load. This should be clickable and testable locally after this
phase — e.g. by triggering a manual punch and watching it appear live.
```

### Phase 8
```
Read CLAUDE.md fully. Create a detailed plan for the Leave module.

LEAVE TYPE (admin configures): name, isPaid (boolean), maxDaysPerYear, applicableTo (enum: all/staff/teacher/student), status (active/inactive). Admin creates multiple types (Sick Leave, Casual Leave, etc.).

LEAVE REQUEST: staff/teacher/student applies with leaveTypeId, fromDate, toDate, reason. Status flow: Pending -> Approved/Rejected by admin. On approval, write DailyAttendance rows for each date in the range with status 'Leave', source 'MANUAL', isOverridden: true, leaveRequestId reference — so reconcile never overwrites them. On rejection, do nothing to DailyAttendance.

LEAVE BALANCE: track used days per person per leaveType per year (count from approved requests). Show remaining balance on the request form.

BUILD: backend (LeaveType model/controller/routes, LeaveRequest model/controller/routes) and frontend (Leave Types settings page under admin settings, Leave Requests page with apply/list/approve/reject tabs) together. Follow the New Module Checklist and naming conventions. Testable end-to-end locally after this phase.
```

### Phase 9
```
Read CLAUDE.md fully. Create a detailed plan for a Holiday module with two
parts: a reusable HolidayTemplate (a standard yearly holiday list that can be
cloned) and the school's actual Holiday calendar (created by cloning a template
and then editable per school). Also plan how a Holiday date should suppress
"Absent" status in DailyAttendance calculation. Build both backend and frontend
(template management page, and the school's holiday calendar page with a
"clone from template" action) together, following the New Module Checklist and
naming conventions, so it's testable locally after this phase.
```

### Phase 10
```
Read CLAUDE.md fully. Create a detailed plan for SalaryStructure (per-staff
baseline pay components) and a real Payroll generation flow: given a school +
staff + month, calculate presentDays, absentDays, and leaveDays from
DailyAttendance, apply SalaryStructure components and any attendance-based
deductions, and produce a DRAFT payroll record that can later be LOCKED. Build
both backend and frontend (salary structure form per staff, and a payroll
generate/list/view/lock page) together, following the New Module Checklist and
naming conventions, so it's testable end-to-end locally after this phase.
```

---

## 7. What NOT to copy from the reference project as-is

- Two different WDMS auth clients (Basic Auth + Token) — keep only the token one.
- BullMQ `Queue` objects defined but never consumed by a matching `Worker` — the
  reference project's actual sync still runs via `cron → exec(child process)`.
- Single in/out per day (`if (!day.outTime)` logic) — extend to multiple punches.
- Payroll `generate()` that hardcodes `absentDays: 0, netSalary: 0` — this needs
  real calculation against `DailyAttendance` + `SalaryStructure`.
- Duplicate `leave.js` / `leaveRequest.js` controllers doing the same thing.