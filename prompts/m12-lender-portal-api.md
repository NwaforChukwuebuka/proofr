# Build prompt — Milestone 12: Lender portal API

Paste this whole prompt to the coding agent to execute M12.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements
2. `plan.md` — the full milestone list (you are implementing milestone 12 only)
3. `userflows.md` — the lender flow, steps 1–5, which this and milestone 13 implement together
4. `data-model.md` — the `lenders` and `loans` tables, and the RLS policy for both ("lenders can select any merchants/reports row... can insert/update only their own loans rows")
5. `api-contracts.md` — the frozen Lender and Loans route contracts
6. `api.md` — as-built API reference; read the **milestone 10 entry in full** — `GET /api/lenders/merchants/:id` is specced to return the same shape as `GET /api/merchants/:id/report`, which already has a working lender-bearer-token auth branch you should reuse, not reimplement
7. `handoff.md` — read all eleven milestone entries, especially milestone 10's and 6's notes flagging exactly this reuse opportunity, and milestone 8's fraud/confidence-score work this route indirectly surfaces via `GET /api/lenders/merchants/:id`

Milestones 1–11 already delivered: merchants can sign up, get approved, receive real Monnify payments, get scored for fraud, and generate shareable Proof-of-Revenue reports (`GET /api/merchants/:id/report`, already lender-bearer-token-aware). `lenders` is currently an empty table — **no lender ever gets created anywhere in the plan**. There is no `POST /api/lenders` signup route in `api-contracts.md`, and `userflows.md`'s lender flow starts at "1. Lender login," not signup. This is a real gap you need to resolve, not an oversight to ignore.

## Your task: Milestone 12 — Lender portal API

Merchant search, fetch score/revenue, fetch report — the backend a lender needs before milestone 13 can build a UI on top of it.

### Scope

1. **Resolve the missing lender provisioning gap**
   - Since nothing in `plan.md`/`api-contracts.md` specs a lender signup flow, provisioning a real lender is out of scope to build as a public endpoint — don't invent a `POST /api/lenders` route that isn't in the frozen contract. Instead, create at least one real lender for testing/demo purposes directly: a Supabase Auth user (same `auth.admin.createUser` mechanism `POST /api/merchants` already uses, or done manually via the Supabase dashboard) plus a matching `lenders` row (`auth_user_id`, `org_name`). Document exactly how you did this in your handoff entry — the milestone 16 demo rehearsal will need to know how to get a lender account to log in with.
   - A lender then authenticates the same way merchants already do: `supabase.auth.signInWithPassword` against the browser client (milestone 13 will build the actual login UI; you're just confirming the mechanism works for a `lenders`-table user the same way it works for a `merchants`-table one).

2. **`GET /api/lenders/search?query=...`** per `api-contracts.md`
   - Auth: lender (reuse the bearer-token pattern already established — `supabase.auth.getUser(token)` then check for a `lenders` row matching the resulting user id, same check already living in the revenue/report routes).
   - Search `merchants` by name or id matching `query` (case-insensitive partial match on `business_name` is reasonable for "search by name"; exact match for a valid UUID `query` covers "by ID").
   - Response: `[{ merchantId, businessName, confidenceScore }]`. `confidenceScore` isn't stored on `merchants` — it only exists on a generated `reports` row. Decide how to handle a merchant with no report yet generated (e.g. omit them from results, or include them with a `null`/`100` score and state which you chose and why — don't silently misrepresent an unscored merchant as scored). For merchants with reports, use each merchant's most recently generated report's `confidence_score` — one additional query or a join, your call on the simplest correct approach given expected result-set sizes.

3. **`GET /api/lenders/merchants/:id`** per `api-contracts.md`
   - Per `api-contracts.md`'s own text ("same shape as `GET /api/merchants/:id/report`") and milestone 10's handoff note flagging this exact reuse opportunity: this should call the same underlying logic as `GET /api/merchants/:id/report`'s bearer-token path (extract a shared function, or literally have this route delegate to it) rather than reimplementing report assembly. Auth is already lender-aware there — confirm it still is, don't re-gate it differently.

4. **Loan routes** — `api-contracts.md`'s "Loans" section (`POST /api/loans`, `POST /api/loans/:id/approve`) isn't explicitly called out in `plan.md`'s milestone 12 bullet, but nothing else in the plan owns a *backend* route for them before milestone 15 (repayment automation), and milestone 13's frontend done-when ("a lender can search → view → approve a mock loan in the browser") requires them to exist. Build them here as the pragmatic backend home for lender-facing loan actions:
   - `POST /api/loans`: auth lender, request `{ merchantId, amount }`, insert a `loans` row (`merchant_id`, `lender_id` from the authenticated lender, `amount`, `status: "pending"`), response `{ loanId, status: "pending" }`.
   - `POST /api/loans/:id/approve`: auth lender (must be the loan's own `lender_id` — per `data-model.md`'s RLS intent that lenders only touch their own `loans` rows), flips `status` to `"approved"`, sets `approved_at`. The contract requires a `mockRepaymentSchedule` in the response — milestone 15 owns building the real "simulated deduction from future revenue" logic; for this milestone, populate `mock_repayment_schedule` with a simple, clearly-provisional placeholder (e.g. an even split of the loan amount across a fixed number of periods) and say plainly in your handoff entry that milestone 15 is expected to replace this computation, the same way milestone 2 left `monnifyAccountNumber: null` for milestone 4 to fill in for real.

### Explicitly out of scope for this milestone

Do not build the lender portal UI — that's milestone 13. Do not build the real repayment-simulation logic — that's milestone 15; this milestone only needs the `loans` row and response shape to exist so milestone 13 has something to call. Do not build a public lender signup flow — not in the frozen contract, and inventing one risks a shape milestone 13/16 doesn't expect.

### Done-when (from plan.md)

An authenticated lender can query and retrieve a real merchant's report via API — i.e., using the real lender account you provisioned, `GET /api/lenders/search`, `GET /api/lenders/merchants/:id`, and the loan routes all work correctly against the deployed Render URL and real Supabase/report data from earlier milestones.

### Before you finish

- Test against the live Render deployment with the real lender account and real merchant/report data already in Supabase from earlier milestones (e.g. reuse or re-seed a merchant with a generated report, following the `TEST-M12-SEED-*` convention for anything new, cleaned up after).
- Confirm a lender token is correctly rejected (`401`/`403`) on all four routes when missing/invalid, and confirm a non-lender (e.g. a merchant's own token) is correctly rejected too where the contract calls for lender-only auth.
- Double check no real API keys or secrets got committed, and that the lender test account's password isn't committed anywhere either.
- Update `handoff.md` with a milestone 12 entry: exactly how the test lender account was provisioned (needed for milestone 16's rehearsal), the `confidenceScore`-for-unscored-merchants decision, confirmation of the `GET /api/lenders/merchants/:id` reuse of the report route's logic, and the placeholder nature of `mockRepaymentSchedule` for milestone 15 to replace.
- Report back: example request/response for all four routes against the live deployment with real data, and the lender test account's credentials (via a secure channel/description, not committed to the repo) for milestone 13/16 to use.
