# Prompts

One file per MODULE (all that module's pages together — schema+API+frontend as one piece of work). A module prompt tells Claude Code what to read as a starting point; it's expected to read further (other docs, other modules' existing code) whenever it actually needs to.

## Usage

```bash
claude "$(cat docs/schoolzen-planning/prompts/01-academic-setup.md)"
```

## Build order (respects dependencies — see main README's module table)

```
01-academic-setup   →  02-student   →  03-staff
                            ↓               ↓
                        04-attendance ←─────┘
                            ↓
05-leave  →  06-holiday  →  07-payroll
   ↓
08-fees  →  09-examination  →  10-certificates
   ↓
11-approvals (needs Leave data)  →  12-settings (needs Student/Staff/Examination)
   ↓
13-dashboard (needs almost everything — build last)
```

## When something doesn't match after building

Don't write a one-off correction message and lose it — put it in `fixes/<module>-vN.md` (see `fixes/README.md`) so there's a record of what was wrong, and it can be re-run exactly:

```bash
claude "$(cat docs/schoolzen-planning/prompts/fixes/attendance-v1.md)"
```
