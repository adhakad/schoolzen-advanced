# Fixes — organised per module

```
fixes/global-fixes.md          cross-module rules + Status table (updated every run)
fixes/deferred-followups.md    open items waiting on a decision or a later module
fixes/<module>/<module>-fixN.md   one file per round, numbered, never edited after applied
fixes/shared/shared-fixN.md       bugs that live in shared code (interceptor, session, test setup)
```

Current folders: `attendance/`, `student/`, `academic-setup/`, `shared/`. A new module gets its own folder the first time it needs a fix.

Never edit a module fix file after it is applied (global-fixes.md is the exception, it carries the Status table). The next round of issues becomes `-fix(N+1)`, so there is a permanent record of what was wrong and when it was fixed.

```bash
claude "Read prompts/fixes/global-fixes.md and prompts/fixes/attendance/attendance-fix3.md fully, fix everything in the attendance file and apply the global rules in the same run, then update the Status table in global-fixes.md."
```

If a fix reveals a PERMANENT rule (not a one-off bug), also update the relevant page's `.md` or `_core/design-system.md` so the next module doesn't need its own fix round for the same mistake.
