# PROOFR — User Flows

Cross-references [PRD user stories](PROOFR_MVP_PRD.md#user-stories) and [plan.md](plan.md) milestone numbers.

## Merchant flow

Implements plan.md milestones 2–7, 9–11, 15, 17, 19, 23.

1. Landing page → Signup (phone/email) — *milestone 3*
2. KYC verification (BVN/NIN) — *milestone 2, 3*
3. Business details form, optionally including personal account number and business start date — *milestone 2, 3, 17*
4. Pending approval state — *milestone 2*
5. Approved: virtual account number shown — *milestone 4, 7*
6. Merchant shares virtual account with customers — *milestone 7*
7. Customer pays → webhook received → transaction stored — *milestone 5*
8. Dashboard updates in realtime with new revenue — *milestone 6, 7*
9. Merchant views revenue trends (daily/monthly) — *milestone 6, 7*
10. Merchant sees fraud flags on their own transactions, if any — *milestone 9*
11. Merchant generates Proof-of-Revenue report, now showing a credit score (repayment-likelihood signal, not just fraud confidence) and a recommended loan amount with plain-language rationale — *milestone 10, 11, 17, 19*
12. Merchant shares report with a lender (link/download) — *milestone 11*
13. If a loan is approved, merchant sees simulated repayment against future revenue, at risk-based interest/term (not a fixed schedule) — *milestone 15, 20*
14. Merchant reviews and toggles whether third-party platforms (outside their own lender-portal relationships) can look up their score by phone number — off by default, on their own dashboard — *milestone 23*

## Lender flow

Implements plan.md milestones 12–13, 15, 18–21.

1. Lender login — *milestone 12*
2. Search merchant (by name/ID/shared report link) — search results now badge on credit score, not the narrower fraud confidence score — *milestone 12, 13, 18*
3. View merchant's credit score (headline figure, with component breakdown) + recommended loan amount + fraud confidence score + revenue summary — *milestone 12, 13, 18, 19*
4. Download/view Proof-of-Revenue report — *milestone 12, 13*
5. Approve loan — amount input pre-fills with the recommended amount (one-click accept, or edit); approved terms (interest rate, length) are risk-based on the merchant's credit score, not a fixed schedule — *milestone 13, 19, 20*
6. View simulated repayment status over time — *milestone 15*
7. (Internal/admin, not lender-facing) `GET /api/admin/loan-outcomes` pairs each loan's predicted score/recommendation against its derived outcome, for future recalibration once real repayment data exists — *milestone 21*

## Third-party platform flow (Phase 4 public API)

Implements plan.md milestones 22–23. Not a PROOFR lender-portal session — a separate class of integrator entirely.

1. Platform is manually vetted and provisioned an API key (`scripts/provision-api-client.ts`) — no public self-serve signup, same posture as lender provisioning.
2. Platform calls `GET /api/public/score?phone=<E.164>` with `x-api-key`.
3. Returns a score only if the merchant is both `approval_status: "approved"` **and** has explicitly opted in via their own dashboard toggle (milestone 23) — otherwise a `404` indistinguishable from a nonexistent phone number.
4. Response is capped at three summary fields (confidence score, credit score, recommended loan amount) — never revenue, breakdowns, or transaction data, even less than an authenticated lender sees.
5. Every query is logged (`api_access_log`) for audit purposes, since no rate-limiting exists yet.

## Admin flow (stub)

Implements plan.md milestone 14. Intentionally minimal — not a full CRUD app.

1. Admin login (auth-gated)
2. View fraud queue (list of open `fraud_flags`)
3. Inspect a flagged transaction (amount, rule triggered, merchant)
4. Manually override the flag (clear or confirm) — updates `fraud_flags.status`

## Investor Demo Flow (reference)

The [PRD's Investor Demo Flow](PROOFR_MVP_PRD.md#investor-demo-flow) is the exact sequence rehearsed in plan.md milestone 16:

1. Merchant signs up. → Merchant flow steps 1–4
2. Virtual account issued. → Merchant flow step 5
3. Demo customer pays. → Merchant flow step 7
4. Revenue dashboard updates. → Merchant flow step 8
5. Fraud engine scores payment. → Merchant flow step 10
6. Proof-of-Revenue report generated. → Merchant flow step 11
7. Lender approves mock loan. → Lender flow step 5
8. Repayment automation illustrated. → Merchant/Lender flow step 13/6
