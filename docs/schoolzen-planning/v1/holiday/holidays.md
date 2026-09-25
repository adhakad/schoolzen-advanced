# Holiday — Holidays

Status: **FINAL**
Reference: `holidays.html`

The master list of holiday dates — bundled into Templates, which get assigned to staff/classes.

---

## Frontend

**Toolbar**: row1 (search + Delete Selected outline-danger + "Generate from Public Holidays" secondary + Add Holiday primary), row2 (a month-nav trigger that opens an inline mini-calendar popover for filtering by month, not a plain `.dd` list — has its own prev/next controls both in the collapsed trigger AND inside the popover, plus a "Show all months" reset link).

**Table**: checkbox, Name, Start Date, End Date, Days, Source (tag: Manual / Auto — Auto means it came from "Generate from Public Holidays"), Action.

**"Generate from Public Holidays"**: opens a modal with a **state select** (pre-filled from the school's own profile state if already stored there, otherwise pick from the list of Indian states) — selecting a state clones that state's current-year public holidays into this school's own `Holiday` documents, tagged `Auto`. Once cloned, every row is a completely normal, editable Holiday belonging to that school (rename/reshift/delete freely) — this is a one-time copy at generation time, not a live link, so a future update to the system-wide list never retroactively changes a school's already-cloned holidays.

**Add/Edit modal**: Name + a date-range picker (Start/End, can span multiple days for something like Diwali).

## Backend

Schema — `Holiday`: `adminId`, `name`, `startDate`, `endDate`, `source:'manual'|'auto'`. "Generate from Public Holidays" is a bulk-insert from a known public-holiday dataset for the school's region/year — dedupe against existing entries by date range before inserting.

**System-level public-holiday dataset — source and maintenance:**
- A separate, non-tenant collection `SystemHoliday`: `{ state, year, holidays: [{ name, date }] }`, one document per state+year — never mixed into any school's own `Holiday` collection, and carries no `adminId`.
- Data must be OFFICIAL, not generic guesses — each state's officially notified public-holiday list (state General Administration Department gazette, or the central government's published calendar for national holidays), not a "common festivals" approximation. Restricted/optional holidays are never mixed in with compulsory ones unless clearly labeled. Ship fewer states with verified official dates rather than more states with approximate ones.
- **Entry method: manual, via MongoDB Compass, no code or redeploy.** This dataset is inserted/updated directly in the `SystemHoliday` collection by whoever manages it — not hardcoded in application code, not fetched from any external API. To add next year's dates or a new state, insert/update a document; the backend just reads whatever exists when an admin picks a state in the modal above.
