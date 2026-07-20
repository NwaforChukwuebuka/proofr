# Build prompt — Milestone 10: Proof-of-Revenue report generation

Paste this whole prompt to the coding agent to execute M10.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements; find the report generation acceptance criteria (report must generate in **<5s**)
2. `plan.md` — the full milestone list (you are implementing milestone 10 only)
3. `fraud-rules.md` — the confidence-score formula (start at 100, subtract each open flag's penalty, floor at 0; overridden flags don't count) — read this closely, it's the core of what this milestone computes
4. `data-model.md` — the `reports` table you're writing to (`revenue_summary`, `trend_data`, `confidence_score`, `fraud_flags_snapshot`, `generated_at`) and `merchants`/`fraud_flags` you're reading from
5. `api-contracts.md` — the frozen `POST /api/merchants/:id/report` and `GET /api/merchants/:id/report` contracts
6. `api.md` — as-built API reference; read the **milestone 6 and milestone 8 entries in full** — you're reusing/wrapping the revenue engine and the real fraud-flag data it produces
7. `handoff.md` — read all nine milestone entries, especially **milestone 8's "seam left for milestone 10" note** (the flag-counting-granularity problem below is the main design decision of this milestone) and milestone 9's note about the flag read pattern

Milestones 1–9 already delivered: a working revenue engine (`GET /api/merchants/:id/revenue`, real Supabase Auth bearer-token auth, `grossInflow`/`verifiedRevenue`/`trend`), a real fraud engine (`lib/fraud.ts`) writing real `fraud_flags` rows with `rule_type`/`severity`/`status`, and a dashboard that renders both. `reports` is currently an empty, unused table.

## Your task: Milestone 10 — Proof-of-Revenue report generation

Assemble profile + verification status + revenue summary + trend data + confidence score + fraud flags into a report record, and expose it via the two report routes.

### Scope

1. **Resolve the flag-counting problem milestone 8 flagged** — this is the central design decision here
   - `fraud-rules.md`'s penalties are worded per *distinct triggering group*, not per flag row: circular_transfer is "-20 points per distinct triggering payer," identical_transfers is "-10 points per triggering group," self_funding and velocity_spike are flat single deductions. But `lib/fraud.ts` (milestone 8) writes **one flag row per rule per transaction** — so a merchant with 5 identical-amount transactions from one payer could have up to 5 separate `identical_transfers` flag rows (one per qualifying transaction in the group), not 1.
   - Decide how confidence score computation reconciles this: either (a) group open flags by `rule_type` + a derived key (e.g. `transaction.payer_account` for circular_transfer/identical_transfers) and apply the penalty once per distinct group, or (b) apply the penalty per flag row and accept that this over-penalizes relative to `fraud-rules.md`'s literal wording. Pick one, implement it consistently, and state the choice plainly in your handoff entry — don't leave it ambiguous in the code. Given the 2-day timeline, grouping by `rule_type` + `payer_account` (or `rule_type` alone for self_funding/velocity_spike, which are already single-deduction rules) is likely the closer match to the spec's wording and not much more code than a naive per-row sum — but make the call yourself and justify it.
   - Confidence score: start at 100, subtract per the above, **floor at 0**. Only **open** flags count; `status: "overridden"` flags are excluded (per `fraud-rules.md` and confirmed behavior already in the revenue route).

2. **`POST /api/merchants/:id/report`** per `api-contracts.md`
   - Auth: merchant (own record) — reuse the bearer-token pattern from `GET /api/merchants/:id/revenue` (milestone 6) rather than inventing a new auth mechanism.
   - Assemble and insert a `reports` row: `revenue_summary` (gross inflow + verified revenue, reuse the milestone 6 computation rather than duplicating its logic — factor it into a shared function if it isn't already one), `trend_data` (same trend array shape), `confidence_score` (per above), `fraud_flags_snapshot` (the open flags at generation time, in whatever shape milestone 11's report view will want to render — raw rows are probably right, per milestone 9's note that the dashboard's plain-language labels are a display-layer concern, not a snapshot-storage concern).
   - Response: `{ reportId, generatedAt }`.
   - **Must return in <5s** per the PRD acceptance criteria — the revenue aggregation is already a single indexed query (milestone 6), and flag grouping is in-memory JS over what's typically a small row count, so this should be comfortably fast; confirm it with a real timing measurement against live data, don't just assume.

3. **`GET /api/merchants/:id/report`** per `api-contracts.md`
   - Auth: merchant (own record) **or** lender with a valid share link/report ID. There's no lender auth system yet (milestone 12) — per the same reasoning milestone 6 used, don't build one now. A reasonable minimal interpretation: the owning merchant's bearer token works as usual; for the "lender with a valid share link" case, treat knowledge of the specific `reportId` itself (a UUID, unguessable) as the credential for now — i.e. allow an unauthenticated (or lender-bearer-token-authenticated, if a lender happens to have signed in) fetch by `reportId` without requiring it to belong to the requesting merchant. State clearly in your handoff entry that this is a placeholder consistent with milestone 12/13 not existing yet, and what a real link-based share mechanism would need to add (e.g. a signed/expiring token) if this were shipping past the hackathon.
   - Response shape: `{ profile, verificationStatus, revenueSummary, trendData, confidenceScore, fraudFlags }` — `profile`/`verificationStatus` come from the `merchants` row (`business_name`, `bvn_nin_verified`, `approval_status`, etc. — pick a sensible minimal set, don't invent new merchant fields), the rest from the stored report snapshot. If no `id` param is given beyond the merchant id (per `api-contracts.md`, "Fetch latest (or specified) report"), default to the merchant's most recently generated report.

### Explicitly out of scope for this milestone

Do not build the report UI/view/share page — that's milestone 11. Do not build the lender portal — milestone 12/13. Do not build the admin override flow — milestone 14 (though note that once it exists, overriding a flag won't retroactively change an already-generated report's stored `confidence_score`/`fraud_flags_snapshot`, since reports are snapshots per `data-model.md` — that's expected, not a bug to fix here).

### Done-when (from plan.md)

Report generates in <5s per PRD acceptance criteria — i.e. `POST /api/merchants/:id/report` against the deployed Render URL for a real merchant with real transactions and (ideally) at least one real or seeded fraud flag returns a correctly-computed `reportId` well within 5 seconds, and `GET /api/merchants/:id/report` returns the full assembled shape correctly.

### Before you finish

- Test against the live Render deployment with real data: generate a report for a merchant with a clean transaction history (confirm `confidenceScore: 100`) and for a merchant/fixture with seeded open flags (confirm the score drops by the correctly-grouped amount, matching your documented grouping decision), and confirm an overridden flag doesn't affect the score. Follow the existing `TEST-M10-SEED-*`-style convention for any seeded data, cleaned up after.
- Measure and report the actual generation time against live data, not an assumption.
- Double check no real API keys or secrets got committed.
- Update `handoff.md` with a milestone 10 entry: the flag-grouping decision and why, the report-sharing auth placeholder and its real limitation, actual timing measurement, and the seam left for milestone 11 (report view/share UI) and milestone 13 (lender portal, which will call this same `GET` route).
- Report back: example `POST`/`GET` request-response pairs against the live deployment with real data, the measured generation time, and confirmation the confidence score math matches your stated grouping rule.
