# Fixes — versioned corrections per module

When a built module doesn't match its reference, or a review finds a real bug, the correction goes here — one file per round, numbered:

```
fixes/<module>-fix1.md
fixes/<module>-fix2.md
fixes/global-fixes.md   (cross-module rules + status table; the one file that IS updated each run)
```

Never edit a module fix file after it's applied (global-fixes.md is the exception, it carries the Status table) — the next round of issues becomes `-fix2`, so there's a permanent record of what was wrong and when it was fixed.

```bash
claude "Read prompts/fixes/global-fixes.md and prompts/fixes/attendance-fix1.md fully, fix everything in the attendance file and apply the global rules in the same run, then update the Status table in global-fixes.md."
```

If a fix reveals a PERMANENT rule (not a one-off bug), also update the relevant page's `.md` or `_core/design-system.md` so the next module doesn't need its own fix round for the same mistake.
