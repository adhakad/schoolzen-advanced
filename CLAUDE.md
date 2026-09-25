# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Schoolzen (package name `schooliya`, Angular project name `zoclass`) is a multi-tenant school-management SaaS: an Angular 14 frontend (`src/`) talking to a separate Express/MongoDB backend (`backend/`). There are two authenticated user types — **admin** (school owner/staff) and **teacher** — each with its own login, guard, interceptor, and JWT auth flow, plus public marketing pages (home, pricing, features, contact, etc.).

**This describes the EXISTING codebase (`/v1`-equivalent, i.e. everything outside `/v2` and `/api/v2/`).** A new, planned rebuild (`/v2` frontend, `/api/v2/` backend) is specified separately — see "v2 — new build, planning package" below. Do not apply v2's conventions to existing code, and do not apply this file's legacy conventions to new v2 code.

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

## Architecture (existing codebase)

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
- **Monthly-snapshot pattern for per-person, per-day data** (established by `Roster`, follow it for anything else with the same shape): instead of one document per `(person, day)`, store **one document per `(adminId, personType, personId, year, month)`** with a `days: Map<"YYYY-MM-DD", value>` field (`modules/models/roster.js`). This keeps a whole month's worth of a person's data in a single doc — one `findOneAndUpdate` per cell edit (`$set`/`$unset` on `days.<dateKey>`, atomic, no full-doc read), and one scan per `(school, month)` for a full grid rather than 30+ per-day rows. `month` is stored **1-12** (August = `8`), never JS's 0-11 — parse it from the `"YYYY-MM-DD"` string directly via `parseDateKey()` (`modules/helpers/date-only.js`), never through `Date` arithmetic, so nothing can drift a day or a month. Any code reading this shape should call `parseDateKey(date)` to get `{ year, month, dateKey }`, run a single `findOne({ adminId, personType, personId, year, month })`, and read `days[dateKey]` off the `.lean()`-ed result — **O(1) per lookup, never a per-day query**. See `modules/services/roster-lookup.js` (`getExpectedShift` / `getExpectedShiftsForDate`) for the reference implementation, including the batched form that resolves a whole school-day in two queries regardless of headcount.

## File & Folder Naming Conventions (existing codebase)

Traced from `class`/`student`/`class-subject` (backend) and `class`/`admin-student-fees-structure`/`teacher-student-fees`/`whatsapp-message` (frontend). Use these exactly when scaffolding a new resource in the EXISTING codebase — the "New Module Checklist" below relies on them. (v2 has its own, different conventions — see below.)

### Backend (`backend/modules/`)

- **File names**: kebab-case, singular resource name, `.js` — `student.js`, `academic-session.js`, `fees-structure.js`, `admit-card-structure.js`, `issued-transfer-certificate.js`.
- **Same base name across layers**: one resource reuses its exact filename in every layer it needs — `models/student.js`, `validators/student.js`, `controllers/student.js`, `routes/student.js`.
- **Grouped/nested resources**: get a kebab-case (or plain lowercase) group subfolder mirrored across whichever of `models/`, `controllers/`, `routes/` apply — `users/admin-user.js`, `users/teacher-user.js`, `devices/attendance-device.js`, `whatsapp-message/message-wallet.js`. Not every layer needs a file in the group — only add what the resource actually needs.
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

## New Module Checklist (existing codebase)

