# Handing This Off to Claude Code — Implementation Strategy

Status: **Approved** — v1

This design package (R5: Dashboard UI/UX redesign, per the refactor
plan) is now feature-complete across all 12 modules. This document is
for whoever runs Claude Code against the legacy MEAN codebase to build
it — read it before starting the first module.

---

## Module-wise, not phase-wise — and here's why

**Module-wise** means: pick one module, build its schema + API routes
+ frontend pages + tests, verify it end-to-end against this package's
`.html`/`.md` references, merge it, then move to the next module.

**Phase-wise** would mean: build every module's backend first, then
every module's frontend, then test everything at the end.

Module-wise is the right call here for one concrete reason: **phase-
wise means nothing is actually verifiable until the very end.** With
12 modules and a legacy app that must keep working for real schools
throughout, a single end-of-project integration pass is where subtle
mismatches (a field renamed in one module's schema that another
module's UI still expects) surface latest and cost the most to fix.
Module-wise gives a working, testable, mergeable increment every time
— and if something goes wrong, it's isolated to the module just built,
not entangled with 11 others in progress.

## Build order — matches dependency, not file-listing order

Follow the README's module map order exactly, because each module
reads data the previous ones create:

1. **Academic Setup** — Class/Stream/Section/Subject/Subject Group.
   Nearly every other module's filters read this; build it first or
   every later module has nothing real to filter against.
2. **Student** — Manage Students, Admission, Class Promotion. Depends
   on Academic Setup for Class/Stream/Section options.
3. **Staff** — Manage Staff, Departments, Designations. Independent of
   Student; can run in parallel with it if two people are working, but
   sequential is fine too.
4. **Attendance** — depends on Student (roster) and Staff (shift
   assignment).
5. **Leave** — depends on Staff and Student (who's applying).
6. **Holiday** — depends on Academic Setup (class-level assignment)
   and Staff (per-staff assignment).
7. **Payroll** — depends on Staff, Attendance (for the attendance
   summary in payroll runs).
8. **Fees** — depends on Student, Academic Setup (Class+Stream for Fee
   Structure).
9. **Examination** — depends on Academic Setup (Subjects) and Student
   (whose results are entered).
10. **Certificates** — depends on Student and, loosely, Examination
    (a TC's "qualified for promotion" optional field).
11. **Approvals** — depends on Leave existing (it's a computed view
    over Leave requests, per `database-architecture` §10 if that
    document is restored — otherwise: build this AFTER Leave, never
    before, since it has nothing to aggregate until Leave exists).
12. **Settings** (Admission Form Fields) — technically only depends on
    Student, but build it LAST anyway: it changes Student's form/
    table/Excel behavior, so it's safest to bolt onto a Student module
    that's already stable and tested, not while Student itself is
    still being built.

## Never break existing code — the isolation rules

- **New collections, not modified ones.** Where a new module's schema
  genuinely replaces old legacy fields (e.g. the R1 Staff+Teacher
  unification), that migration is its own separate, explicitly-
  reviewed step — never bundled silently into an unrelated module's
  work. Building Fees should never require touching the legacy Staff
  schema, for instance.
- **New routes, not rewritten ones**, at least at first. Stand up each
  module's new API routes and pages alongside the legacy ones (e.g.
  under a `/v2/` prefix or a feature flag) rather than replacing the
  old route in place. Only cut the old route over once the new page
  has been checked against its `.html` reference and its `.md` spec.
  This means the live legacy app never has a half-finished module
  visible to real users mid-build.
- **One module, one branch, one Claude Code task.** Point Claude Code
  at a single module's folder (its `.html` files and `.md` docs) per
  session — don't ask it to "build everything" in one pass. A focused
  task with a small, well-defined spec produces code Claude Code (and
  a human reviewer) can actually verify; a sprawling multi-module task
  invites it to touch files outside the intended scope without anyone
  noticing until review.
- **The shared component library is the one exception** — build the
  reusable Angular components (`<app-page-shell>`, `<app-data-toolbar>`,
  `<app-status-chip>`, `<app-confirm-modal>`, `<app-data-table>`, etc.,
  per the R5 "Reusable Angular Components" list) ONCE, early, matching
  this package's shared CSS classes (`.sw-toolbar`, `.sw-select-pill`,
  `.sw-row`, `.status-chip`, etc.) exactly. Every module then consumes
  these components rather than re-implementing the toolbar/table/modal
  pattern from scratch — this is what keeps 12 modules visually and
  behaviorally identical without needing 12 separate design reviews.
  Changing a shared component after modules start consuming it is a
  breaking change to everything built so far — version it deliberately
  (e.g. don't change `<app-status-chip>`'s prop shape once 3 modules
  use it; add a new prop instead of repurposing an old one).

## Per-module checklist (repeat for each of the 12)

1. Read that module's `.md` file(s) in full — they state the "why,"
   not just the "what," and Claude Code should implement against the
   reasoning, not just copy the HTML structure literally.
2. Build schema/API additively (new collections/routes only, per the
   isolation rules above).
3. Build the frontend using the shared component library, matching the
   `.html` reference pixel-for-pixel — the reference is the acceptance
   test, not a suggestion.
4. Wire it behind a feature flag or `/v2/` route; do NOT remove or
   redirect the legacy equivalent yet.
5. Manually verify against the `.html` file side-by-side in a browser,
   and re-read the `.md` file's stated rules (filter existence+
   dependency, delete cascade behavior, validation rules, etc.) as a
   checklist — don't just eyeball that it "looks right."
6. Regression-check any module this one depends on still works
   unchanged (e.g. after building Fees, re-check Academic Setup's
   Class list still renders correctly — Fees' Class filter reads
   from it).
7. Only after 5 and 6 pass: cut the legacy route over / remove the
   feature flag for that module, and merge.
8. Move to the next module in the build order above.

## What "final" means for this design package

Every module's `.html`/`.md` pair in this package is locked — treat a
request to "improve" a finished module's design as out of scope unless
it surfaces a genuine bug (a broken cascade, a missing validation, an
inconsistent chip) rather than a style preference. Implementation
questions (how a filter's dependency logic is wired in Angular, which
Mongoose method to use) are Claude Code's to resolve using the `.md`
files' stated rules as the spec — those files describe behavior, not
literal code, on purpose, so the implementation can fit the actual
legacy codebase's existing patterns where they don't conflict with a
locked global rule.
