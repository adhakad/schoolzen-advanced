# Frontend & Backend Folder Structure — Module-Wise Organization

Status: **FINAL** — v1

As more modules get added over time (this package already has 13),
the codebase needs a structure that stays readable and navigable
without a map. The rule: **group by module first, by page second** —
never a flat `components/` or `routes/` folder with 35+ files mixed
together, and never a folder-per-technical-layer that scatters one
module's files across the whole project.

---

## Frontend (Angular) — feature-module folders, page subfolders inside

```
src/app/
├── shared/                          ← the component library from prompts/00
│   ├── components/
│   │   ├── page-shell/
│   │   ├── data-toolbar/
│   │   ├── status-chip/
│   │   ├── confirm-modal/
│   │   ├── data-table/
│   │   └── summary-strip/
│   ├── interceptors/
│   │   └── error.interceptor.ts
│   ├── models/
│   │   └── api-error.model.ts
│   └── global-error-handler.ts
│
├── academic-setup/                  ← one folder per MODULE
│   ├── classes-sections/            ← one subfolder per PAGE inside it
│   │   ├── classes-sections.component.ts
│   │   ├── classes-sections.component.html
│   │   └── classes-sections.component.scss
│   ├── subjects/
│   │   └── ...
│   ├── subject-groups/
│   │   └── ...
│   ├── academic-setup.module.ts     ← module-level routing + shared services for THIS module only
│   └── academic-setup.service.ts    ← API calls for this module's pages
│
├── student/
│   ├── manage-students/
│   ├── admission/
│   ├── class-promotion/
│   ├── student.module.ts
│   └── student.service.ts
│
├── payroll/
│   ├── generate-payroll/
│   ├── salary-payouts/
│   ├── salary-groups/
│   ├── assign-salary/
│   ├── payroll.module.ts
│   └── payroll.service.ts
│
├── fees/  attendance/  leave/  holiday/  examination/  certificates/
│   approvals/  settings/  staff/  dashboard/            (same pattern)
│
└── app-routing.module.ts            ← top-level route table only lists
                                        each module's routing module,
                                        never individual page routes directly
```

**Rule**: a page's component/template/style files live together in
their own subfolder named after the page (matching the `.html`
reference's filename in the planning package, e.g. `generate-payroll/`
matches `generate-payroll.html`) — never all `.component.ts` files
dumped flat into the module folder, and never split so that a single
page's `.ts`/`.html`/`.scss` live in three different top-level
folders (the old Angular-CLI-default `components/`, `templates/`,
`styles/` split). One page = one subfolder = everything about that
page.

