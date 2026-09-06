# Prompts — ready-made Claude Code inputs, one per PAGE, grouped by module

Not one giant prompt per module — a module like Payroll has 4 pages,
and asking Claude Code to build all of them in a single task risks a
sprawling, hard-to-review change. Instead: **one prompt per page**,
grouped into a folder per module, so you can hand Claude Code exactly
one page at a time and verify it before moving to the next.

## Structure

```
prompts/
├── 00-shared-components.md         ← build first, once (not a module)
├── 01-academic-setup/
│   ├── 01-classes-sections.md
│   ├── 02-subjects.md
│   └── 03-subject-groups.md
├── 02-student/
│   ├── 01-manage-students.md
│   ├── 02-admission.md
│   └── 03-class-promotion.md
├── 03-staff/  ...
├── 04-attendance/  ...
├── 05-leave/  ...
├── 06-holiday/  ...
├── 07-payroll/
│   ├── 01-generate-payroll.md
│   ├── 02-salary-payouts.md
│   ├── 03-salary-groups.md
│   └── 04-assign-salary.md
├── 08-fees/  ...
├── 09-examination/  ...
├── 10-certificates/  ...
├── 11-approvals/  ...
├── 12-settings/  ...
└── 13-dashboard/
    └── 01-dashboard.md              ← build last (not really a module)
```

Folder numbers = module build order. File numbers inside each folder =
page build order within that module (usually doesn't matter much
within a module, but follow it anyway — later pages sometimes assume
an earlier page's schema fields already exist, e.g. Fee Structure
before Fees).

## Usage — single line per page

```bash
claude "$(cat docs/schoolzen-planning/prompts/07-payroll/01-generate-payroll.md)"
```

Do one page, verify it against its `.html` reference, merge, then move
to the next file in that folder. Once every file in a module's folder
is done and verified, move to the next module folder.

## Order — do not skip ahead

```
00-shared-components.md
01-academic-setup/ (all 3 pages)
02-student/ (all 3 pages)
03-staff/ (all 3 pages)
04-attendance/ (all 3 pages)
05-leave/ (all 3 pages)
06-holiday/ (all 3 pages)
07-payroll/ (all 4 pages)
08-fees/ (all 4 pages)
09-examination/ (all 4 pages)
10-certificates/ (all 2 pages)
11-approvals/ (1 page — needs 05-leave already merged)
12-settings/ (all 3 pages — needs 02-student already stable)
13-dashboard/ (1 page — needs nearly everything else merged)
```

Each module folder's prompts note their own real dependencies inline
(e.g. Attendance's prompts remind you Student+Staff must already be
merged) — but the numbered order above is still the safe default path.

See `../v1/_core/claude-code-implementation-strategy.md` for the full
reasoning (module-wise not phase-wise, one page/module per branch,
never touch legacy schema/routes in place, feature-flag before
cutover) and `../v1/_core/frontend-backend-folder-structure.md` for
where the actual generated code should live in your project.

## What every prompt does NOT do (on purpose)

Every prompt stops after feature-flagging the new page behind a
`/v2/<module>/<page>` route — it does not cut over the legacy route or
merge automatically. That requires a human to actually look at the
rendered page next to its `.html` reference first. Do that
verification, then merge yourself.
