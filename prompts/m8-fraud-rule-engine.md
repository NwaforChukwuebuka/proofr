# Build prompt — Milestone 8: Fraud rule engine

Paste this whole prompt to the coding agent to execute M8.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements
2. `plan.md` — the full milestone list (you are implementing milestone 8 only)
3. `architecture.md` — system design; the diagram shows the fraud engine consuming each transaction synchronously, same process, right after webhook ingestion
4. `fraud-rules.md` — the four rules you're implementing, verbatim definitions, SQL sketches, severities, and confidence-score penalties. Implement exactly these four rules, exactly as specified — this doc is the spec, not a starting point to improve on
5. `data-model.md` — the `fraud_flags` table shape you're writing to, and the `transactions` table you're reading from
6. `api.md` — as-built API reference; read the **milestone 5 and 6 entries in full** — you're modifying both the webhook route and the revenue route this milestone
7. `handoff.md` — read all seven milestone entries, especially milestone 6's explicit note that `verifiedRevenue` must be revisited once `fraud_flags` has real data, and milestone 7's note that the dashboard already renders `grossInflow`/`verifiedRevenue` as separate lines anticipating this

Milestones 1–7 already delivered: real Monnify sandbox payments land in `transactions` via `POST /api/webhooks/monnify` ([app/api/webhooks/monnify/route.ts](app/api/webhooks/monnify/route.ts)); `GET /api/merchants/:id/revenue` ([app/api/merchants/[id]/revenue/route.ts](app/api/merchants/[id]/revenue/route.ts)) currently treats `grossInflow` and `verifiedRevenue` as identical, by design, pending this milestone; the merchant dashboard is live with realtime updates. `fraud_flags` is currently empty — no rows have ever been written to it.

## Your task: Milestone 8 — Fraud rule engine

Implement the four rules from `fraud-rules.md` against each incoming transaction, write flags to `fraud_flags`, and make `verifiedRevenue` actually mean something.

### Scope

1. **Fraud engine module** (e.g. `lib/fraud.ts`)
   - Implement all four rules exactly as `fraud-rules.md` specifies:
     - **Circular transfers**: same payer → merchant, `>= 3` times in a rolling 24h window. High severity, -20/distinct triggering payer.
     - **Self-funding**: transaction's payer identity matches the merchant's own KYC identity. High severity, -30, single occurrence is enough.
     - **Excessive identical transfers**: `>= 5` transactions, identical amount, same payer, rolling 1h window. Medium severity, -10/triggering group.
     - **Velocity spikes**: 1h transaction count or volume `>= 3x` the merchant's trailing 7-day hourly average. Medium severity, -15.
   - `fraud-rules.md`'s SQL sketches operate on `payer_account` — use what's actually available on `transactions` (per `api.md`'s milestone 5 entry, `payer_account` is populated from Monnify's `paymentSourceInformation[0].accountNumber`, falling back to `null` if absent). Decide and document how each rule behaves when `payer_account` is `null` for a given transaction (e.g. can't match "same payer" against nothing) — don't let a null crash the rule or silently produce false positives/negatives without noting which.
   - **Self-funding** needs a concrete definition of "merchant's own KYC identity" given what's actually on the `merchants` row: milestone 2's `mockVerifyBvnNin` stores only a boolean + a hashed `kyc_reference`, never a raw BVN/NIN (see `handoff.md` milestone 2/4 entries) — so there is no raw identity value to compare `payer_account` against today. Decide the most honest implementation given this real constraint (e.g. compare against a personal account number if one is ever captured, or note that this rule cannot fire against real data yet and implement it in a way that's correct once such data exists, without inventing a fake identity field). Document the decision — don't silently skip the rule without saying so.
   - Rules should be independently callable/testable functions, not one monolith — `fraud-rules.md`'s "seeded test transactions correctly trigger/don't trigger each rule" done-when implies each rule needs to be verifiable in isolation.

2. **Wire into `POST /api/webhooks/monnify`**
   - Per `architecture.md`'s diagram and `api-contracts.md`'s note that "fraud/revenue processing happens synchronously in-process for the MVP," run the fraud engine against the merchant's relevant transaction history right after a new transaction is successfully inserted, before acking. Milestone 5 deliberately left no engine calls in this route yet (nothing existed to call) — this is the first thing to synchronously hook in.
   - Insert a `fraud_flags` row (per `data-model.md`: `transaction_id`, `rule_type`, `severity`, `status: "open"`) for each rule that triggers. Avoid duplicate flags for the same transaction/rule pair if the webhook is retried (idempotency already dedupes the transaction insert itself via `monnify_reference`, but consider whether a rule could otherwise double-fire).
   - Keep the webhook's ack fast — per scope, the four rules are lightweight queries/JS logic per `fraud-rules.md`, not anything that should meaningfully slow down the response; don't add unrelated synchronous work.

3. **Revisit `verifiedRevenue` in `GET /api/merchants/:id/revenue`** — the seam milestone 6 explicitly left
   - Change `verifiedRevenue`'s computation to exclude transactions with an **open** flag at **high or medium** severity (per milestone 6's proposed definition — confirm this still makes sense against `fraud-rules.md`'s actual severities, all four rules are high or medium, so this effectively means "any open flag excludes the transaction"; state plainly in your handoff entry if you land on a different threshold and why).
   - `grossInflow` stays the unfiltered sum, unchanged.
   - Overridden flags (`status: "overridden"`) do not count against `verifiedRevenue` — per `fraud-rules.md`'s confidence-score note, though milestone 14 (admin override) doesn't exist yet, so no flag will actually reach `overridden` status until then; implement the filter correctly regardless (`status = 'open'` is what should exclude a transaction, not merely "has any flag").

### Explicitly out of scope for this milestone

Do not build the dashboard fraud-flag UI — that's milestone 9 (per milestone 7's handoff note, the dashboard already has the `grossInflow`/`verifiedRevenue` split ready for it). Do not build report generation or the confidence score shown on a report — that's milestone 10, though it will consume `fraud_flags` and the penalty values `fraud-rules.md` already specifies. Do not build the admin override flow — that's milestone 14; `fraud_flags.status` should support `"overridden"` per the schema, but nothing needs to set it yet.

### Done-when (from plan.md)

Seeded test transactions correctly trigger/don't trigger each rule — i.e. for each of the four rules, a constructed sequence of `transactions` rows that should trigger it produces the expected `fraud_flags` row(s), and a sequence that shouldn't trigger it produces none.

### Before you finish

- Test each rule against the live Render deployment + real Supabase project: seed transaction sequences (clearly marked as test data, e.g. via `monnify_reference` prefixes like milestone 6's `TEST-M6-SEED-` convention, cleaned up after) that should and shouldn't trigger each rule, send them through the real webhook path where feasible (or insert directly + invoke the fraud engine if simulating four distinct rule conditions through real Monnify sandbox payments isn't practical in the time available — be honest in your report about which path was used for which rule).
- Confirm `verifiedRevenue` actually drops once a transaction gets an open flag, and recovers if you clear it (even via a direct Supabase update, since the real override route doesn't exist yet).
- Double check no real API keys or secrets got committed.
- Update `handoff.md` with a milestone 8 entry: the `payer_account`-null handling decision, the self-funding identity decision and its real limitation, verification results per rule, and the seam left for milestone 9 (dashboard UI) and milestone 10 (report generation / confidence score, which can now compute the real penalty math from `fraud-rules.md` against real `fraud_flags` rows).
- Report back: which rules were verified via a real webhook path vs. direct DB seeding + direct engine invocation, and confirmation `verifiedRevenue` correctly reflects open flags for a real test merchant.