**Module-level files** (the `.module.ts` and `.service.ts` at the
module folder's root, not inside any page subfolder) hold what's
genuinely shared across that module's OWN pages only — e.g. Payroll's
service holds the API calls Generate Payroll, Salary Payouts, Salary
Groups, and Assign Salary all need, but nothing Fees or Attendance
would ever import from it. Cross-module sharing only happens through
`shared/`, never by importing one module's service into another
module directly.

## Backend (Express + Mongoose) — matches the existing project structure

The real project (`schoolzen-advanced/backend`) already has this
top-level shape — `modules/` holds technical-layer folders
(`controllers`, `helpers`, `middleware`, `models`, `queues`, `routes`,
`services`, `sockets`, `validators`, `workers`) as siblings. **This
top-level layout stays exactly as it is — it is not being restructured
into module-first folders.** What changes is what goes INSIDE each of
those layer folders: a module-named subfolder per business module, so
a module's files stay grouped and identifiable even though the
top-level split is by technical layer, not by module.

```
backend/
├── config/
├── docs/
├── modules/
│   ├── controllers/
│   │   ├── academic-setup/
│   │   │   ├── classes-sections.controller.js
│   │   │   ├── subjects.controller.js
│   │   │   └── subject-groups.controller.js
│   │   ├── student/
│   │   │   ├── manage-students.controller.js
│   │   │   ├── admission.controller.js
│   │   │   └── class-promotion.controller.js
│   │   ├── payroll/
│   │   │   ├── generate-payroll.controller.js
│   │   │   ├── salary-payouts.controller.js
│   │   │   ├── salary-groups.controller.js
│   │   │   └── assign-salary.controller.js
│   │   └── fees/  attendance/  leave/  holiday/  examination/
│   │       certificates/  approvals/  settings/  staff/  (same pattern)
│   │
│   ├── models/
│   │   ├── academic-setup/
│   │   │   ├── Class.js
│   │   │   ├── Subject.js
│   │   │   └── SubjectGroup.js
│   │   ├── student/
│   │   │   ├── Student.js
│   │   │   └── StudentEnrollment.js
│   │   ├── payroll/
│   │   │   ├── SalaryGroup.js
│   │   │   ├── StaffSalaryAssignment.js
│   │   │   ├── PayrollRun.js
│   │   │   └── PayrollPayment.js
│   │   └── ... (one subfolder per module)
│   │
│   ├── routes/
│   │   ├── academic-setup/
│   │   │   ├── classes-sections.routes.js
│   │   │   ├── subjects.routes.js
│   │   │   └── subject-groups.routes.js
│   │   ├── payroll/
│   │   │   ├── generate-payroll.routes.js
│   │   │   ├── salary-payouts.routes.js
│   │   │   ├── salary-groups.routes.js
│   │   │   └── assign-salary.routes.js
│   │   └── ... (one subfolder per module)
│   │
│   ├── helpers/
│   │   ├── payroll/
│   │   │   └── payroll.utils.js       ← e.g. gross/deduction calculation
│   │   │                                  shared by generate-payroll and
│   │   │                                  salary-payouts controllers
│   │   ├── student/
│   │   │   └── student.utils.js       ← e.g. enrollment-lookup shared by
│   │   │                                  all three Student controllers
│   │   └── ... (one subfolder per module that actually needs one — not
│   │             every module will)
│   │
│   ├── middleware/
│   │   ├── requestId.js               ← cross-cutting, no module subfolder
│   │   ├── errorHandler.js            ← (see error-handling architecture)
│   │   └── auth/
│   │       └── permission.middleware.js  ← R3 permission checks, its own
│   │                                        subfolder since it's substantial
│   │
│   ├── services/                      ← integrations, not business logic
│   │   ├── whatsapp/
│   │   │   └── whatsapp.service.js    ← Fee Reminder's WhatsApp send
│   │   ├── cloudinary/
│   │   │   └── cloudinary.service.js  ← photo/document uploads
│   │   └── notifications/
│   │       └── notification.service.js ← the unified notification
│   │                                       dispatcher (see additional-
│   │                                       technical-considerations.md)
│   │
│   ├── queues/                        ← bullmq job definitions (see
│   │   │                                  additional-technical-
│   │   │                                  considerations.md's job-queue note)
│   │   ├── excel-import.queue.js
│   │   ├── whatsapp-bulk-send.queue.js
│   │   └── pdf-generation.queue.js
│   │
│   ├── workers/                       ← the processors that consume
│   │   │                                  the queues above
│   │   ├── excel-import.worker.js
│   │   ├── whatsapp-bulk-send.worker.js
│   │   └── pdf-generation.worker.js
│   │
│   ├── validators/
│   │   ├── student/
│   │   │   └── field-config.validator.js  ← the structured, non-free-text
│   │   │                                     validation rule engine from
│   │   │                                     Settings/Admission Form Fields
│   │   └── ... (one subfolder per module with its own validation rules)
│   │
│   └── sockets/                       ← WebSocket/real-time (e.g. live
│       └── attendance/                    attendance punches on Overview)
│           └── attendance.socket.js
│
├── node_modules/
├── .env
├── .gitignore
├── app.js                             ← mounts middleware + every module's
│                                          routes, in one place
├── cron-job.js                        ← scheduled jobs (e.g. archival job
│                                          from database-architecture notes)
├── package.json
├── routes.js                          ← the single top-level route
│                                          aggregator: imports every
│                                          modules/routes/<module>/*.routes.js
│                                          file and mounts it under app.js
└── worker.js                          ← boots the queue workers
```

**Rule — group by module WITHIN each layer folder, never flatten**: a
new module (say, module 14 next year) gets one new subfolder added to
`controllers/`, one to `models/`, one to `routes/`, and a `helpers/`
subfolder only if it actually needs shared logic across its own pages
— never a bare file dropped directly into `controllers/` alongside 30
other modules' files with nothing distinguishing which module it
belongs to.

**Rule — routes stay thin, controllers hold the logic**: a file in
`routes/<module>/*.routes.js` only declares
`router.get('/...', controller.list)` style wiring — no business
logic, no direct Mongoose calls. The matching file in
`controllers/<module>/` (same page name) holds the actual handler
functions.

**Rule — a module-level helper lives in `helpers/<module>/`, not a
project-wide shared location**: if two or more pages in the SAME
module need the same function (Payroll's gross-salary calculation
used by both Generate Payroll and Salary Payouts), it goes in that
module's own subfolder under `helpers/` — never duplicated into each
controller, and never promoted to a project-wide shared location
unless a DIFFERENT module also genuinely needs it.

**Approvals is the one exception worth naming**: it has no
`models/approvals/` subfolder (it's a computed `$unionWith`
aggregation over other modules' collections, per
`../approvals/requests.md`) — just `controllers/approvals/` and
`routes/approvals/`.

## Why this matters as more modules get added

A flat structure (`controllers/`, `routes/`, `models/` each holding
35+ files with no module grouping) becomes unnavigable well before
module 13 — you cannot tell which files belong together without
reading each one. Module-named subfolders inside each layer mean: to
work on Fees, you look in exactly one subfolder per layer
(`controllers/fees/`, `models/fees/`, `routes/fees/`) and see
everything relevant there, nothing more. Adding module 14 next year
means adding one new sibling subfolder inside each existing layer
folder — it never requires reorganizing anything that already exists,
and it never requires changing the project's actual top-level
structure.
