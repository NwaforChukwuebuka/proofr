# PROOFR — User Flows

Cross-references [PRD user stories](PROOFR_MVP_PRD.md#user-stories) and [plan.md](plan.md) milestone numbers.

## Merchant flow

Implements plan.md milestones 2–7, 9–11, 15.

1. Landing page → Signup (phone/email) — *milestone 3*
2. KYC verification (BVN/NIN) — *milestone 2, 3*
3. Business details form — *milestone 2, 3*
4. Pending approval state — *milestone 2*
5. Approved: virtual account number shown — *milestone 4, 7*
6. Merchant shares virtual account with customers — *milestone 7*
7. Customer pays → webhook received → transaction stored — *milestone 5*
8. Dashboard updates in realtime with new revenue — *milestone 6, 7*
9. Merchant views revenue trends (daily/monthly) — *milestone 6, 7*
10. Merchant sees fraud flags on their own transactions, if any — *milestone 9*
11. Merchant generates Proof-of-Revenue report — *milestone 10, 11*
12. Merchant shares report with a lender (link/download) — *milestone 11*
13. If a loan is approved, merchant sees simulated repayment against future revenue — *milestone 15*

## Lender flow

Implements plan.md milestones 12–13, 15.

1. Lender login — *milestone 12*
2. Search merchant (by name/ID/shared report link) — *milestone 12, 13*
3. View merchant score + revenue summary — *milestone 12, 13*
4. Download/view Proof-of-Revenue report — *milestone 12, 13*
5. Approve mock loan — *milestone 13*
6. View simulated repayment status over time — *milestone 15*

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
