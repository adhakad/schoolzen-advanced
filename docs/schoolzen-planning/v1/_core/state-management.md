# Frontend State Management & SSR (locked)

## State management — no NgRx

- `ShellContextService` — one Angular service, `signal()`-based, holds session-wide state: logged-in staff, active school (`adminId`), active `AcademicSession`. Any component/service that needs to react to a session-year change reads this, never its own copy.
- Per-module services (`shared/services/<module>/<page>.service.ts`, per `frontend-backend-folder-structure.md`) own their own page's data via `signal()`/`computed()`. Each page is the source of truth for its own data — no cross-module shared store.
- No NgRx / global store — this app's shape (per-school-scoped CRUD pages, not a deeply cross-linked real-time app) doesn't need one; it would add ceremony without solving a problem this app actually has.
- Reactive Forms for all input, including structural swaps (e.g. Classes & Sections' "has streams" toggle swapping whole form regions) — never template-driven forms for anything beyond a trivial one-field form.

## Routing — lazy-loaded per module, with idle-time preloading

Every module gets its own lazy route (`loadChildren`/`loadComponent`,
standalone-component style) under `app.routes.ts` — a user landing on
Manage Students downloads only the Student module's JS chunk, not the
other 12 modules' code. This is what actually makes the "page loads
fast" experience real: the initial bundle stays small (shell + auth +
design-system pieces only), and each module's own chunk is fetched on
first navigation to it.

- **Preloading strategy**: use Angular's `PreloadAllModules` (or a
  quicklink-style "preload only the modules linked from the current
  sidebar" strategy if `PreloadAllModules` proves too aggressive on
  slow connections) so that AFTER the first screen is interactive, the
  other modules' chunks fetch quietly in the background — by the time
  a staff member actually clicks "Attendance" from the sidebar, its
  chunk is often already warm, so the navigation feels instant even
  though it was, technically, lazy-loaded.
- **Route-level guards stay cheap** — an auth/role guard checks the
  already-loaded `ShellContextService` signal, never makes its own
  network call before allowing/denying a route (that would add a
  round-trip to every single navigation).
- **Bundle budgets enforced in `angular.json`** (`budgets: initial`,
  `anyComponentStyle`) — a hard build-time warning/error if a module's
  chunk or the initial bundle creeps past a set size (e.g. 500KB
  initial, warn at 2MB/error at 4MB per lazy chunk) — catches a bundle-
  bloat regression (an accidentally-eager import, a heavy library
  pulled into the wrong chunk) at build time, not after it's already
  shipped and someone notices the app feels slower.

## SSR — not used

This is an authenticated internal ERP, not a public/SEO-facing site. SSR's core benefits (search-engine indexing, anonymous-visitor first paint) don't apply here — every real screen sits behind login. Adding Angular Universal would mean duplicating auth/guard logic server-side and taking on hydration complexity for no benefit. Stays CSR.

If a genuinely public-facing piece is ever needed (e.g. a public admission-enquiry landing page), that's a separate, standalone app — not a reason to SSR-convert this one.

## i18n library — `@ngx-translate/core`

Per `additional-technical-considerations.md`'s i18n note (Hindi first), this is the concrete library: locale JSON per language, lazy-loaded per active locale (English users never download Hindi strings). Used for two distinct things that must not be conflated: (1) general UI labels, and (2) resolving an API error's `code` to a localized string in `error.interceptor.ts` — see `error-handling/README.md`'s "Error codes vs. categories" section for why translation happens here and not on the backend.
