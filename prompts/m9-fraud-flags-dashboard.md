# Build prompt — Milestone 9: Fraud flags surfaced on dashboard

Paste this whole prompt to the coding agent to execute M9.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements
2. `plan.md` — the full milestone list (you are implementing milestone 9 only)
3. `userflows.md` — merchant flow step 10, which this milestone implements ("merchant sees fraud flags on their own transactions, if any")
4. `fraud-rules.md` — the four rule types, severities, and what they mean, so flags can be labeled meaningfully rather than as opaque codes
5. `data-model.md` — the `fraud_flags` table shape and its RLS policy
6. `api.md` — as-built API reference; read the **milestone 6 and milestone 8 entries in full** — milestone 8 is what actually populates `fraud_flags` and changed `verifiedRevenue`'s meaning
7. `handoff.md` — read all eight milestone entries, especially milestone 7's dashboard structure (you're extending it, not rebuilding it) and milestone 8's explicit "seam left for milestone 9" note

Milestones 1–8 already delivered: a working merchant dashboard (`app/dashboard/page.tsx`, `app/dashboard/trend-chart.tsx`) showing the virtual account, `grossInflow`/`verifiedRevenue` as two separate lines (per milestone 7's handoff note, deliberately not merged, anticipating this milestone), a trend chart, and a live Supabase Realtime subscription on `transactions`. The fraud engine (`lib/fraud.ts`) now writes real `fraud_flags` rows synchronously from the webhook route, and `verifiedRevenue` already reflects open flags. Per milestone 8's handoff note, **no API route exists yet to read `fraud_flags`** — you can query it directly via the RLS-scoped browser client (`fraud_flags_select_own` RLS policy already exists per `data-model.md`, same pattern milestone 7 used for the `merchants` table) or add a small API route if you want server-side joins/formatting; milestone 8 left that choice to you.

Read every image in `ui-inspirations-theme/` before writing any component — per `handoff.md`'s standing convention, this is the visual spec (Moniepoint-style Nigerian fintech look), not optional trim. Match the palette already established in `app/globals.css`.

## Your task: Milestone 9 — Fraud flags surfaced on dashboard

Make a flagged transaction visibly distinguishable on the merchant dashboard.

### Scope

1. **Decide the data access approach** and be consistent with milestone 7's pattern where it fits: a direct RLS-scoped `fraud_flags` read (joined to `transactions` client-side or via a Supabase `select` with an embedded relation) is simplest and matches how milestone 7 already reads `merchants`, but if you need transaction context (amount, payer, date) alongside each flag and a single client-side query gets awkward, a small API route is fine too — your call, document which you picked and why.

2. **Surface flags on the dashboard**
   - A visible badge or list distinguishing flagged transactions from clean ones — per `userflows.md` step 10 and the milestone's done-when, the key requirement is that a flagged transaction is *visibly distinguishable*, not that you build a full fraud-management UI (that's the admin stub, milestone 14).
   - Show enough for a merchant to understand what happened: which rule triggered (translate `rule_type` — `circular_transfer`/`self_funding`/`identical_transfers`/`velocity_spike` — into plain language, not raw enum strings), and severity (high/medium per `fraud-rules.md`).
   - Only show **open** flags as active/concerning — `status: "overridden"` flags exist in the schema for milestone 14's admin override flow; if you display them at all (e.g. in a resolved/cleared state), visually distinguish them from open ones rather than mixing them in as equally urgent. No override action exists in this UI — that's milestone 14, admin-only.
   - Reflect the `grossInflow` vs `verifiedRevenue` split that's already on the dashboard: now that they can genuinely diverge (per milestone 8), consider a small explanatory note when they differ (e.g. "₦X excluded due to flagged activity") so the gap isn't confusing — small addition, not a new feature.

3. **Realtime**
   - Milestone 7 already subscribes to `transactions` inserts. Since flags are written synchronously in the same webhook call (per milestone 8), decide whether the existing transaction-insert subscription is enough to trigger a flag re-fetch on the same event, or whether you also need to subscribe to `fraud_flags` changes directly (its RLS policy already supports it). Prefer reusing the existing subscription/re-fetch cycle if it's sufficient — don't add a second realtime channel unless the timing actually requires it (e.g. if the flag write can occur slightly after the transaction insert event fires, which it does, since `runFraudChecks` runs after the insert in the same request).

### Explicitly out of scope for this milestone

Do not build the Proof-of-Revenue report or its confidence score — that's milestone 10. Do not build the admin override flow — that's milestone 14; nothing in this UI should let a merchant clear or dismiss their own flags. Do not build the lender portal.

### Done-when (from plan.md)

A flagged transaction is visibly distinguishable — i.e. viewing the dashboard for a merchant with at least one open fraud flag on a real transaction shows that transaction (or the fact that flagged activity exists) clearly differently from a clean one, on the deployed Render URL.

### Before you finish

- Per this project's standing rule, manually test in a real browser against the deployed Render URL. Since real Monnify sandbox payments won't naturally trigger fraud rules on demand, seed test transactions/flags directly against a real (or disposable fixture) merchant — following milestone 6/8's convention of clearly-marked test data (`TEST-M9-SEED-*` or similar), cleaned up after — to produce at least one open flag of each severity and confirm both render correctly, then clean up and confirm the dashboard returns to a clean state.
- Confirm the realtime behavior actually works live: trigger a transaction that gets flagged while the dashboard is open, and confirm the flag appears without a manual refresh.
- Drop an `integration.md` per `handoff.md`'s convention: which tables/endpoints were queried and how, any mismatch found, client-side assumptions (e.g. how flags are fetched relative to transactions), and manual test notes including the live realtime test.
- Add a one-line pointer to that `integration.md` in `handoff.md`'s milestone 9 entry.
- Double check no real API keys or secrets got committed.
- Report back: the deployed URL/path to see it, and confirmation a real flagged transaction was observed rendering correctly (not just implemented).
