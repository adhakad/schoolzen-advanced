# Claude Code Implementation Strategy (locked)

## Isolation — build without breaking the live legacy app

- New pages live under a `/v2` route prefix, running side by side with legacy.
- Nothing new modifies a legacy route, controller, schema, or component in place.
- A module cuts over (replacing its legacy equivalent, `/v2` prefix removed) only AFTER it's built, verified against its `.html` reference, and explicitly approved — never automatically.

## Build by module, not by phase-across-modules

Build one module's schema+API+frontend completely (all its pages together) before moving to the next module — never "all modules' schemas first, then all frontends." See main `README.md`'s module table for the dependency order (13 modules = 13 build phases).

## Per-module workflow

1. Read that module's `prompts/<module>.md` — it names starting-point files but the model should read further whenever genuinely useful (other docs, other already-built modules' code) — never restricted to only the named files.
2. Claude Code: **Plan Mode** (Shift+Tab) for anything beyond a small fix — review the plan before executing, especially for schema/architecture decisions.
3. Model: **Sonnet**, not Opus, for this kind of scoped implementation work — Opus burns through usage limits much faster for no proportionate benefit here.
4. Build schema/API/frontend for the whole module in one pass.
5. Verify the built page against its own `.html` reference side by side — specifically check: `.dd` component (no native select)? Bootstrap Icons only? This page's OWN toolbar row structure (not copied from a different page)? Confirm-before-action on destructive buttons?
6. `git commit` after this verified unit of work — don't let uncommitted changes pile up across a build + multiple fix rounds.
7. If something doesn't match, write it as `prompts/fixes/<module>-vN.md`, numbered, never edited after being applied.
8. Move to the next module in dependency order.

## Existing/related module — reference only, and only when needed

If building a new module runs into a question an already-built module answers (e.g. "how is Class actually shaped in the real database"), look at that module's real code for the answer — but treat it as reference/idea, never copy-paste, and only open it when a real question genuinely requires it, not by default on every prompt.
