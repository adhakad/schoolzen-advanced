# Frontend & Backend Folder Structure (locked)

## Backend — layer-first, under `backend/modules/`

```
backend/modules/
├── controllers/<module>/<page>.controller.js   — business logic, throws typed errors
├── models/<module>/<entity>.js                  — Mongoose schemas
├── routes/<module>/<page>.routes.js             — THIN: wires HTTP verb → controller fn, no logic
├── helpers/<module>/<module>.utils.js           — module-only shared logic
├── helpers/messages/<module>.messages.js        — success message builders (success.deleted('Class'))
├── helpers/errors/                              — shared, already built: 8 error classes + AppError
├── middleware/                                  — shared, already built: requestId, errorHandler
├── services/pdf/, services/excel/, services/notifications/, services/whatsapp/
│                                                 — cross-module CAPABILITIES, function-named not module-named
├── queues/ + workers/                           — background jobs (bulk import, device sync, PDF gen)
└── validators/<module>/                         — structured validation (e.g. FieldConfig-driven)
```

Rule: a route file NEVER contains logic — `router.get('/x', controller.getX)` only. A controller throws from `helpers/errors/`, never hand-writes `res.status(500).json('error string')`.

Rule: every new module's routes mount under `/api/v2/<module>/...` in the top-level route aggregator — never sharing a base path with a legacy route. This makes legacy-vs-new unambiguous at the routing layer itself (not just the folder layout), and a legacy route can never be accidentally shadowed by a new one.

## Frontend — components module-first, services/models layer-first

```
src/app/
├── shared/
│   ├── components/                — shared UI (page-shell, data-table, status-chip, confirm-modal...)
│   ├── services/<module>/<page>.service.ts     — ONE per page, lives HERE not in the component folder
│   ├── models/<module>/<page>.model.ts
│   ├── pipes/<module>/
│   └── guards/ interceptors/
└── <module>/<page>/               — COMPONENTS ONLY: .component.ts/.html/.css (plain CSS, never .scss)
```

Rule: a page component imports its service/model from `shared/services/<module>/` and `shared/models/<module>/` — it never defines its own `.service.ts` beside itself. This was a real mistake made once (Classes & Sections' first build put the service inside the component folder) and corrected — don't repeat it.

Rule: every component style file is plain `.css` — never `.scss`/`.sass`. No preprocessor is added to this project; nesting/variables aren't needed since the design system's CSS custom properties (`design-system.md`) already cover theming.

## Why layer-first, not module-first, for backend

Matches the REAL existing production codebase's actual structure (confirmed from the live project, not invented for this rebuild) — new module code has to slot into the same shape the rest of the app already uses.
