# TODOs

## T1 — Extract shared layout (nav, footer, color variables) into one place

**What:** The top nav, footer, and `:root` CSS color variables are copy-pasted inline
into every page (dashboard.html, index.html, login.html, patient_hub.html, travel_kit.html,
terminal.html, and now clinic_map.html). Move the shared markup/styles into a single
source so they're defined once.

**Why:** With 7 pages, any change to the logo, nav links, or brand colors must be made in
7 files by hand. That's error-prone and gets worse as the site grows.

**Pros:** One edit updates every page. Less drift between pages. Easier onboarding.

**Cons:** Static HTML has no built-in templating, so this needs either a small shared
CSS/JS include (e.g. a `shared.css` + a JS snippet that injects the nav/footer) or a light
build step. Touching all 7 pages at once carries some risk of breaking working pages.

**Context:** Deferred intentionally during the Clinic Map work to keep that change small.
Lowest-risk path: start with a single shared `shared.css` for the `:root` variables and
common component styles (nav/card/footer), included via `<link>` on every page. Tackle the
nav/footer HTML duplication second.

**Depends on:** Nothing. Best done when no other feature work is in flight on these pages.

## T2 — Doctor-only revenue / cash-flow tracker

**What:** A revenue / cash-flow tracker for an individual doctor's own practice. Per
Joseph: it must be visible ONLY to that doctor (not other doctors, not non-clinical
staff), and scoped to their practice only. Not a top-level dashboard card — place it at
the bottom of the doctor's own view or in a dedicated private section.

**Why:** Joseph wants each doctor to privately see their own practice's financial
performance. Keeping it out of the shared dashboard and access-restricted is a hard
requirement, not a preference.

**Pros:** Gives doctors a private financial view; keeps sensitive numbers off the
shared portal.

**Cons:** Real access control is hard on the current static site — today "login" only
passes a name in the URL, so true per-doctor privacy needs a real auth/backend or at
least server-side gating. Until then, anything in the page source is readable by anyone.
Do NOT ship real financials as a static-site feature assuming it's private.

**Context:** Deferred from the Clinic Map work. Related to the "Billing & Revenue"
dashboard card (kept as a Coming Soon placeholder), but T2 is specifically the
doctor-only, single-practice view. Revisit once the site has real authentication, since
this feature's whole point is restricted visibility.

**Depends on:** Real authentication / per-user access control on the intranet (planned:
real email + password logins so private info is protected).
