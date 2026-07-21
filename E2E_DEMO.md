# PROOFR — End-to-end demo guide

Use this walkthrough to exercise the full product user flow on the live
deployment ([https://proofr.onrender.com](https://proofr.onrender.com)) —
merchant collection → realtime revenue → credit report → lender decision →
mock loan.

These are **sandbox demo accounts** (Monnify sandbox + seeded revenue). They
exist so graders can click through without provisioning their own merchant
or lender. Do not reuse the passwords outside this demo.

Verified end-to-end on 2026-07-21. The merchant below has revenue history and
a generated report, but **no loan yet** — so the “approve mock loan” step
can still be run live.

## Demo accounts

**Merchant** — "Zara Fabrics NG"
- Login: `demo-merchant-2@proofr.test` / `DemoInvestor2026!`
- Virtual account: `3396579271` (Wema Bank) — send a live transfer here
  during the realtime step
- Has ~90 days of clean, growing revenue from 6 repeat customers (seeded
  into `transactions`) and a generated report; no loan yet

**Lender** — "Demo Capital Partners"
- Login: `lender-demo@proofr.test` / `DemoInvestor2026!`

**Expected numbers on this merchant** (visible on login, before any new
payment):
- Verified revenue: ₦988,004
- Fraud confidence score: 100/100 (clean, zero flags)
- Credit score: 87/100 ("Strong" tier)
- Recommended loan amount: ₦215,000
- Loan terms for this tier: 6 months, 5% flat interest

## Click-through flow

1. **Landing page** (`/`) — optional marketing pass.
2. **Log in as the merchant** → dashboard. Revenue should show ~₦988,004
   verified; virtual account `3396579271` visible.
3. **Send a live payment**: open Monnify's Bank Simulator
   ([websim](https://websim.sdk.monnify.com/?#/bankingapp)), transfer into
   `3396579271`. With the dashboard open, watch the "New payment" badge and
   revenue total update **without a manual refresh** (Supabase Realtime).
   - **Timing**: the first Realtime subscription after a fresh page load can
     take ~20s. Wait a moment after the dashboard loads before sending the
     payment.
4. **Click "Generate report"** — confirm you see:
   - Credit score (headline + five-component breakdown)
   - Recommended loan amount with plain-language rationale
   - Fraud confidence score as a separate, narrower signal
5. **Log in as the lender** (new tab / incognito, or sign out first) →
   search "Zara" → open the merchant.
6. Confirm the same credit score, breakdown, recommended amount, and revenue
   summary. The loan-amount field should be **pre-filled with the
   recommended amount**.
7. **Click "Approve mock loan"** — schedule should use risk-based terms:
   6 months, 5% flat interest ("Strong" tier), not a generic fixed schedule.
8. *(Optional)* Send one more transfer, then reload the lender’s loan view —
   a repayment period should move to paid.
9. *(Optional)* Note the merchant dashboard "Third-party credit lookups"
   toggle and the public score API — credit infrastructure other platforms
   can plug into, not only a lender portal.

