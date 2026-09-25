# Schoolzen

Schoolzen (package name `schooliya`, Angular project name `zoclass`) is a multi-tenant school-management SaaS: an Angular 14 frontend (`src/`) talking to a separate Express/MongoDB backend (`backend/`). There are two authenticated user types — **admin** (school owner/staff) and **teacher** — each with its own login, guard, interceptor, and JWT auth flow, plus public marketing pages (home, pricing, features, contact, etc.).

**A new build (v2) is planned and fully specified separately — see "v2 — what's coming" below.** Everything in this README describes the current, existing codebase.

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
- **Services** (`services/*.service.ts`): one HTTP service per backend resource, each built as `url = \`${environment.API_URL}/v1/<resource>\`` and thin wrapper methods around `HttpClient`. Multipart requests (e.g. student photo upload) are built by switching to `FormData` when a file field is present, otherwise sending plain JSON — see `services/student.service.ts` for the pattern.
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
- **Monthly-snapshot pattern for per-person, per-day data** (established by `Roster`, follow it for anything else with the same shape): instead of one document per `(person, day)`, store one document per `(adminId, personType, personId, year, month)` with a `days: Map<"YYYY-MM-DD", value>` field. `month` is stored 1-12 (never JS's 0-11) — parsed via `parseDateKey()` (`modules/helpers/date-only.js`), never through `Date` arithmetic. See `modules/services/roster-lookup.js` for the reference implementation.

## File & Folder Naming Conventions

### Backend (`backend/modules/`)

- **File names**: kebab-case, singular resource name, `.js` — `student.js`, `academic-session.js`, `fees-structure.js`.
- **Same base name across layers**: `models/student.js`, `validators/student.js`, `controllers/student.js`, `routes/student.js`.
- **Grouped/nested resources**: a kebab-case group subfolder mirrored across whichever of `models/`, `controllers/`, `routes/` apply — `users/admin-user.js`, `devices/attendance-device.js`.
- **Mongoose model export**: PascalCase + `Model` suffix — `StudentModel`, `ClassModel`.
- **Controller handler names**: PascalCase verb+resource — `CreateStudent`, `UpdateStudent`, `DeleteStudent`; plain camelCase only for trivial `count<Res>` handlers.
- **Validator exports**: `create<Res>Schema` and `update<Res>Schema`.

### Frontend (`src/app/`)

- **Feature page folders**: kebab-case. Admin side keeps a short unprefixed name (`class`, `student`); teacher side prefixes the same entity with `teacher-` (`teacher-student`).
- **Inside a feature folder**: `<name>.component.ts/html/css`, `<name>-routing.module.ts`, `<name>.module.ts`.
- **Services**: kebab-case + `.service.ts`, class `<PascalName>Service`.
- **Guards/interceptors**: `<role>-auth.guard.ts` → `<Role>AuthGuard`.
- **Models** (`src/app/modal/`): kebab-case + `.model.ts`, exporting a PascalCase `interface <Res>`.
- **Nesting depth**: page folders are flat — one level under `pages/admin/` or `pages/teacher/`.

## New Module Checklist

**Backend**, for a new resource `<res>`: Model → Validator → Controller → Route (mounted in `routes.js`) → (optional) file-upload config → (optional) cron service.

**Frontend**, for the same resource: Model → Service → Feature module (`component/routing/module`) → route wired into `app-routing.module.ts` → (optional) sidebar nav entry.

**Sanity check**: backend reachable via `routes.js` → route → controller → model; frontend reachable via `app-routing.module.ts` → module → routing → component → service. Skipping either registration point means everything else can be correct and the module still 404s.

## Code Style & Conventions

- **Frontend**: explicit typed fields with inline defaults, not view-model objects; `showModal`/`updateMode`/`deleteMode` naming triad; `isClick` double-submit guard on every mutating action; legacy two-callback `.subscribe()` form; services are thin `HttpClient` wrappers, one per backend resource.
- **Backend**: `'use strict'` + grouped requires; controllers export a `module.exports = {...}` object of individually-declared handlers; every handler wrapped in `try/catch` (`catch` → `500` "Internal Server Error!"); business-rule failures return a **plain string** message (`res.status(400).json('...')`) in older-style routes — check the specific resource before assuming the shape; Mongoose models use inline schema literals with manual `createdAt`, and string (not ObjectId) foreign keys.

See `CLAUDE.md` for the complete version of these conventions, including the exceptions/known-inconsistencies Claude Code should not pattern-match off.

---

## v2 — what's coming

A new build is planned under `/v2` (frontend) and `/api/v2/` (backend) — fully specified in `docs/schoolzen-planning/`. It's a deliberately different, from-scratch design (unified staff/RBAC login instead of separate admin/teacher auth, `adminId` instead of `schoolId`, a formal state-management and error-code contract, a documented design system with a responsive breakpoint spec, and more) — it does not touch or migrate the existing codebase described above. See `CLAUDE.md`'s "v2 — new build, planning package" section for the full comparison and where to start.