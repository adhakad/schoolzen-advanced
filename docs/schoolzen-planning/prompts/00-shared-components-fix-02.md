The desktop sidebar is missing the rounded-card treatment that the rest of the app uses everywhere else. This is a real inconsistency in docs/schoolzen-planning/v1/_core/shell/app-shell.html itself (its .sb-wrap was written flush/shadowless) — not a mismatch you introduced. Fix it now:

Add to `.sb-wrap` (the DESKTOP sidebar only):
- `border-radius: 18px`
- `box-shadow: 0 2px 8px rgba(20,20,60,0.05)`

This matches the dominant white-surface style used everywhere else in the app — `.sw-card-main` (every module's main content card), every modal, and the original 38 individual page reference files' own sidebar CSS all use this exact radius+shadow pair. A flush, shadowless white column is the outlier, not the rule.

Do NOT change the mobile off-canvas drawer's styling — its flush left edge with `border-radius: 0 20px 20px 0` (rounded only on the right side, since it's a slide-in panel flush against the screen edge) is correct as already implemented and should stay exactly as-is. This fix applies only inside the desktop (non-mobile-media-query) `.sb-wrap` rule.

After making this change, restart `ng serve` if needed, then confirm the sidebar now renders as a rounded, shadowed floating card on desktop, matching `.sw-card-main`'s visual weight, while the mobile drawer is unaffected.
