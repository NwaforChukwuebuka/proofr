# Build prompt — Milestone 6: Revenue engine

Paste this whole prompt to the coding agent to execute M6.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements; note the Revenue Engine section (`Gross inflow`, `Verified revenue`, `Daily/monthly trends`) doesn't define "verified" precisely — see below for why
2. `plan.md` — the full milestone list (you are implementing milestone 6 only)
3. `architecture.md` — system design; the diagram shows the revenue engine as SQL aggregates over `transactions`, same process, feeding the dashboard (milestone 7) and later the report (milestone 10)
4. `data-model.md` — the `transactions` table shape you're aggregating over
5. `api-contracts.md` — the frozen `GET /api/merchants/:id/revenue` contract
6. `api.md` — as-built API reference; read the milestone 5 entry in full
7. `handoff.md` — read all five milestone entries, **especially milestone 5's "seam left for milestone 6" note** — it flags two open decisions you must resolve here: (a) whether "verified revenue" should use gross `amount` (Monnify's `amountPaid`) or the fee-adjusted `settlementAmount` currently buried in `raw_payload->'eventData'->>'settlementAmount'` (not a first-class column), and (b) that no index exists yet on `transactions.merchant_id`/`created_at` beyond the `monnify_reference` unique constraint

Milestones 1–5 already delivered: the app deployed to Render with a working Supabase connection; approved merchants have real Monnify reserved accounts; `POST /api/webhooks/monnify` reliably inserts real, verified transaction rows into `transactions` (`merchant_id`, `monnify_reference`, `amount`, `payer_name`, `payer_account`, `raw_payload`, `created_at`) with idempotency on `monnify_reference`.

## Your task: Milestone 6 — Revenue engine

Compute gross inflow, verified revenue, and daily/monthly trend aggregates per merchant, and expose them via `GET /api/merchants/:id/revenue`.

### Scope

1. **Define "gross inflow" vs "verified revenue" for this milestone, and document the decision**
   - `PROOFR_MVP_PRD.md` names both terms but doesn't define the gap between them. The fraud rule engine (milestone 8) doesn't exist yet, so `fraud_flags` is empty — "verified" cannot yet mean "excluding fraud-flagged transactions" because there's nothing to exclude. Pick a concrete, defensible definition for *this* milestone (e.g. `gross inflow` = sum of all `transactions.amount` for the merchant; `verified revenue` = the same figure today, since no transaction has been fraud-screened yet — becoming a real distinction once milestone 8 lands) and write it down in your `handoff.md` entry so milestone 8/10 know what to change.
   - Resolve the gross-vs-net `amount`/`settlementAmount` question flagged in milestone 5's handoff note: decide whether either metric should use the fee-adjusted `settlementAmount` from `raw_payload`, or whether both stay on the first-class `amount` column for simplicity given the 2-day timeline. Either is defensible — just pick one, implement it, and say why in the handoff entry.

2. **Aggregate computation** (SQL views, or queries inside the route — your call, per `plan.md`'s "SQL views or scheduled Supabase function" phrasing; a scheduled/materialized approach is unnecessary complexity for this data volume and timeline, plain views or in-route aggregate queries are almost certainly sufficient, but decide based on what's actually simplest to get right)
   - Gross inflow: total revenue for the merchant.
   - Verified revenue: per your definition above.
   - Daily/monthly trend: time-bucketed sums (e.g. `date_trunc('day', created_at)` / `date_trunc('month', created_at)`) suitable for the trend chart milestone 7 will build.
   - Add whatever index(es) on `transactions` the queries you write actually need (e.g. `merchant_id`, `created_at`) — milestone 5 flagged none exist yet.

3. **`GET /api/merchants/:id/revenue`** per `api-contracts.md`
   - Auth: merchant (own record) or lender. Milestone 12 (lender portal API) doesn't exist yet and milestone 3's signup UI doesn't persist a client-side session (per its handoff seam), so there's no real lender-session or merchant-session auth mechanism wired up yet either. Implement the simplest correct thing given what actually exists: if Supabase Auth session/RLS is enough to scope a merchant to their own record via the anon-key client and a real JWT, use that (RLS already exists per `data-model.md`); don't build a parallel bespoke auth layer for lenders that milestone 12 will just replace. Document exactly what auth check you implemented and why in the handoff entry, and flag anything a later milestone must revisit.
   - Response shape: `{ grossInflow, verifiedRevenue, trend: [{ period, amount }] }`.

### Explicitly out of scope for this milestone

Do not build the merchant dashboard UI — that's milestone 7. Do not implement the fraud rule engine — that's milestone 8; don't write speculative fraud-aware filtering into "verified revenue" now, since there's nothing in `fraud_flags` to filter on yet (see above). Do not build the lender portal or its own auth system — that's milestone 12; only make `GET /api/merchants/:id/revenue` reachable in whatever minimal way actually works today.

### Done-when (from plan.md)

Querying a merchant returns correct aggregates for seeded/sandbox transactions — i.e. calling `GET /api/merchants/:id/revenue` against the deployed Render URL for a merchant with real transaction rows (from milestone 5's sandbox payments, plus additional seeded rows if useful for testing trend buckets) returns numerically correct `grossInflow`, `verifiedRevenue`, and `trend` figures.

### Before you finish

- Test against the live Render deployment with the real transaction data already in Supabase from milestone 5's sandbox payments — don't rely solely on freshly seeded data, since verifying against a real Monnify-sourced row is stronger evidence the aggregates are correct.
- If trend-bucket coverage needs more data points than currently exist, seed additional `transactions` rows directly (clearly marked as test data, cleaned up after) rather than triggering more real sandbox payments just for volume.
- Double check no real API keys or secrets got committed.
- Update `handoff.md` with a milestone 6 entry: the gross-inflow/verified-revenue definitions you chose and why, the gross-vs-net `amount` decision, the auth approach implemented for the revenue route, any new indexes/views added, and the seam left for milestone 7 (dashboard) and milestone 8 (fraud engine, which will need to revisit "verified revenue" once `fraud_flags` has real data).
- Report back: example request/response from the live revenue route against a real merchant with real transactions, and confirmation the numbers are correct against what's actually in Supabase.
