# Build prompt — Milestone 7: Merchant revenue dashboard

Paste this whole prompt to the coding agent to execute M7.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements
2. `plan.md` — the full milestone list (you are implementing milestone 7 only)
3. `userflows.md` — merchant flow steps 5–9, which this milestone implements (virtual account shown, sharing, webhook payment lands, realtime dashboard update, revenue trends)
4. `architecture.md` — system design; note the dashboard is explicitly "Next.js + Supabase Realtime" in the architecture diagram
5. `data-model.md` — `merchants` and `transactions` shapes, and the RLS policies you'll depend on for both a direct client-side merchant-profile read and the realtime subscription
6. `api.md` — as-built API reference; read the **milestone 6 entry in full**, it's the endpoint this dashboard is built around
7. `handoff.md` — read all six milestone entries, especially milestone 3's and 6's seams (both point directly at this milestone) and the visual-theme convention at the top of the file

Milestones 1–6 already delivered: the app deployed to Render; `POST /api/merchants` (signup) and `POST /api/merchants/:id/approve` (admin-only, shared-secret gated — not merchant-facing, no admin UI exists yet, milestone 14's job) both work against real Supabase + Monnify; approved merchants have a real `monnify_account_number` persisted; `POST /api/webhooks/monnify` reliably inserts real transaction rows; `GET /api/merchants/:id/revenue` returns `{ grossInflow, verifiedRevenue, trend: [{ period, amount }] }` gated by a real Supabase Auth bearer token (`Authorization: Bearer <access_token>`, validated via `supabase.auth.getUser(token)`). **Critical seam**: milestone 3's signup UI persists no client-side session at all — there is currently no way for a merchant to obtain that bearer token in the browser. Read `api.md`'s milestone 6 section closely before building anything; don't guess the auth shape.

Read every image in `ui-inspirations-theme/` before writing any component — per `handoff.md`'s standing convention, this is the visual spec (Moniepoint-style Nigerian fintech look, brand-blue/white rounded cards/pill buttons), not optional trim. Match the palette milestone 3 already established in `app/globals.css` (`--brand`/`--brand-dark`/`--brand-tint`).

## Your task: Milestone 7 — Merchant revenue dashboard

Build the merchant-facing dashboard: virtual account display, live revenue totals, a trend chart, and realtime updates on new transactions.

### Scope

1. **Close milestone 3's session gap**
   - `GET /api/merchants/:id/revenue` requires a real Supabase Auth bearer token, and nothing in the app currently produces one client-side. Add a sign-in page/flow (e.g. `app/login/page.tsx`) using `supabase.auth.signInWithPassword` against the browser Supabase client, for the same auth users milestones 2/3 already create at signup. Persist the resulting session (Supabase's JS client handles this by default via its own storage) so the dashboard can read it on load and on refresh.
   - This is a real gap being closed, not scope creep — the dashboard literally cannot authenticate against milestone 6's route without it. Keep it minimal: email + password, no "forgot password"/magic-link flows, no new backend routes (Supabase Auth's client SDK talks to Supabase directly, not through a PROOFR API route).

2. **Merchant profile + virtual account display** — userflows.md step 5
   - No `GET /api/merchants/:id` route exists. Read the merchant's own profile (including `monnify_account_number`, `approval_status`, `business_name`) directly via the browser Supabase client using the signed-in session — `data-model.md`'s RLS policy already scopes merchants to their own `auth_user_id` row, so this doesn't need a new API route.
   - If `approval_status` is still `pending` (no admin UI exists yet to flip it — that's a manual/admin-secret action today), show the same pending state milestone 3 already has rather than a broken/empty dashboard.
   - Once approved, prominently show the Monnify reserved account number (and bank name if you fetch/have it) as the thing merchants share with customers to get paid — userflows.md step 6 ("merchant shares virtual account with customers") is just making this number easy to see/copy, not building a share mechanism.

3. **Revenue totals** — userflows.md steps 7–9
   - Call `GET /api/merchants/:id/revenue` with the session's access token in the `Authorization` header. Display `grossInflow` and `verifiedRevenue` (per `api.md`, they're numerically identical right now — milestone 8 will make them diverge once fraud flags exist; don't build UI that assumes they're always equal, but don't invent a fake distinction today either).
   - Trend chart using the `trend` array; use whichever `granularity` (`daily`/`monthly`) fits the chart, or offer a toggle if that's a small addition — your call.

4. **Realtime update** — userflows.md step 8, plan.md's explicit done-when
   - Subscribe to Postgres changes on `transactions` filtered to the signed-in merchant's `merchant_id` via Supabase Realtime (`supabase.channel(...).on('postgres_changes', ...)`), relying on the same RLS policy that scopes `transactions` reads to the owning merchant. On a new transaction event, re-fetch or incrementally update the revenue totals/trend/chart — a sandbox payment must show up without a manual page refresh.

### Explicitly out of scope for this milestone

Do not build fraud flag UI — that's milestone 9. Do not build the Proof-of-Revenue report view — milestone 10/11. Do not build the lender portal or admin UI. Do not add new backend API routes for anything covered by an existing route or by direct RLS-scoped Supabase client reads — if something seems to need a new route, check whether RLS already makes a direct client read sufficient first (as with the merchant profile above).

### Done-when (from plan.md)

A sandbox payment shows up on the dashboard without a manual refresh — i.e. with a signed-in, approved merchant viewing their dashboard on the deployed Render URL, sending a real (or newly seeded) transaction for that merchant causes the revenue totals/trend to update live via the Supabase Realtime subscription.

### Before you finish

- Per this project's standing rule, manually test the full flow in a real browser against the deployed Render URL: sign in, view the pending state (if applicable), view an approved merchant's dashboard with real revenue data from earlier milestones, and confirm the realtime update actually fires — trigger a real transaction (a fresh Monnify sandbox payment, or a directly-inserted test row if that's faster and you clean it up after) while the dashboard is open and watch it update live.
- Drop an `integration.md` in the project root per `handoff.md`'s convention: endpoints/tables called and how (including the direct RLS-scoped profile read and the realtime subscription details — channel/filter setup), any mismatch found vs. `api.md`, client-side assumptions (e.g. session storage/expiry handling), and manual test notes including the live realtime test.
- Add a one-line pointer to that `integration.md` in `handoff.md`'s milestone 7 entry.
- Double check no real API keys or secrets got committed.
- Report back: the deployed URL/path to try the flow, and confirmation the realtime update was actually observed live (not just implemented) against the deployed app.
