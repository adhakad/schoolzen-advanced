# Fixes — versioned corrections per module

When a built module doesn't match its reference, or a review finds a real bug, the correction goes here — one file per round, numbered:

```
fixes/<module>-v1.md
fixes/<module>-v2.md
```

Never edit a fix file after it's applied — the next round of issues becomes `-v2`, so there's a permanent record of what was wrong and when it was fixed.

```bash
claude "$(cat docs/schoolzen-planning/prompts/fixes/attendance-v1.md)"
```

If a fix reveals a PERMANENT rule (not a one-off bug), also update the relevant page's `.md` or `_core/design-system.md` so the next module doesn't need its own fix round for the same mistake.
