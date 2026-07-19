# Build prompt — Milestone 3: Merchant onboarding UI

Paste this whole prompt to the coding agent to execute M3.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements
2. `plan.md` — the full milestone list (you are implementing milestone 3 only)
3. `architecture.md` — system design and why key stack decisions were made
4. `userflows.md` — merchant flow steps 1–4, which this milestone implements
5. `api.md` — **as-built** API reference; this is the source of truth for what's actually implemented (it overrides `api-contracts.md` where they differ)
6. `handoff.md` — milestone 1 and 2 entries, especially the two seams left for this milestone
7. `data-model.md` — the `merchants` table shape, so the UI doesn't invent fields that don't exist
8. `ui-inspirations-theme/` — reference screenshots setting the intended visual style (Moniepoint-style Nigerian fintech app UI: bold brand-blue backgrounds, white rounded cards, bold headlines, pill buttons, balance-card motifs). Look at every image in this folder before writing any component — it's not optional trim, it's the visual spec for this milestone and every later frontend milestone.

Milestones 1–2 already delivered: the Next.js (App Router, TS, Tailwind v4) app with PWA scaffold, deployed to Render at `https://proofr.onrender.com`; `lib/supabase.ts` with browser/service-role Supabase clients; `POST /api/merchants` (public signup, accepts an **optional inline** `bvnOrNin` field per `api.md` — no separate KYC endpoint exists) and `POST /api/merchants/:id/approve` (admin, shared-secret gated, not user-facing). Read `api.md`'s exact request/response JSON before building forms — don't guess field names or error shapes.

## Your task: Milestone 3 — Merchant onboarding UI

Build the merchant-facing signup experience: `userflows.md` merchant flow steps 1–4 (landing → signup → KYC verification → business details → pending-approval state), plus the PWA install experience.

### Scope

1. **Landing page** (`app/page.tsx`, replacing the current placeholder)
   - Brief PROOFR intro + a clear call-to-action into merchant signup. Keep it simple — this is not a marketing milestone.
   - Style it (and every other screen in this milestone) to match `ui-inspirations-theme/`, not a generic default palette.

2. **Signup flow** — implements userflows.md steps 1–3
   - A form collecting `phone`, `email`, `password`, `businessName`, and (per the seam `api.md` documents) an inline BVN/NIN field so KYC can run in the same call.
   - Client-side validation matching what the API actually enforces (per `api.md`): required non-empty fields, `phone` in **E.164** format (e.g. `+2348012345678`) since Supabase Auth rejects other formats with a 400.
   - Submit calls `POST /api/merchants`. Surface the API's real error shapes (400 for bad input/duplicate email, 500 for a rollback case) as user-readable messages — don't invent a generic "something went wrong" that hides which field was wrong.
   - On success (`201`), show that KYC ran (`bvn_nin_verified` result — the API mocks this via `mockVerifyBvnNin`; the UI does not need to know or say it's mocked, just reflect the returned status) and move the user into business-details confirmation if any details weren't already captured in the signup form, then into the pending-approval state.
   - Decide the exact screen breakdown (single form vs. multi-step wizard) yourself — `userflows.md` lists steps 1–4 as distinct flow stages, not mandated separate screens.

3. **Pending-approval state** — userflows.md step 4
   - After successful signup, show a clear "your application is pending approval" screen/state. There is no merchant-facing polling/status endpoint yet (approval is admin-only via `POST /api/merchants/:id/approve`, which this UI must NOT call or expose) — a static pending message is correct for this milestone. Do not build merchant login/session persistence beyond what's needed to reach this screen; that's not in this milestone's scope and isn't required by `userflows.md` steps 1–4.

4. **PWA manifest/install prompt**
   - Milestone 1 already added a web manifest, icons, and service worker registration (`app/service-worker-registration.tsx`). Add a lightweight install prompt (e.g. listen for the `beforeinstallprompt` event and surface an "Install app" affordance) so the PWA requirement is actually usable, not just registered. Keep it unobtrusive — a small button/banner, not a blocking modal.

### Explicitly out of scope for this milestone

Do not build the revenue dashboard, virtual account display, transaction/fraud UI, reports, lender portal, or admin UI — those are later milestones. Do not call or surface the admin-only approve route. Do not add new API routes or database columns — if the UI needs something `api.md`/`data-model.md` doesn't support, either adapt the UI to the existing shape or flag the mismatch in `integration.md` rather than silently extending the backend.

### Done-when (from plan.md)

A real user can complete signup in the browser and the record matches milestone 2's API — i.e. filling out the signup form on the deployed Render URL produces the same `merchants`/`auth.users` rows that `POST /api/merchants` produces directly, and the user is left on a pending-approval screen.

### Before you finish

- Per this project's standing rule, manually test the full flow in a real browser against the deployed Render URL (not just locally) — signup, validation error cases, success path, pending screen, and the install prompt.
- Drop an `integration.md` in the project root per the convention in `handoff.md`: which endpoints were called with what shapes, any mismatch found between `api.md` and actual API behavior and how it was resolved, client-side assumptions baked in, and manual test notes from the live browser pass.
- Add a one-line pointer to that `integration.md` in `handoff.md`'s milestone 3 entry (which currently says "Not started").
- Double check no real API keys or secrets got committed.
- Report back: the deployed URL/path to try the flow, and confirmation the browser-created merchant row matches what milestone 2's API test produced.
