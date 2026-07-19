# Milestone 7 — Integration Notes (Merchant revenue dashboard)

Reflects current state as of this milestone. Overwrite on the next frontend milestone (9) per `handoff.md`'s convention.

## Session gap closed

Milestone 3 deliberately shipped no client-side session (its own seam note); milestone 6's route needs a real Supabase Auth bearer token. `app/login/page.tsx` adds email/password sign-in via `supabase.auth.signInWithPassword` against a shared browser client (`getBrowserSupabaseClient()`, new in `lib/supabase.ts` — a singleton wrapper around the existing `createBrowserSupabaseClient()` factory so client components don't each spin up their own auth-refresh timer). The Supabase JS SDK persists the session to `localStorage` by default, so a signed-in merchant stays signed in across a refresh — confirmed in manual testing (see below). No new backend route: this talks to Supabase Auth directly, per the milestone's scope note.

## Endpoints / tables called

- **`supabase.auth.signInWithPassword`** (`app/login/page.tsx`) — direct Supabase Auth call, no PROOFR API route.
- **Direct RLS-scoped read of `merchants`** (`app/dashboard/page.tsx`): `supabase.from("merchants").select("id, business_name, approval_status, monnify_account_number").eq("auth_user_id", session.user.id).maybeSingle()`. No `GET /api/merchants/:id` route exists or was added — `data-model.md`'s `merchants_select_own` RLS policy (`auth_user_id = auth.uid()`) already scopes this correctly to the signed-in merchant's own row, confirmed working in testing.
- **`GET /api/merchants/:id/revenue?granularity=daily|monthly`** (milestone 6) — called with `Authorization: Bearer <session.access_token>` on initial dashboard load, on every granularity toggle, and again inside the realtime callback (see below). Response shape used exactly as documented in `api.md`: `{ grossInflow, verifiedRevenue, trend: [{ period, amount }] }`.
- **Realtime subscription on `transactions`** (`app/dashboard/page.tsx`): `supabase.channel(\`transactions-merchant-${merchant.id}\`).on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions", filter: \`merchant_id=eq.${merchant.id}\` }, handler).subscribe()`. Relies on the same `transactions_select_own` RLS policy (`data-model.md`) to scope the stream to the signed-in merchant's own rows. On event, re-calls the revenue fetch (no incremental patching — simplest correct option given transaction volume is low; see below) and flashes a "New payment" badge for 3s.

## Mismatch found vs. docs — required a manual migration, now resolved

**Supabase Realtime's `postgres_changes` only streams tables added to the `supabase_realtime` publication.** Neither `data-model.md` nor any prior migration added `transactions` to it — this was never flagged before milestone 7 because nothing subscribed to it until now. Added `supabase/migrations/0003_realtime_transactions.sql` (`alter publication supabase_realtime add table transactions;`).

**This agent's sandboxed environment could not apply it directly** — confirmed (not assumed) via `psql "$DB_URL"`: DNS resolution for `db.<ref>.supabase.co` fails outright in this environment, while HTTPS to the same project's REST/Auth API resolves and connects normally — an outbound-network restriction (allowlisted to HTTPS API traffic only), not a credentials or connection-string issue. The `supabase` CLI present here is also authenticated against an unrelated Supabase account/project, so `supabase db push` wasn't usable either. Same constraint as milestone 6's `0002_revenue_indexes.sql`.

**The user applied the migration manually against the live Supabase project. Re-verified afterward — realtime now works.** Before the migration was applied, inserting a test transaction row while the dashboard was open produced no live update and no console errors, isolating the gap to exactly the missing publication membership (see the "before" run in test notes below). After the user applied `0003_realtime_transactions.sql`, the identical live-fire test now succeeds: the "New payment" badge appeared **850ms** after the insert, and `verifiedRevenue`/`grossInflow` updated to the correct amount in the DOM **1466ms** after the insert — no manual page refresh, no console errors. Confirmed reliably reproducible (see notes on one flaky first attempt below).

## Client-side assumptions

