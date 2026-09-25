# Frontend State Management & SSR (locked)

## State management — no NgRx

- `ShellContextService` — one Angular service, `signal()`-based, holds session-wide state: logged-in staff, active school (`adminId`), active `AcademicSession`. Any component/service that needs to react to a session-year change reads this, never its own copy.
- Per-module services (`shared/services/<module>/<page>.service.ts`, per `frontend-backend-folder-structure.md`) own their own page's data via `signal()`/`computed()`. Each page is the source of truth for its own data — no cross-module shared store.
- No NgRx / global store — this app's shape (per-school-scoped CRUD pages, not a deeply cross-linked real-time app) doesn't need one; it would add ceremony without solving a problem this app actually has.
- Reactive Forms for all input, including structural swaps (e.g. Classes & Sections' "has streams" toggle swapping whole form regions) — never template-driven forms for anything beyond a trivial one-field form.

## SSR — not used

This is an authenticated internal ERP, not a public/SEO-facing site. SSR's core benefits (search-engine indexing, anonymous-visitor first paint) don't apply here — every real screen sits behind login. Adding Angular Universal would mean duplicating auth/guard logic server-side and taking on hydration complexity for no benefit. Stays CSR.

If a genuinely public-facing piece is ever needed (e.g. a public admission-enquiry landing page), that's a separate, standalone app — not a reason to SSR-convert this one.

## i18n library — `@ngx-translate/core`

Per `additional-technical-considerations.md`'s i18n note (Hindi first), this is the concrete library: locale JSON per language, lazy-loaded per active locale (English users never download Hindi strings). Used for two distinct things that must not be conflated: (1) general UI labels, and (2) resolving an API error's `code` to a localized string in `error.interceptor.ts` — see `error-handling/README.md`'s "Error codes vs. categories" section for why translation happens here and not on the backend.
