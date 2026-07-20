# PROOFR MVP Product Requirements Document (PRD)

## Version

-   Version: 1.0 (Investor MVP)
-   Status: Draft

## Vision

PROOFR is Africa's credit intelligence infrastructure: it turns verified
business payment behavior into a repayment-likelihood signal so lenders
can answer their actual question — "should I trust this specific
informal business with credit?" — for merchants who have no bank
statements, no CAC registration, and no credit history.

Payment collection (the virtual account, the webhook ingestion, the
revenue dashboard) is the data-capture layer this runs on, not the
product itself. Any payments company can show a merchant their own
inflow total; the product is the decision PROOFR computes from it for a
third party who has never met that merchant.

## Problem

Millions of MSMEs operate through personal bank accounts, with no
financial statements, no formal registration, and no credit history.
Lenders don't lack the desire to serve them — they lack a way to answer
one specific question about one specific person: *if I lend ₦X to this
merchant, what is the probability they repay?* Revenue totals alone
don't answer that; a lender needs a signal that separates a business
that behaves consistently over time, has a real and returning customer
base, and isn't showing fraud-adjacent patterns, from one that doesn't.

## Known Constraints

Signals this product can plausibly use, and cannot, matter equally to
scoping this honestly:

-   **Available today, from data already captured**: transaction
    volume/trend, day-to-day revenue consistency, account tenure on
    PROOFR, and unique/repeat-customer counts derived from
    `transactions.payer_account`.
-   **Not available, and not roadmapped**: social media activity
    (Instagram/WhatsApp Business), device or location signals, phone
    carrier tenure. None of these have an accessible API today, several
    have no public API at all, and some raise data-sourcing/legal
    questions that haven't been evaluated. These are not silently
    dropped — they're explicitly out of scope until a real access path
    and legal basis exist.
-   **Partially available, with a known gap**: `payer_account` is only
    populated when the payer's bank includes it in the Monnify webhook
    payload — some transactions carry a null value and are excluded
    from customer-count signals rather than mismatched. Coverage should
    be reported alongside any customer-based signal, not treated as
    complete.

## MVP Goal

Demonstrate that: 1. Merchants will collect payments through dedicated
virtual accounts, producing a real transaction history. 2. Revenue and
fraud-risk signals can be computed from that history. 3. Those signals
combine into an actual repayment-likelihood score — not just a fraud
checklist — that a lender can view and act on. 4. Loan repayment can be
automated from future revenue.

## Success Metrics

-   100 onboarded merchants
-   80% active after 30 days
-   ₦50M verified payment volume
-   First lender integration
-   \<2% suspected fraud rate
-   Credit score generated for \>=80% of merchants with >=5 transactions
-   Lender-reported usefulness of the score (qualitative, first
    integration): does it change a real lending decision, not just
    accompany one

## Personas

### Merchant

Needs funding and simple payment collection.

### Lender

Needs trusted revenue data.

### Admin

Reviews fraud and manages merchants.

## In Scope

-   Merchant registration
-   KYC/KYB
-   Virtual account issuance
-   Payment webhook ingestion
-   Revenue dashboard
-   Basic fraud detection
-   Proof-of-Revenue report
-   Credit intelligence engine (credit score + recommended loan amount)
-   Risk-based loan terms
-   Public credit-lookup API (consent-gated)
-   Lender portal
-   Admin portal

## Out of Scope

-   Multiple countries
-   Cash digitization
-   Accounting suite
-   Insurance
-   Supplier financing

## User Stories

### Merchant

-   Register business
-   Complete verification
-   Receive virtual account
-   Share account with customers
-   View verified revenue
-   Share report with lender
-   Control (opt in/out) whether third-party platforms can look up their score

### Lender

-   Search merchant
-   View credit score, recommended loan amount, and revenue
-   Download report
-   Approve a loan at risk-based terms, pre-filled with the recommended amount

## Functional Requirements

### Merchant Onboarding

-   Phone/email signup
-   BVN/NIN verification
-   Business details
-   Approval workflow

### Payments

-   Issue reserved virtual account
-   Receive webhooks
-   Store immutable transaction records

### Revenue Engine

Compute: - Gross inflow - Verified revenue - Daily/monthly trends

### Fraud Rules

Flag: - Circular transfers - Self-funding - Excessive identical
transfers - Velocity spikes

### Proof-of-Revenue Report

Contains: - Merchant profile - Verification status - Revenue summary -
Trend charts - Fraud confidence score (fraud-flag-only signal) - Credit
score (repayment-likelihood signal, composed from revenue trend/
consistency, account tenure, customer repeat-rate, and the fraud
confidence score — see `credit-intelligence-engine.md`) - Fraud flags

### Credit Intelligence Engine

Compute: - Credit score (0-100, repayment-likelihood signal — see
`credit-intelligence-engine.md`) - Recommended loan amount (naira
figure, capacity-based) - Risk-based loan terms (interest rate + term
length, tiered by credit score) - Outcome-tracking snapshot on each
loan (for future recalibration once real repayment data exists)

### Public API

-   API-key-gated lookup of a merchant's credit score/recommended
    amount by phone number, for platforms outside PROOFR's own lender
    portal
-   Merchant-controlled consent (opt-in, revocable) gates every lookup
-   Every query logged for audit purposes

### Admin

-   Merchant review
-   Fraud queue
-   Manual overrides
-   Audit log
-   Loan-outcome reporting (predicted vs. actual, per loan)

## Non-functional Requirements

-   API-first
-   Mobile-first
-   \<2 second dashboard loads
-   Encryption in transit and at rest
-   Audit logging

## High-Level Architecture

Customer → Virtual Account → Payment Provider → Webhooks → Revenue
Engine → Fraud Engine → Credit Intelligence Engine → Merchant Dashboard
→ Lender Portal (loan approval at risk-based terms) → Public API
(consent-gated, third-party lookup). Full diagram in
`architecture.md`.

## Risks

-   Merchant revenue manipulation
-   Low adoption
-   Payment provider downtime

## Roadmap

Phase 1: MVP (payment collection + fraud rules + revenue dashboard) —
**done**. Phase 2: Credit scoring — v1 repayment-likelihood model from
data already captured in Phase 1 (see `credit-intelligence-engine.md`);
no new external integrations — **done**. Phase 3: Recommended loan
amount and risk-based loan terms (interest/length tied to credit
score) — **v1 done**; a full automated lending marketplace remains
future work. Phase 4: Cross-platform financial identity network — **v1
done**: an API-key-gated public credit lookup (`GET /api/public/score`)
with merchant-controlled, opt-in consent, so a score is usable beyond a
single lender relationship. Not yet done: rate-limiting on API keys,
merchant visibility into who has queried them, and demand validation
from a real external platform integration.

## Investor Demo Flow

1.  Merchant signs up.
2.  Virtual account issued.
3.  Demo customer pays.
4.  Revenue dashboard updates.
5.  Fraud engine scores payment; credit intelligence engine computes a credit score and a recommended loan amount from revenue behavior, tenure, and customer patterns — not just a fraud checklist.
6.  Proof-of-Revenue report generated, headlined by the credit score and recommended amount, with a fraud confidence score and revenue detail underneath.
7.  Lender opens the merchant, sees "recommended: ₦X" pre-filled, and approves a loan in one click at risk-based terms (interest/length tied to that merchant's score) — not a fixed, one-size-fits-all schedule.
8.  Repayment automation illustrated.

## Acceptance Criteria

-   Merchant onboarded in under 10 minutes.
-   Payments reflected within 30 seconds.
-   Report generated in under 5 seconds.
-   Fraud rules execute automatically.
-   Lender can access report securely.