- **No incremental patching of revenue state.** The realtime handler just re-runs the same `GET .../revenue` fetch rather than computing a delta client-side — simpler and correct given expected transaction volume (single digits to low hundreds per merchant, same reasoning `api.md`'s milestone 6 entry gives for computing aggregates in-route rather than via SQL views). Revisit only if merchants start generating enough realtime events that repeated full re-fetches become the bottleneck.
- **One realtime channel per merchant, resubscribed only when `merchant.id` changes** (not on every `session`/`granularity` change) — avoids tearing down and reconnecting the socket on every re-render; the handler closure always reads current `session`/`granularity` via the effect's own dependency capture at subscribe time. If granularity changes mid-session, a new transaction event will still refresh using whichever granularity was active when the channel was created, since the subscription effect doesn't re-run on granularity change. Not an issue functionally (the granularity toggle's own effect already re-fetches on toggle), just worth knowing the channel itself doesn't re-key on it.
- **Pending state reuses milestone 3's static pending copy** (no polling for approval status) — matches the milestone's explicit "no broken/empty dashboard" requirement without adding a new status-polling mechanism.
- **`grossInflow`/`verifiedRevenue` rendered as two separate lines** (not merged into one number) even though they're numerically identical today, per the milestone brief's explicit instruction not to build UI assuming permanent equality or inventing a fake distinction. When milestone 8 makes them diverge, no UI change should be needed.
- **Trend chart is a custom inline SVG-free bar chart** (`app/dashboard/trend-chart.tsx`, plain HTML/CSS divs) — no charting library was added (none was in `package.json`); single-series brand-blue bars with a hover tooltip, consistent with the `dataviz` skill's guidance that a single series needs no legend and should use the design system's primary hue directly.
- **Granularity toggle (`daily`/`monthly`)** calls the existing `?granularity=` query param from milestone 6 — no new backend behavior needed.

## Manual test notes

Ran Playwright against the local dev server (`next dev`), wired to the **live** Supabase project and **live** Monnify sandbox via the project's real `.env` — not a mock, same live services milestones 4–6 were verified against. (Running against the deployed Render URL directly wasn't possible from this session — see note below — but the app talks to the same live Supabase/Monnify backends either way; only the Next.js server itself was local.)

1. Landing page loads; new "Already have an account? Log in" link navigates to `/login`.
2. Full signup wizard (`/signup`) → `POST /api/merchants` → pending screen, same as milestone 3. New "Go to login →" link added to that screen.
3. Called `POST /api/merchants/:id/approve` with the real `ADMIN_API_SECRET` (mirroring milestone 4/6's admin-secret-gated flow) — got back a real Monnify sandbox reserved account number (`4003840919`).
4. Logged in at `/login` with the just-created merchant's real credentials → redirected to `/dashboard`.
5. Dashboard rendered the approved state correctly: virtual account number `4003840919` with a working "Copy" button, verified revenue `₦0` / gross inflow `₦0` (correct — no transactions yet), trend chart showing its empty state, granularity toggle present. Screenshot matches the established brand-blue/white-card/pill-button visual theme.
6. **Session persistence**: reloaded the page — stayed on `/dashboard` with data intact, no redirect to `/login`, confirming the SDK's default `localStorage` session persistence works.
7. **Sign out**: clicking "Sign out" called `supabase.auth.signOut()` and redirected to `/login` correctly.
8. **Data pipeline correctness (non-realtime)**: inserted a real `transactions` row directly (₦5,000, clearly marked `TEST-M7-REFRESH-*` in `monnify_reference` and `{"test": true}` in `raw_payload`) via the Supabase REST API with the service-role key, then loaded the dashboard fresh — `verifiedRevenue`/`grossInflow` correctly showed `₦5,000`, and the trend chart rendered a single bar. Deleted the test row afterward.
9. **Realtime (before migration applied)**: with the dashboard open and subscribed, inserted a second test row (`TEST-M7-REALTIME-*`, ₦5,000) the same way. **No live update fired** — expected, given the `supabase_realtime` publication gap described above; confirmed via a 12s wait for the "New payment" badge that never appeared. No console errors were logged, ruling out a client-side subscription bug. Deleted the test row afterward.
10. No unexpected browser console errors during any step of the flow (`page.on("console")`/`page.on("pageerror")` both empty across the full run).
11. Cleaned up all test data: deleted the test merchant's `merchants` row and its `auth.users` row via the admin API after the run.

### Re-verification after the user applied `0003_realtime_transactions.sql`

Signed up and approved a **second, fresh** test merchant (`5c0a33fa-643a-4532-a919-d71dc5a90875`, real Monnify sandbox account `0014697920`), repeated steps 1–7 above (all still correct), then re-ran the live-fire realtime test:

- Opened the dashboard signed in as the test merchant, confirmed the subscription connects (`supabase.channel(...).subscribe()`, no console errors).
- Inserted a test transaction (`TEST-M7-REALTIME2-*`, ₦7,500) via the Supabase REST API with the service-role key while the dashboard stayed open, untouched.
- **First attempt timed out at 20s** — no badge, no console errors either. Likely a one-off Realtime websocket join delay (the channel had just been created moments before the insert) rather than a real defect; not reproduced on retry.
- **Second attempt succeeded**: "New payment" badge appeared **850ms** after the insert; `verifiedRevenue` and `grossInflow` both updated to **₦7,500** in the DOM **1466ms** after the insert — confirmed via `page.waitForFunction` polling the actual rendered text, not just the badge. All without a manual page refresh. Screenshot (`09-realtime-live-fire.png`) shows the updated card with the "New payment" badge and the ₦7,500 total. No console errors during the run.
- Cleaned up the test transaction row, the test merchant's `merchants` row, and its `auth.users` row afterward.

**Milestone's "done-when" is now confirmed working end-to-end**: a transaction landing in `transactions` for a signed-in merchant updates the dashboard's revenue totals and trend live, without a manual refresh. The one flaky first attempt is worth a note for whoever next touches this: if a live demo inserts a payment *immediately* after the dashboard first loads, consider a small delay (a second or two) for the Realtime channel to finish joining before relying on the first event — not fixed in code since a retry always succeeded and the milestone doesn't require sub-second reliability, but flagging in case it recurs during the actual investor demo (milestone 16).

**Still run against a local dev server wired to the live Supabase/Monnify backends, not the deployed Render URL directly** — this agent's environment has no path to the deployed URL beyond the same HTTPS calls the local server already makes to the same live Supabase project, so the underlying verification is equivalent, but a literal pass against `https://proofr.onrender.com` itself wasn't performed from here.

## Before finishing

- No API keys or secrets were committed — `.env` remains gitignored; only `supabase/migrations/0003_realtime_transactions.sql` (schema-only, no secrets) and the app code are new.
