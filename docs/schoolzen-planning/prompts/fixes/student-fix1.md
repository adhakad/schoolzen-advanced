# Fix: Student module — session format + Manage Students toolbar

## 1. Academic session format
Change from "2026-27" to full "2026-2027" everywhere — backend
validation regex/pattern, session-generation logic, and any frontend
display/input for session. Check `AcademicSession` model and
settings/academic-sessions module too, since other modules (Leave,
Payroll, etc.) may reference the same format — keep it consistent
across the whole app, not just Student.

## 2. Manage Students toolbar layout
Buttons are wrapping below the search box instead of sitting in the
same row (like Academic Setup places its buttons next to the search
box). Also the "Assign Card"/selected-state button is noticeably wider
than the other toolbar buttons. Fix both: match this page's own
toolbar row layout to its reference `manage-students.html` exactly,
and make all toolbar buttons use the same consistent width/sizing rule
from `design-system.md` (38px control height, consistent padding) —
don't introduce a new one-off width for any single button.