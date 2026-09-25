# Kickoff — v2 build start

Read `README.md` and `CLAUDE.md` fully first — CLAUDE.md's "v2 — new build,
planning package" section explains how this v2 work relates to the existing
codebase.

Then read `docs/schoolzen-planning/README.md` fully — it has the module map,
build order, and locked global rules for this v2 build (Angular frontend
under `/v2`, backend routes under `/api/v2/`).

Then read every file under `docs/schoolzen-planning/v1/_core/`:
- `state-management.md`
- `database-design-principles.md`
- `additional-technical-considerations.md`
- `frontend-backend-folder-structure.md`
- `design-system.md`
- `performance-principles.md`
- `error-handling/README.md` and its `backend/` + `frontend/` files

These are cross-cutting decisions that apply to every module below — read
them before touching any module-specific file.

Reconcile with the existing codebase: where this planning package's
decisions differ from CLAUDE.md's existing conventions (naming, folder
structure, auth, error handling — CLAUDE.md's own comparison table lists
these), the planning package's decisions win for anything under `/v2` and
`/api/v2/`. The existing legacy code under CLAUDE.md's conventions is not
touched or migrated as part of this.

**Do not start building yet.**

1. First, produce a short summary of `docs/schoolzen-planning/README.md`'s
   module build order and confirm which module we're starting with.
2. Then, in Plan Mode, produce a detailed plan for that first module only —
   read its own `.md` file under `docs/schoolzen-planning/v1/<module>/`
   plus its reference `.html`.
3. Don't build anything beyond that one module until I review and approve
   the plan.
