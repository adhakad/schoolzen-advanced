# Phase 9 — Holiday Module (Petpooja-style)

Read CLAUDE.md fully before starting. Build the Holiday module with this exact
structure, backend + frontend together, following the New Module Checklist.

## Flow (reference: Petpooja Payroll's Holiday Create + Assign)

1. Admin creates individual Holidays (name, start date, end date — a holiday can
   span multiple days, e.g. Diwali break, not just a single day)
2. Admin groups multiple Holidays into a HolidayTemplate (a named collection,
   e.g. "Green Valley School Holidays 2026")
3. Admin assigns a HolidayTemplate to persons (staff/teacher, bulk via checkbox
   list — same bulk-assign pattern as Leave Assign)
4. DailyAttendance reconcile checks: if a date falls within any Holiday in the
   assigned template for that person, suppress "Absent" — mark as "Holiday"
   instead

## UI/UX rules — keep it simple, match existing app patterns

Petpooja's Holiday screens above are the DATA FLOW reference only — do NOT
copy their visual design. Follow this app's existing look exactly (same as
the Leave module simplification already applied):

- **Tables, not cards.** Every list (Holiday, HolidayTemplate, assignment
  grid) is a plain table matching Shift/Roster/Staff/Leave — same pagination,
  same row structure.
- **No radio buttons anywhere in this module.** Any choice (e.g. which
  template to assign) uses a select/dropdown, not a radio group.
- **Filters and primary action buttons go in ONE toolbar row directly above
  the table** — not scattered in separate sections. Example: "Add Holiday"
  button and any filter dropdown sit together in the same row above the
  Holiday table.
- **Standard action icons in the table, not separate action cards.** Edit/
  Delete/Assign appear as small icon buttons in the table's Action column —
  the same icon-button pattern already used in Shift, Roster, and the
  (already-simplified) Leave module. No floating action cards, no
  card-per-row layout.
- **Plain-language labels.** "Add Holiday" not "Create New Holiday Record",
  "Assigned To" not "No. of Assigned Employee".
- **One obvious primary button per screen** (e.g. "Add Holiday" on the
  Holiday page, "Assign" on the assignment grid) — not multiple
  equally-weighted buttons competing for attention.

## State-wise Public Holiday Preset + Clone-to-Template

Indian school holidays vary by state (e.g. MP vs Maharashtra have different
state-specific holidays alongside shared national ones). Auto-generate a
ready list so admin doesn't manually type every date.

- Seed a state-wise Indian public holiday dataset for the current calendar
  year, covering national holidays (shared across all states) plus
  state-specific ones (e.g. state formation day, regional festivals) —
  system-level data, NOT tied to any adminId (e.g. a `system: true` flag on
  Holiday documents with a `state` field, or a static seed file keyed by
  state name).
- On the Templates tab, add a "Generate from Public Holidays" action with a
  state select/dropdown (the school's own state, pre-filled from the
  school's existing profile data if already stored there, otherwise pick
  from a list of Indian states).
- Selecting a state fetches/clones that state's current-year holiday list
  into a NEW set of Holiday documents owned by that adminId (normal,
  editable Holiday records — not references to the system list), then
  bundles them into a new HolidayTemplate the admin names themselves (e.g.
  "School Holidays 2026").
- After cloning, every date and name is a completely normal, editable
  Holiday belonging to that school — admin can shift a date, rename it,
  delete one, or add school-specific holidays (e.g. Founder's Day, exam
  break) into the same template, exactly like any other Holiday/Template.
- This is a one-time copy at generation time, not a live link — updating the
  system's state-wise list later (e.g. next year's dates) never
  retroactively changes a school's already-cloned template.
- If exact state-wise data isn't readily available for every state at build
  time, ship at minimum the national/central holidays common to all of India
  (Republic Day, Independence Day, Gandhi Jayanti, major festivals) as the
  baseline preset, with the state dropdown as a structure ready to extend
  with more states later — don't block the feature on having all 28 states'
  data perfect on day one.
- **Data must be OFFICIAL, not generic guesses.** Use each state government's
  officially notified public holiday list for the current year (state
  General Administration Department gazette notifications, or India's
  official public holiday calendar published by the central government for
  national holidays) — not a generic "common Indian festivals" list.
  Restricted/optional holidays should not be mixed in with compulsory public
  holidays unless clearly labeled. If exact official dates for a state
  aren't confidently available, it's better to ship fewer states with
  verified official dates than more states with approximate/guessed dates.
- After the preset is cloned into a school's own Holiday records, the admin
  has full CRUD on every one of them — add a new holiday, delete one that
  doesn't apply to their school, or update its name/date — exactly like any
  other Holiday record in the module. There is no "locked" or "official-only"
  state after cloning; it becomes a completely normal, editable school
  holiday from that point on.
- **Data entry method: manual, via MongoDB Compass, no code/redeploy needed.**
  The system-level holiday preset data (state + year + list of {name, date})
  is inserted directly into its own collection (e.g. `system-holidays`) by
  Abhishek using Compass, not hardcoded in application code and not fetched
  from any external API. The backend just reads whatever is in that
  collection when the admin picks a state on the Templates tab. To add next
  year's dates or a new state, insert/update documents in that collection —
  no deployment required. Design the schema simply for this:
  ```
  { state: 'MP', year: 2026, holidays: [{ name: 'Republic Day', date: '2026-01-26' }, ...] }
  ```
  one document per state+year.

## Backend

