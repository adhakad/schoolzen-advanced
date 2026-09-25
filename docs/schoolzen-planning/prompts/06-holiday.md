# Build: Holiday module (all 3 pages)

Depends on Academic Setup and Staff modules.

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md`
2. `docs/schoolzen-planning/v1/holiday/holidays.{html,md}`
3. `docs/schoolzen-planning/v1/holiday/templates.{html,md}`
4. `docs/schoolzen-planning/v1/holiday/assign.{html,md}`

## Build
**Backend**: `models/holiday/holiday.js`, `holiday-template.js`; `controllers/holiday/*.controller.js`; matching routes.
**Frontend**: `holiday/holidays/`, `holiday/templates/`, `holiday/assign/`; `shared/services/holiday/*.service.ts`; `shared/models/holiday/*.model.ts`.

## Critical rules
- Templates reference Holiday IDs — never copy holiday data into a template. Editing a template must immediately affect everyone already assigned to it (no snapshot/cache).
- Holidays page has a Source distinction (Manual vs Auto from "Generate from Public Holidays") — Auto entries come from a bulk-insert against a public-holiday dataset, deduped against existing entries.
- Assign page: enforce the mixed-selection rule (can't Assign-or-Edit across a selection that mixes already-assigned and not-yet-assigned people) both in the UI (warning banner) and server-side (reject the batch).
- Assignment lives as `templateId` directly on Staff/StudentEnrollment, not a separate join table.

## Design rules
Zero native `<select>`. Bootstrap Icons only. Holidays' month-filter is a genuinely custom inline-calendar popover (not a plain `.dd` option list) — build it as its own small component, don't force it into the generic `.dd` pattern.

## When done
Show all 3 pages next to references. Confirm editing a Template immediately reflects for already-assigned people, and the mixed-selection warning fires correctly on Assign.
