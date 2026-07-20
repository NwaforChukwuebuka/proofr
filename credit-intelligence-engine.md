# PROOFR — Credit Intelligence Engine

Detail doc for the [PRD](PROOFR_MVP_PRD.md)'s Phase 2 roadmap item.
Companion to [fraud-rules.md](fraud-rules.md) (the fraud-only
`confidence_score`) and [data-model.md](data-model.md). Implemented at
`lib/creditScore.ts`.

## The question this answers

Not "how much revenue did this merchant report" — a lender can already
see that in `revenue_summary`. This answers: **given everything PROOFR
has observed about this merchant's payment behavior, how likely are
they to repay a loan?** The output is a single score plus its
component breakdown, not a replacement for the underlying data — a
lender should be able to see both the number and why.

## Relationship to the fraud confidence score

`lib/confidence.ts`'s `confidence_score` (documented in
[fraud-rules.md](fraud-rules.md#confidence-score)) answers a narrower
question — "does this transaction history look suspicious" — and is
**not renamed or removed**. The credit score is a separate, broader
figure that uses the fraud score as one input among several, not a
replacement for it. A report shows both, distinctly labeled, so a
lender can tell "this merchant looks clean but new" from "this
merchant looks clean and established" — the fraud score alone
conflates those.

## v1 signal set (what's actually derivable today)

No external integration is required for any of these — all come from
`merchants` and `transactions` rows already captured by the existing
onboarding/webhook pipeline.

| Signal | Source | Notes |
|---|---|---|
| Revenue trend | `lib/revenue.ts`'s `trend` | Direction over the available history, not just a total |
| Revenue consistency | `transactions.amount`, bucketed | Day-to-day variance — a merchant with volatile, spiky inflow is a different risk profile than one with steady daily inflow, even at the same total |
| Account tenure | `merchants.created_at` | Time on PROOFR, not time-in-business — see limitation below |
| Unique customer count | `transactions.payer_account` (distinct, non-null) | Undercounts when `payer_account` is null (bank didn't supply `paymentSourceInformation`) — reported as a coverage caveat, not corrected for |
| Repeat-customer % | Same field, grouped | Same coverage caveat |
| Fraud signal | `lib/confidence.ts`'s `computeConfidenceScore` | Reused as-is, one input among several here, not replaced |

## Known limitation: tenure

`merchants.created_at` measures time on PROOFR, not time the business
has actually operated — a merchant trading for five years who signed
up last week reads as brand new. Self-reported business start date
(captured at onboarding, see the merchant-onboarding change) is used
as a secondary, unverified tenure signal alongside platform tenure, and
the score's breakdown labels which one contributed — a lender should
be able to tell "we've observed this merchant for 8 months" from "this
merchant told us they've operated for 3 years," since only the former
is independently verified.

## Explicitly out of scope for v1

Not a smaller version of these — not present at all, until a real
access path and (where relevant) legal basis exist:

- Social media activity (Instagram, WhatsApp Business, Facebook) — no
  accessible API for the kind of bulk/programmatic read this would need.
- Device, location, or telecom-tenure data — no integration exists;
  telecom tenure specifically has no self-serve access path today.
- Recommended loan amount / risk-based repayment terms — a genuinely
  different, harder problem (translating a score into a specific naira
  figure and terms) than producing the score itself. Tracked as a
  separate, later roadmap item, not bundled into this milestone.

## Output shape

Stored on the `reports` row (see [data-model.md](data-model.md)) as
`credit_score` (0-100) and `credit_score_breakdown` (jsonb — the named
component contributions, so a lender or a later debugging pass can see
why the number is what it is, not just the number itself).

## Non-goals of this document

This is not a claim that a 0-100 score is a validated predictor of
actual repayment — no real loan-outcome data exists yet to calibrate
against (every loan in the system today is `lib/repayment.ts`'s
simulated deduction against a mock schedule, not a real disbursement).
v1's job is to replace "no signal beyond fraud flags" with a
reasoned, transparent, reusable signal built on real data — not to
claim statistical validation it hasn't earned yet. Recalibrating
against real repayment outcomes, once they exist, is future work.
