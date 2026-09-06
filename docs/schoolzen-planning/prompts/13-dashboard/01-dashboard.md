Read docs/schoolzen-planning/v1/dashboard/dashboard.md in full.

Build the Dashboard (home landing page) LAST, only once Student, Staff, Attendance, Fees, and Approvals are all real and populated — this page has no data of its own, every panel aggregates data from those modules, so it is not meaningfully testable against stubbed data.

Match docs/schoolzen-planning/v1/dashboard/dashboard.html pixel-for-pixel: the white-card hero (gradient date badge, welcome text, right-aligned stat pairs, soft pastel blob decoration — no gradient banner, no duplicate summary strip beneath it), the body built from the SAME shared components used everywhere else (the layout-row two-column structure, sw-card-main cards) — no new bespoke pattern invented for this page. The calendar's today-highlight (purple gradient fill) and holiday-dot behavior must work correctly against the real Holiday module data.

Wire behind /v2/dashboard (or make it the new default landing route once verified, per the implementation strategy).
