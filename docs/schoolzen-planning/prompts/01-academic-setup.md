# Build: Academic Setup module (all 3 pages)

Build all 3 pages together — schema, API, frontend — as one piece of work. No dependency on other modules; build this first.

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md` — the one, final design system.
2. `docs/schoolzen-planning/v1/academic-setup/classes-sections.{html,md}`
3. `docs/schoolzen-planning/v1/academic-setup/subjects.{html,md}`
4. `docs/schoolzen-planning/v1/academic-setup/subject-groups.{html,md}`

Read anything else you genuinely need as you go (other docs, existing code) — don't restrict yourself to only these files, but don't read unrelated modules unless something here specifically requires it.

**If Classes & Sections was already attempted before**: treat it as a rough draft only — read the current `classes-sections.html` fully and rebuild to match it exactly rather than patching the old attempt. Multiple earlier fix rounds on this specific page went wrong because fixes were guessed instead of read from the actual reference — don't repeat that; read fully before touching code.

## Build

**Backend** — `backend/modules/`:
- `models/academic-setup/class.js`, `subject.js`, `subject-group.js`
- `controllers/academic-setup/classes-sections.controller.js`, `subjects.controller.js`, `subject-groups.controller.js`
- matching `routes/academic-setup/*.routes.js`

**Frontend** — `src/app/`:
- `academic-setup/classes-sections/`, `academic-setup/subjects/`, `academic-setup/subject-groups/` (component per page — component files ONLY here)
- `shared/services/academic-setup/*.service.ts` (one per page — services live here, NEVER inside the component folder)
- `shared/models/academic-setup/*.model.ts`

## Design rules (from design-system.md — check every one before calling a page done)
- Zero native `<select>` anywhere — use the `.dd` component exactly as shown in the reference HTML.
- Bootstrap Icons only (`bi bi-*`) — no inline SVG.
- `.dd-label` must have `white-space:nowrap;overflow:hidden;text-overflow:ellipsis` — never let a label wrap.
- Match EACH page's own toolbar row structure exactly as its own `.html` shows it — Classes & Sections and Subjects each use a single toolbar row; Subject Groups uses two rows (row1: search+buttons, row2: Class/Stream filters). Don't force one page's shape onto another.
- Any delete with real dependent data uses the type-to-confirm pattern (`confirm-overlay`/`confirm-modal`, typing DELETE to enable the button) exactly as shown.
- `.col-side` (stats card + a secondary tips/activity card) appears on all 3 pages — same CSS classes, same structure.

## Schema shapes
- **Class**: `adminId`, `class`, `hasStreams` (bool). `sections:[{name}]` if false; `streams:[{name, sections:[{name}]}]` if true — never both. Unique `(adminId, class)`.
- **Subject**: `adminId`, `name`, `type:'core'|'elective'`, `status:'active'|'inactive'`. Unique `(adminId, name)`. Referenced by ID elsewhere, never copied.
- **SubjectGroup**: `adminId`, `classId`, `streamId` (nullable), `name`, `subjectIds:[ref]`. Index `(adminId, classId, streamId)`.

## Known anti-patterns to avoid (found in this codebase's legacy pages)
- No inline `style="..."` attributes.
- No client-side joins across separate API calls — one backend aggregation.
- No duplicated logic (e.g. a class-number-to-suffix conversion) copy-pasted per component — one shared function/pipe.
- No N+1 queries for anything showing a count per row.

## When done
Show all 3 pages running next to their own `.html` reference. Confirm zero native selects, and that Subject Groups' subject checklist genuinely pulls live from the Subjects list (not a hardcoded copy).