This is the exact file order used for existing resources (traced from `class` and `student`) to add a new resource end-to-end in the EXISTING codebase. Follow this order — later files depend on earlier ones existing. (For v2, see the planning package's own build order instead.)

### Backend (`backend/`), for a new resource `<res>`

1. **Model** — `modules/models/<res>.js`: `mongoose.model('<res>', { ...fields })` inline schema literal, manual `createdAt: { type: Date, default: Date.now }`, `module.exports = <Res>Model`. (Nested resources go in `modules/models/<group>/<res>.js` instead.)
2. **Validator** — `modules/validators/<res>.js`: Joi object(s), typically `create<Res>Schema` and, for partial updates, `update<Res>Schema = create<Res>Schema.fork(Object.keys(create<Res>Schema.describe().keys), (schema) => schema.optional())`. Export both. Skip this file only if the resource is as trivial as `class` (no file upload, few fields) and validate inline in the controller instead — but prefer adding it for anything with >3 fields.
3. **Controller** — `modules/controllers/<res>.js`: `'use strict'`, require the model (and any other models it touches), define each handler as `let`/`const` async `(req, res, next) => {...}` wrapped in try/catch (`catch` → `res.status(500).json('Internal Server Error!')`), then a single `module.exports = { HandlerOne, HandlerTwo, ... }` at the bottom. Standard handler set for a full CRUD resource: `count<Res>`, `Get<Res>Pagination`, `GetAll<Res>`, `GetSingle<Res>`, `Create<Res>`, `Update<Res>`, `Delete<Res>`.
4. **Middleware wiring (route file)** — `modules/routes/<res>.js`: `'use strict'`, `const router = express.Router();`, destructure the needed controller functions from step 3, then declare routes in this conventional order: `GET /<res>-count`, `POST /<res>-pagination`, `GET /` (list all), `GET /:id`, `POST /` (create — wrap in the `fileUpload.<field>.single(...)` + `validate(create<Res>Schema)` middleware chain if the resource accepts a file), `PUT /:id` (update, same upload/validate wrapping with `update<Res>Schema`), `DELETE /:id`. End with `module.exports = router;`. If the resource needs admin/teacher auth, add `require('../middleware/admin-auth').isAdminAuth` (or `isTeacherAuth`) as a route-level middleware before the controller function.
5. **Mount the route** — `backend/routes.js`: add one line, `app.use('/v1/<res>', require('./modules/routes/<res>'));`, in the same alphabetical/grouping-by-feature order as the surrounding entries. Forgetting this step means the model/controller/routes exist but are unreachable.
6. *(Optional, file upload)* — add a Multer config to `modules/helpers/file-upload.js` following the existing `studentImage` pattern.
7. *(Optional, scheduled job)* — add a `modules/services/cron-<res>-service.js` and schedule it from `backend/cron-job.js`.

### Frontend (`src/app/`), for the same resource `<res>`

1. **Model** — `src/app/modal/<res>.model.ts` (or `.modal.ts` — match sibling resources): a plain `export interface <Res> { _id: String, ...fields }` mirroring the Mongoose schema fields the frontend actually reads/writes.
2. **Service** — `src/app/services/<res>.service.ts`: `@Injectable({ providedIn: 'root' })`, `url = \`${environment.API_URL}/v1/<res>\``, inject `HttpClient`, and add one thin method per backend route from step 4 above.
3. **Feature module directory** — create `src/app/pages/admin/<res>/` (or `pages/teacher/<res>/`) containing `<res>.component.ts/html/css`, `<res>-routing.module.ts`, `<res>.module.ts` (`imports: [CommonModule, <Res>RoutingModule, AdminSharedModule]` or `TeacherSharedModule`).
4. **Wire the route** — `src/app/app-routing.module.ts`: add one lazy route entry, e.g. `{ path: 'admin/<res>', loadChildren: () => import('src/app/pages/admin/<res>/<res>.module').then((m) => m.<Res>Module), canActivate: [AdminAuthGuard] }`.
5. *(Optional)* — add a sidebar nav entry under `pages/admin/common` (or the teacher equivalent).

### Quick sanity check after scaffolding

- Backend reachable: resource appears under `backend/routes.js` → hits `modules/routes/<res>.js` → controller → model.
- Frontend reachable: `app-routing.module.ts` entry → `<res>.module.ts` → `<res>-routing.module.ts` → component → service → matches the `/v1/<res>` URL mounted above.
- If either registration point (`routes.js` on the backend, `app-routing.module.ts` on the frontend) is skipped, every other file can be correct and the module will still 404.

## Code Style & Conventions (existing codebase)

These reflect actual patterns in the codebase (not aspirational rules) — match them when editing nearby code rather than introducing a new style.

### Frontend (Angular components/services)

- **Component state**: all fields are declared at the top of the class with explicit types and inline defaults (`showModal: boolean = false;`), not grouped into view-model objects. Modal/mode flags follow a consistent naming triad: `showModal`, `updateMode`, `deleteMode`, `deleteById`, paired with `errorCheck: Boolean` + `errorMsg: String` for surfacing API errors instead of throwing.
- **Double-submit guard**: mutating actions check/set an `isClick` boolean at the start and reset it in both the success and error callback. Apply this to any new create/update/delete handler.
- **CRUD method naming**: `add<Entity>Model()` / `update<Entity>Model()` / `delete<Entity>Model()` open the modal and seed state; a single `<entity>AddUpdate()` method branches on `updateMode` to call either the create or update service method; `<entity>Delete(id)` calls the delete service method. A shared `successDone()` closes the modal, clears messages, refetches the list, and shows a delayed (`setTimeout`, 500–1000ms) `ToastrService` success toast.
- **Subscriptions**: `.subscribe((res) => {...}, err => {...})` using the legacy two-callback form, with an `if (res) {...}` truthy check inside the success callback rather than branching on HTTP status.
- **Pagination**: list-fetch methods wrap the `.subscribe` call in `new Promise((resolve) => {...})`, build a `params` object with `filters`/`page`/`limit`, and push `{ type: 'page-init', page, totalTableRecords }` through a `paginationValues: Subject<any>` consumed by the shared pagination component.
- **Typing**: components and services use `any` liberally for API request/response payloads even though the project is TypeScript; only enum-like constants and form controls tend to be typed. Don't feel obligated to introduce strict interfaces where the surrounding code doesn't have them — but do type genuinely new, self-contained logic where it's cheap.
- **Services**: one class per backend resource, injected `HttpClient`, a single `url` field built from `environment.API_URL`, thin methods that just shape the request. Requests with a possible file field build a `FormData` conditionally; otherwise send the raw object.
- **Imports**: Angular/RxJS imports first, then absolute `src/app/...` imports for services/models.
- **Comments**: sparse overall; when present they're short, imperative, and mark intent or sections. Avoid narrating obvious lines; comment only non-obvious business rules.

### Backend (Express/Mongoose)

- **File header**: every module starts with `'use strict';`, followed by `require`s (Node/npm packages first, then local `../models/...`, `../services/...`, `../helpers/...`).
- **Controllers**: exported as a `module.exports = { ... }` object at the bottom of the file listing every handler; handlers are declared individually as `let`/`const` async arrow functions above it. Simple CRUD/count handlers use PascalCase-ish action names while trivial counters stay camelCase — follow whichever style matches sibling handlers in the same file.
- **Error handling**: every handler wraps its body in `try { ... } catch (error) { return res.status(500).json('Internal Server Error!'); }` — errors are swallowed and never rethrown. Business-rule failures return `res.status(400/404).json('<message>!')` as a **plain string**, not a JSON object — match this in older-style routes. Some newer handlers instead return `{ errorMsg: '...' }` / `{ successMsg: '...' }` objects; check the specific resource's existing pattern before adding a new endpoint to it.
- **Validation-in-controller**: rather than centralizing all rules in Joi schemas, controllers re-check uniqueness/business constraints inline with sequential `findOne` existence checks, each returning early with a specific message on conflict.
- **Cleanup on failure**: routes that accept an uploaded file use a local `handleError(statusCode, message)` closure that deletes the temp file (`fs.unlinkSync`) before responding.
- **Models**: defined with `mongoose.model('name', { ...inline schema literal... })` — not `new mongoose.Schema(...)` — with a manual `createdAt: { type: Date, default: Date.now }` field instead of `{ timestamps: true }`. Foreign keys (`adminId`, `studentId`) are plain `String`, not `mongoose.Schema.Types.ObjectId` refs.
- **Parallelism**: independent lookups/deletes are batched with `Promise.all([...])`; multi-document writes that must be atomic use an explicit Mongoose session/transaction.
- **Middleware factories**: cross-cutting concerns are implemented as functions returning an Express middleware, e.g. `validate(schema)` in `modules/middleware/validate.js`.

---

## v2 — new build, planning package

**A new build is planned under `/v2` (frontend) and `/api/v2/` (backend), fully specified in `docs/schoolzen-planning/`.** This is not an extension of the conventions above — it's a deliberately different, from-scratch design for new modules going forward. The two live side by side: existing code under this file's conventions is not touched or migrated as part of v2 work.

**Before starting ANY v2 work**: read `docs/schoolzen-planning/README.md` (module map, build order, locked global rules) and every file under `docs/schoolzen-planning/v1/_core/` (state management, database design principles, folder structure, design system + its Responsive section, error handling, additional technical considerations) — these are cross-cutting decisions every v2 module follows.

**What's different in v2 — don't carry the old pattern over by habit:**

| Existing codebase (this file, above) | v2 (`docs/schoolzen-planning/`) |
|---|---|
| `schoolId` as the tenant key | `adminId` — first in every compound index (ESR rule) |
| Separate `teacher` collection + `TeacherAuthGuard`/`isTeacherAuth` | One `Staff` collection, unified login for every role, guarded by permissions (`Role`/`RoleAssignment`), not a separate auth stack per role type |
| Ad-hoc `xPermission: {status, classes}` blocks per feature | `Role{permissions:[{module,canView,canEdit}]}` + `RoleAssignment{staffId,roleId,classId,sectionId}` — one coherent model, class-scoped where needed |
| No formal state-management pattern | Angular `signal()`/`computed()` via `ShellContextService` + per-module services — no NgRx |
| Plain CSS + Angular Material + Bootstrap 5 (full framework) loaded globally | Plain CSS only, **no SCSS/SASS**; Bootstrap Icons only (`bi bi-*`) — no Bootstrap grid/utility framework; custom design-system components (`.dd`, cards, chips) |
| No formal error-code contract | Backend never translates — always sends a stable `code` + English `message`; frontend resolves `code` → locale string via `@ngx-translate/core`; backend-side translation happens only for outbound Notifications (WhatsApp/Email/SMS), using the recipient's `preferredLanguage` |
| Redis not used | Redis strictly for BullMQ queue backing + optional short-TTL live-status/dashboard cache — via a centralized `CacheService`, never ad-hoc per module |
| No responsive breakpoint spec | Standard breakpoints (Bootstrap/Material/Tailwind scale): 576 / 768 / 992 / 1200 / 1400 — 3 real `@media` rules (767, 991, 1400), applied to a small set of shared patterns (sidebar, toolbar, tables, layout-row, modals, content max-width) |
| `routes.js` mounts under `/v1/<resource>` | New routes mount under `/api/v2/<resource>` |

**When in doubt on a v2 file**: the planning package's own `.md` file for that module (`docs/schoolzen-planning/v1/<module>/<page>.md`) is authoritative over anything implied by this file's existing-codebase conventions above.

## What NOT to copy from the old Attendance & Payroll reference plan

An earlier planning pass (Phases 1-10: Department/Designation → Staff+BiometricMapping → AttendanceRule → Shift+Roster → Device/Sales → Attendance sync → Socket.io → Leave → Holiday → Payroll) used `schoolId`, a separate `AttendanceRule` model, and a Teacher/Staff split — **this has been fully superseded by `docs/schoolzen-planning/`** and should not be used as a build reference anymore. If any old notes or prompts referencing that phase plan turn up, treat `docs/schoolzen-planning/` as the current source of truth instead.