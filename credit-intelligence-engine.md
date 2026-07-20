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
- Risk-based repayment *terms* (variable interest, variable term
  length) — milestone 19 added a recommended *amount*, but
  deliberately kept the existing fixed 3-month, no-interest schedule
  shape (`lib/repayment.ts`) rather than also varying terms in the same
  milestone. Milestone 20 (below) closes this gap.

## Recommended loan amount (milestone 19)

Answers a second, narrower question than the credit score alone: not
just "how likely is this merchant to repay," but "how much could they
plausibly repay." Implemented in `lib/loanRecommendation.ts`,
`computeLoanRecommendation`.

**The real gap this doesn't solve**: repayment capacity depends on
disposable income (revenue minus expenses), and PROOFR captures no
merchant expense data anywhere. Rather than fabricate an expense
estimate, this uses a stated, named assumption instead — repayment
capacity is capped at **25% of average verified monthly revenue**
(`CAPACITY_RATIO` in `lib/loanRecommendation.ts`), a standard
conservative benchmark in informal-sector underwriting when real
expense data isn't available. This is a documented heuristic, not a
measured number, and every report says so explicitly in its
`rationale` lines — a lender sees the assumption, not just the output.

**Formula**: `averageMonthlyVerifiedRevenue` (lifetime verified
revenue ÷ days spanned by the merchant's transaction history × 30,
zero if fewer than two transactions exist — no extrapolation from a
single data point) × 25% × (`credit_score`/100) = monthly installment
cap, × the existing 3-month term = `recommended_loan_amount`, rounded
to the nearest ₦1,000.

**Why credit_score scales it, not just gates it**: a merchant with the
same revenue but a weaker score (thin history, inconsistent income,
open fraud flags) gets a proportionally smaller recommendation, not
an identical one — makes the score's earlier work in this doc actually
change the lending outcome, not just sit next to it as a badge.

**Live-verified**, not just unit-tested — see `handoff.md`'s milestone
19 entry for the real numbers observed.

## Risk-based loan terms (milestone 20)

Milestones 12/15 fixed every mock loan at 3 months, 0% interest,
regardless of the merchant's `credit_score` — a strong-scored merchant
and a never-scored one got identical terms. `lib/loanTerms.ts`'s
`computeLoanTerms` replaces that fixed shape with three named tiers:

| Tier | `credit_score` | Term | Interest (flat, non-compounding) |
|---|---|---|---|
| Strong | ≥ 80 | 6 months | 5% |
| Fair | 50–79 | 4 months | 10% |
| Weak/unscored | < 50 or no score yet | 3 months | 15% |

Same honesty stance as the recommendation formula above: no real
default-rate data exists to derive these tiers statistically — they're
named, stated numbers a lender can see in each approval's `rationale`
array, not a fabricated precision model. A merchant with no report yet
gets the most conservative tier, not a default in either direction.
`lib/repayment.ts`'s `applyRepaymentDeductions` needed **no change** —
it already operates generically over however many periods a schedule
has, since it reads `mock_repayment_schedule` at runtime rather than
assuming a fixed length.

## Outcome-tracking infrastructure (milestone 21)

Recalibrating the credit score, the recommended amount, or the loan
tiers above against *real* repayment outcomes is blocked structurally:
every loan today is `lib/repayment.ts`'s simulated deduction, not a
real disbursement, so there is no real-world default/repayment signal
to learn from yet. Rather than either (a) fabricate a recalibration
that has nothing real to calibrate against, or (b) build nothing and
lose the chance to capture prediction data as it happens, milestone 21
adds pure infrastructure: `loans.credit_score_at_approval` and
`loans.recommended_loan_amount_at_approval` snapshot what the model
predicted at the exact moment a loan was approved (see
[data-model.md](data-model.md)), and `GET /api/admin/loan-outcomes`
(admin-secret-gated, same pattern as the milestone 14 fraud queue)
joins that prediction against each loan's current derived outcome
(`repaid_full` / `delinquent` / `in_progress`, computed fresh from
`mock_repayment_schedule`'s due dates vs now, never stored/cached).

This changes nothing about how any score or recommendation is
computed today — it's a data-capture pipe, not a model update. The
moment real loan outcomes exist (real disbursement, real default
tracking), recalibrating becomes a query against this table instead of
a data-modeling exercise started from scratch.

## Phase 4: portable, cross-platform identity (milestone 22)

The roadmap's "financial identity network" phase, scoped for a first
version as: **`GET /api/public/score?phone=<E.164>`**, letting a
third-party platform — not a provisioned PROOFR lender with a
Supabase session — look up a merchant's score by phone number. This is
the "Stripe for credit scoring" positioning from the original strategy
discussion made concrete: PROOFR's signal becomes queryable by anyone
vetted to integrate, not just the merchant's own lender-portal
relationships.

**Deliberately narrow, on purpose**:
- **Auth is API-key, not open/public.** `api_clients` are provisioned
  manually via `scripts/provision-api-client.ts` — no self-serve
  signup, same posture milestone 12 established for lenders. A raw key
  is shown once at provisioning time and never stored (only its
  SHA-256 hash lives in the database).
- **Only `approval_status: "approved"` merchants are queryable** — an
  unapproved/rejected merchant's existence isn't exposed externally.
- **Response is capped at the same three summary numbers** an
  authenticated lender already sees (`confidenceScore`, `creditScore`,
  `recommendedLoanAmount`) — never revenue figures, score breakdowns,
  fraud flag detail, or transaction data. A third party with no vetted
  relationship to a specific merchant gets *less* than a lender that
  merchant's report was actually shared with, not the same amount.
- **Every query is logged** (`api_access_log`) — found, not-found, or
  unauthorized — since no rate-limiting exists yet; this is the only
  abuse-detection mechanism today.

**Known, unresolved gap — stated plainly, not glossed over**: this
does not implement per-merchant consent or an opt-out. Any provisioned
`api_client` can query any approved merchant's phone number without
that merchant being notified or able to block it. This mirrors how
lender search already works internally (any lender can already look
up any merchant), extended outward to external platforms — but "a
lender" and "an unknown third-party platform with no relationship to
this merchant at all" are different in kind, not just degree. This is
explicitly flagged as needing resolution (merchant consent flow, an
opt-out mechanism, or at minimum a disclosure in the merchant-facing
product) before any real external platform is onboarded — not treated
as already solved by this milestone shipping.

## Output shape

Stored on the `reports` row (see [data-model.md](data-model.md)) as
`credit_score` (0-100) and `credit_score_breakdown` (jsonb — the named
component contributions, so a lender or a later debugging pass can see
why the number is what it is, not just the number itself). Milestone
19 adds `recommended_loan_amount` (numeric) and
`loan_recommendation_breakdown` (jsonb, including a `rationale` array
of plain-language lines) alongside these, additively.

## Non-goals of this document

This is not a claim that a 0-100 score is a validated predictor of
actual repayment — no real loan-outcome data exists yet to calibrate
against (every loan in the system today is `lib/repayment.ts`'s
simulated deduction against a mock schedule, not a real disbursement).
v1's job is to replace "no signal beyond fraud flags" with a
reasoned, transparent, reusable signal built on real data — not to
claim statistical validation it hasn't earned yet. Recalibrating
against real repayment outcomes, once they exist, is future work.