### Model 1 — Holiday
```
adminId: String, required
name: String, required          // e.g. "Diwali", "Raksha Bandhan"
startDate: Date, required       // UTC midnight
endDate: Date, required         // UTC midnight, >= startDate
createdAt: Date, default Date.now
```
A holiday can be a single day (startDate === endDate) or a range (multi-day
festival/break).

### Model 2 — HolidayTemplate
```
adminId: String, required
name: String, required          // e.g. "Green Valley School Holidays 2026"
holidayIds: [String]            // references to Holiday documents
createdAt: Date, default Date.now
```

### Model 3 — HolidayAssignment
```
adminId: String, required
personType: String, enum ['staff','teacher','student'], required
personId: String, required
templateId: String, required
assignedAt: Date, default Date.now
```
Unique compound index: { adminId, personType, personId, templateId }

### Controllers/Routes
- Holiday: standard CRUD (Create/Update/Delete/GetAll/GetSingle/Pagination)
- HolidayTemplate: CRUD + a "holidays in this template" sub-list (add/remove
  individual Holiday from a template)
- HolidayAssignment: 
  - POST /v1/holiday-assignment/bulk-assign — body { templateId, persons: [{personType, personId}] }, upserts one HolidayAssignment per person
  - GET /v1/holiday-assignment/grid?adminId=&personType= — same grid pattern as leave-assignment: list of persons with their assigned template name (or "Not assigned")

### Reconcile integration
- Add a new lookup service: services/holiday-lookup.js
  - getHolidayMapForMonth(adminId, personType, personId, year, month) — Map<dateKey, holidayName>
  - Resolve via: find the person's HolidayAssignment → get their templateId → get that template's holidayIds → get those Holiday date ranges → expand into individual dateKeys for the given month
  - Batched form: getHolidayMapForSchoolMonth(adminId, personType, year, month) — one round trip for the whole school-month
- Wire into attendance-reconcile.js: if a date has a holiday for that person AND no punch was recorded, status = 'Holiday' instead of 'Absent'. If a punch WAS recorded on a holiday, keep the actual computed status (person came in despite holiday — don't suppress real attendance data)
- Wire into attendance-calendar.js (getSchoolMonthGrid): same pattern as the existing leave map integration — add holiday map to the Promise.all, pass per-person holiday map into buildDayEntries

## Frontend

### Page 1 — Holiday Create (`/admin/holiday`)
- Table: Name, Start Date, End Date, Days Count (calculated), Action (Edit/Delete)
- "Create New Holiday" button → modal: Name, Start Date picker, End Date picker
  - Date pickers must default to showing the CURRENT month/date as the active
    starting point (matching how the app's other date pickers behave)
  - Once start and end dates are both selected, visually highlight/mark those
    dates as active/selected in the calendar widget (so the user can see the
    range they picked, similar to the Leave apply form's date range behavior)

### Page 2 — Holiday Template (`/admin/holiday-template`)
- Table: Template Name, Holiday Count, No. of Assigned Persons, Created On, Action
- "Create New Template" button → modal: Template Name + multi-select checklist
  of existing Holidays to include
- "Assign" button (top right, like Petpooja's "Assign Leaves") → opens bulk
  assign panel

### Page 3 — Holiday Assign (all inside ONE Holiday page, tab-based navigation)

Everything Holiday-related (Holidays, Templates, Assignment) lives under ONE
sidebar entry "Holiday" — inside that single page, use tabs (matching the
existing Roster/Attendance tab pattern already in this app) so the user never
leaves the Holiday section to do related work. Tabs: "Holidays" | "Templates"
| "Assign". One sidebar entry, tabs inside — not separate top-level nav links.

**Assignment scope — three ways to assign, all in the same Assign tab:**
- Staff: select individual staff members (checkbox list, same pattern as
  Leave Assign) -> assign a template
- Teacher: select individual teachers (checkbox list) -> assign a template
- Student: select by CLASS (not individual students) — a class dropdown/
  checklist, selecting a class assigns the template to ALL students in that
  class at once (matches the ClassShift pattern already used for student
  attendance shifts — one assignment per class, not one per student)

Use a select/dropdown to switch between Staff / Teacher / Student scope
within the Assign tab (not radio buttons, not separate pages).

**Edit with confirmation (real-time reflect):**
- Existing assignments show in a table with an Edit action per row (or per
  class row, for students)
- Clicking Edit opens a small confirmation step first: a checkbox "I confirm
  I want to change this assignment" — must be checked before the actual
  edit form/dropdown becomes active. This prevents accidental changes to a
  live assignment.
- Once confirmed and saved, the change reflects immediately: the assignment
  grid updates right away, and the attendance reconcile lookup for that
  person/class picks up the new template on its next run — no cache, no
  delay, since holiday-lookup.js queries live data.

## What NOT to build
- No holiday-driven payroll changes (Phase 10 handles that, reading whatever
  DailyAttendance status the reconcile worker already produces)
- No separate "holiday calendar view" page — the existing Attendance calendar
  grid already shows Holiday status per date once reconcile is wired

## Verification
1. Create 2-3 Holidays (e.g. "Diwali" 3-day range, "Independence Day" single day)
2. Create a Template combining both, assign it to a few staff/teachers
3. Run attendance reconcile for a date within a holiday range where the
   person did NOT punch — confirm status shows "Holiday", not "Absent"
4. Confirm a person who DID punch on a holiday date still shows their actual
   computed status (Present/Late), not overridden to Holiday
5. Check the attendance calendar grid — holiday dates should render clearly
