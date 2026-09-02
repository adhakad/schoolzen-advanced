# Schoolzen — Planning & Design Docs

This folder holds versioned planning/prompt files for the major refactor
(unified Staff+Teacher, RBAC, sessions, security) and the approved UI
design — one file per module/page, kept separate from application code
so prompt history stays traceable across iterations.

## Structure

```
schoolzen-planning/
├── README.md                     <- this file
├── CHANGELOG.md                  <- one entry per version/update, what changed and why
├── v1/
│   ├── _core/                    <- shared across every module — read this FIRST
│   │   ├── refactor-plan-and-design-system.md
│   │   │     (R1-R7 phased refactor plan, the locked design system spec,
│   │   │      the reusable shared-component list, quality bar)
│   │   └── schoolzen-design-system-reference.html
│   │         (pixel-accurate HTML of the approved base design — give this
│   │          to Claude Code alongside any module's own doc below)
│   ├── attendance/
│   │   └── overview.md           <- Attendance module, Overview page
│   ├── payroll/
│   │   └── generate-payroll.md   <- Payroll module, Generate payroll page
│   └── (leave/, holiday/, roster/, devices/, settings/ — added as each
│        module is designed)
└── v2/                            <- (create when the CORE plan/design changes materially)
```

## How to use this with Claude Code

For any module page, give Claude Code:
1. `v1/_core/refactor-plan-and-design-system.md` (or just the relevant
   phase section — the design system section applies to every page)
2. `v1/_core/schoolzen-design-system-reference.html`
3. The specific module's own file, e.g. `v1/attendance/overview.md`

The module file only documents what's DIFFERENT for that page — it
assumes the shared shell/toolbar/table/chip/icon-action components from
`_core` are already in place and doesn't repeat their spec.

## Versioning rule

- **Per-module files** (`attendance/overview.md`, `payroll/generate-
  payroll.md`, etc.) can be updated in place within the same version as
  a module's design is refined — each file's own content is what Claude
  Code should build against at any given time.
- **The `_core` folder** is different: because every module depends on
  it, don't edit it in place once a module has been built against it.
  If the shared design system or component contracts change materially,
  create a new `v2/_core/` and copy forward any module files that still
  apply, updating them only if the core change actually affects them.
- Log every version bump or material per-module update in CHANGELOG.md.

## Current version: v1

See CHANGELOG.md for what's been finalized so far.
