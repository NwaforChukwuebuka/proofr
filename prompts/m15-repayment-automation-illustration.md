# Build prompt — Milestone 15: Repayment automation illustration

Paste this whole prompt to the coding agent to execute M15.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements; find the Investor Demo Flow's step 8 ("repayment automation illustrated") this milestone implements
2. `plan.md` — the full milestone list (you are implementing milestone 15 only)
3. `userflows.md` — merchant flow step 13 ("merchant sees simulated repayment against future revenue") and lender flow step 6 ("view simulated repayment status over time") — both are this milestone's territory, though neither has a dedicated frontend milestone of its own (milestone 15 is tagged `(Backend)` only)
4. `data-model.md` — the `loans` table (`status`, `mock_repayment_schedule` jsonb, `approved_at`) — there is **no separate repayments/ledger table**, and no RLS policy lets a merchant read their own `loans` rows (only lenders can select/update their own)
5. `api-contracts.md` — note there's no frozen `GET /api/loans/:id` route; the only loan routes are the two `POST`s already built in milestone 12
6. `api.md` — as-built API reference; read the **milestone 12 entry on `POST /api/loans/:id/approve` in full** — it already produces a `mockRepaymentSchedule` (a 3-period even split, no interest) and is explicit that it's a placeholder milestone 15 is expected to **replace**, not extend
7. `handoff.md` — read all fourteen milestone entries, especially milestone 12's placeholder note and its exact wording of what milestone 15 owns: "the real 'simulated deduction from future revenue' logic"

Milestones 1–14 already delivered: merchants receive real Monnify transactions via `POST /api/webhooks/monnify` (which already synchronously runs the fraud engine after each insert, per milestone 8); lenders can create and approve mock loans against a merchant (`POST /api/loans`, `POST /api/loans/:id/approve`), currently producing a static, never-updated 3-period even-split schedule.

## Your task: Milestone 15 — Repayment automation illustration

Replace the static placeholder schedule with a real (if simulated) mechanism: as a merchant's future revenue actually arrives, illustrate a deduction against their approved loan's repayment schedule. No real money moves — this is bookkeeping inside `loans`, not a change to `transactions`, `verifiedRevenue`, or anything Monnify-facing.

### Scope

1. **Design the deduction mechanism and document it clearly** — this is the core judgment call of the milestone, the same way milestone 8 had to design fraud-window logic and milestone 10 had to design flag-grouping:
   - Per `plan.md`'s wording ("tied to a mock loan") and userflows.md ("against future revenue"), the deduction must be triggered by *new revenue arriving after loan approval*, not by elapsed calendar time alone. The natural hook point is the same place milestone 8 already hooks in — `app/api/webhooks/monnify/route.ts`, synchronously after a successful transaction insert (and, if you want it to run after fraud scoring rather than before, that's your call, but keep it fast per the same "ack quickly" principle milestone 5/8 already established).
   - On each new transaction for a merchant, check whether that merchant has any loan with `status` `approved` or `repaying`. If so, apply a portion of the incoming transaction's amount toward the loan's outstanding schedule. A reasonable, simple default: accumulate incoming transaction amounts since the loan's last update, and when the accumulated amount covers a schedule period's due `amount`, mark that period paid (carry any remainder toward the next period) — but you may pick a different reasonable mechanism (e.g. a fixed percentage-of-each-transaction deduction) as long as it's genuinely tied to incoming revenue, not just time. State your choice and reasoning in your handoff entry.
   - Store progress **inside** `mock_repayment_schedule`'s existing JSON structure (e.g. adding `status: "pending" | "paid"`, `paidAt`, `paidAmount` per period) — no schema migration needed, it's already `jsonb`. Update `loans.status`: `approved` → `repaying` once the first deduction is applied, → `repaid` once every period is marked paid.
   - **Explicitly do not** touch `transactions`, `revenue_summary`/`verifiedRevenue`/`grossInflow` computations, or anything Monnify-facing — per `plan.md`'s "no real disbursement," this is illustrative loan bookkeeping only, not a change to what the merchant's revenue numbers mean elsewhere in the app. Say this plainly in your handoff entry so a later milestone doesn't assume loan repayment silently reduces reported revenue.

2. **Make the result observable** — the done-when requires this to be *visible*, and no route currently lets anyone re-fetch a loan's current state after approval.
   - `api-contracts.md` has no `GET /api/loans/:id` route. Add one as a small, documented, additive extension beyond the frozen contract (the same kind of pragmatic addition milestone 6's `?granularity` param and milestone 11's `reportId` field already made) — lender-only auth (reuse `lib/lender-auth.ts`'s `authenticateAsLender`), scoped to the loan's own lender per `data-model.md`'s RLS intent (same check `POST /api/loans/:id/approve` already does). Response: the loan's current `status` and `mock_repayment_schedule` (with per-period paid state).
   - There's no merchant-facing route or RLS policy for loans today — building one is a reasonable minimal addition if you want the merchant side of userflows.md step 13 to be independently verifiable too, but isn't required by this milestone's `(Backend)`-only, no-dedicated-UI scope; document whichever choice you make.

### Explicitly out of scope for this milestone

Do not build any UI for viewing repayment status — no frontend milestone in `plan.md` owns this (verify this via API responses instead). Do not touch the fraud engine, revenue engine, or report generation logic. Do not build real interest/amortization math beyond what milestone 12 already computes at approval time — you're making the *existing* schedule progress realistically as revenue arrives, not redesigning the schedule itself.

### Done-when (from plan.md)

Approving a mock loan visibly schedules/applies a simulated repayment — i.e., after a mock loan is approved for a real merchant, sending that merchant a real (or realistically seeded) transaction results in an observable change to the loan's stored repayment progress (a period moving from pending to paid, or `loans.status` advancing), fetchable via API against the deployed Render URL.

### Before you finish

- Test against the live Render deployment with real data: use a real approved test merchant with an approved loan (seed one following the `TEST-M15-SEED-*` convention if needed, cleaned up after), send a transaction large enough to cover a period (via a real Monnify sandbox payment if feasible, or a directly-inserted test transaction plus a direct call to your webhook-side deduction logic if a live sandbox payment isn't practical — be honest about which path was used), and confirm the loan's schedule/status actually updates. Repeat until the loan reaches `repaid` to confirm the full lifecycle, not just the first deduction.
- Confirm `transactions`/`verifiedRevenue`/`grossInflow` are provably unaffected by this milestone's changes (re-check a merchant's revenue numbers before and after a deduction is applied — they should be identical).
- Double check no real API keys or secrets got committed.
- Update `handoff.md` with a milestone 15 entry: the deduction mechanism you chose and why, confirmation revenue figures are untouched, the new `GET /api/loans/:id` route's shape, and a seam note for milestone 16 (demo rehearsal) on how to trigger a visible repayment during the live demo.
- Report back: example request/response showing a loan's schedule progressing across two or more transactions against the live deployment, and confirmation revenue numbers were unaffected.
