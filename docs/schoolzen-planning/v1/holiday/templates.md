# Holiday — Templates

Status: **FINAL**
Reference: `templates.html`

Bundles Holidays into a named template, then assigned to staff or classes via the Assign page.

---

## Frontend

**Toolbar**: single row — search + Add Template.

**Table**: Template Name, Holidays (count pill), Assigned To (count, or "Nobody yet" muted), Created On, Action.

**Add/Edit modal**: Name + a checklist of holidays from the master Holidays list to include.

**Key behavior** (per the side panel's own tip): editing a template updates everyone already assigned to it immediately — a template is referenced by assignment, never copied/snapshotted at assign-time.

## Backend

Schema — `HolidayTemplate`: `adminId`, `name`, `holidayIds:[ref]`, `createdAt`. Because assignments reference this template's ID (not a copy of its holiday list), the Assign page's effective holiday calendar for a person is always computed live from the current template contents — never cache/duplicate the holiday list onto the assignment record.
