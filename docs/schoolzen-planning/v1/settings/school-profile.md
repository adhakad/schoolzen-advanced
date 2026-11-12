# Settings — School Profile

Reference: `school-profile.html`. Fifth page of Settings (after Marksheet Templates). Replaces the legacy `school.component` (table + Create/Edit/Delete modal) with one form that is always edited in place.

## Purpose
One record per school (`adminId`). It supplies the letterhead printed on certificates, admit cards, marksheets and receipts, and the school name used as sender in WhatsApp fee reminders.

## Fields (match the html; * = required)
| Group | Field | Rule |
|---|---|---|
| Identity | School Logo | PNG/JPG, square, up to 100 KB. Optional. |
| Identity | School Name * | max 50 |
| Identity | Affiliated Board * | pick from the board list (below), never typed |
| Identity | Medium * | English, Hindi, Hindi & English |
| Identity | Affiliation / Recognition Number * | max 15. District-affiliated schools enter the DEO recognition number. |
| Identity | School Code * | max 15 |
| Identity | Founded Year * | 4 digits, starts with 19 or 20 |
| Identity | UDISE Number | optional, 11 digits |
| Identity | Principal Name | optional, max 50 |
| Address | Street * | max 100 |
| Address | City / Town * | max 50 |
| Address | District * | max 50 |
| Address | State * | pick from the 36 states and UTs |
| Address | Pin Code * | exactly 6 digits |
| Contact | Contact Number * | exactly 10 digits, numbers only |
| Contact | Alternate Number | optional, exactly 10 digits |
| Contact | Email * | valid email |
| Contact | Website | optional |
| Messages | Sender name for fee reminders * | max 50, defaults to the School Name when first saved |

## Board list (constants file in v2 code, no runtime read from legacy)
Groups: National (CBSE, CISCE, NIOS, IB); District affiliated, State, up to Class 8 (DEO); State boards A to Z by state (35 boards, listed in the html). The boards that already exist in the legacy board list are merged in once at build time.

## State list
28 states plus 8 UTs = 36 (the legacy list had only 28).

## Behaviour
- Save is disabled until every required field is valid. Errors show under the field. Double-submit guarded.
- Empty state (nothing saved yet): yellow note "No school profile saved yet. Letterheads currently print "SCHOOL" with no address." Hidden after the first save.
- After saving: toast "School profile saved", meta line "Last saved ... by <name>".
- The letterhead preview updates live while typing and uses the same template as the printed letterhead (name centred, sub line = board, affiliation/recognition number, school code; address and phone/email centred below).
- Loading: skeleton for the form (Rule 22), error state with Retry (Rule 22.e).
- Mobile (390px): one column, Save 44px, preview below, no overflow.
- No delete. The record is created on first save and updated afterwards.

## Backend
- Model `v2-school-profile`, collection `v2-school-profiles`, one document per `adminId` (unique index).
- `GET /api/v2/settings/school-profile` returns the profile or `null`.
- `PUT /api/v2/settings/school-profile` upserts. Validates every rule above on the server.
- Permission key `settings-school-profile` (seed + Roles & Permissions UI), enforced on the backend.
- Every save writes an activity log (`settings.school-profile.save`, changed field names only).
- Readers: letterhead print template (certificates, admit card, marksheet, receipts) and the fee-reminder sender. When no profile exists they keep today's fallback.
