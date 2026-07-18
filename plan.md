# PROOFR — Build Plan (2-Day Monnify Hackathon)

## Overview

This plan turns the [PRD](PROOFR_MVP_PRD.md)'s Investor Demo Flow into a sequence of real, working milestones — not mocked stubs. Each milestone is done only when the described behavior actually works end-to-end (real Supabase rows, real Monnify sandbox calls, real UI). Built solo/paired, so milestones run sequentially: backend piece of a feature lands, then its frontend, then the next feature.

Stack: Next.js (TypeScript) PWA + Supabase (Postgres/Auth/Storage) + Monnify sandbox, deployed to Vercel from day one so Monnify's webhook has a stable public URL. See [architecture.md](architecture.md) for why this is a single monolith with a TS-only fraud engine.

**Legend**: `[ ]` not started · `[~]` in progress · `[x]` done · tag = `(Backend)` / `(Frontend)` / `(Both)`

---

## Day 1 — Core pipeline (Merchant → Payment → Revenue)

1. `[ ]` **(Backend) Project scaffold & deploy**
   Next.js + TS app, Supabase project + schema migration ([data-model.md](data-model.md)), Vercel deploy, env vars wired (Monnify keys, Supabase keys).
   *Done when*: app is live on a Vercel URL with a working Supabase connection.

2. `[ ]` **(Backend) Merchant onboarding API**
   Signup, BVN/NIN verification (real call if Monnify/KYC sandbox supports it, else clearly-marked mock), business details, approval workflow, Supabase Auth wiring. See [api-contracts.md](api-contracts.md) `POST /api/merchants`.
   *Done when*: a merchant record can be created end-to-end via API and appears in Supabase.

3. `[ ]` **(Frontend) Merchant onboarding UI**
   Signup form, verification step, business details form, PWA manifest/install prompt. See [userflows.md](userflows.md) merchant flow steps 1–4.
   *Done when*: a real user can complete signup in the browser and the record matches milestone 2's API.

4. `[ ]` **(Backend) Monnify virtual account issuance**
   Call Monnify sandbox API on merchant approval, store reserved account details on the merchant record.
   *Done when*: an approved merchant has a real Monnify reserved account number persisted.

5. `[ ]` **(Backend) Webhook ingestion**
   Public route handler for Monnify transaction webhooks (`POST /api/webhooks/monnify`), signature verification, immutable transaction record storage.
   *Done when*: a sandbox test payment produces a stored transaction row within seconds.

6. `[ ]` **(Backend) Revenue engine**
   Compute gross inflow, verified revenue, daily/monthly trend aggregates (SQL views or scheduled Supabase function).
   *Done when*: querying a merchant returns correct aggregates for seeded/sandbox transactions.

7. `[ ]` **(Frontend) Merchant revenue dashboard**
   Show virtual account, live revenue totals, trend chart, realtime update via Supabase subscription on new transactions.
   *Done when*: a sandbox payment shows up on the dashboard without a manual refresh.

---

## Day 2 — Fraud, reporting, lender & admin

8. `[ ]` **(Backend) Fraud rule engine**
   Implement the four rules from [fraud-rules.md](fraud-rules.md) against each incoming transaction, write flags to `fraud_flags`.
   *Done when*: seeded test transactions correctly trigger/don't trigger each rule.

9. `[ ]` **(Frontend) Fraud flags surfaced on dashboard**
   Visible flag badges/list on merchant dashboard.
   *Done when*: a flagged transaction is visibly distinguishable.

10. `[ ]` **(Backend) Proof-of-Revenue report generation**
    Assemble profile + verification status + revenue summary + trend data + confidence score + fraud flags into a report record.
    *Done when*: report generates in <5s per PRD acceptance criteria.

11. `[ ]` **(Frontend) Report view/share**
    Merchant-facing report page + shareable link/download.
    *Done when*: a generated report renders correctly and is shareable.

12. `[ ]` **(Backend) Lender portal API**
    Merchant search, fetch score/revenue, fetch report.
    *Done when*: authenticated lender can query and retrieve a real merchant's report via API.

13. `[ ]` **(Frontend) Lender portal UI**
    Search, merchant summary view, report download, mock loan approval action (Investor Demo Flow step 7).
    *Done when*: a lender can search → view → approve a mock loan in the browser.

14. `[ ]` **(Both) Admin stub**
    Minimal auth-gated page: fraud queue list + manual override action, backed by a small API route. Explicitly NOT full CRUD/audit-log UI.
    *Done when*: an admin can view flagged transactions and clear/override a flag.

15. `[ ]` **(Backend) Repayment automation illustration**
    Simulated deduction from future revenue tied to a mock loan (Investor Demo Flow step 8), no real disbursement.
    *Done when*: approving a mock loan visibly schedules/applies a simulated repayment.

16. `[ ]` **(Both) Demo rehearsal pass**
    Walk the full Investor Demo Flow end-to-end on the deployed Vercel URL with Monnify sandbox; fix any broken step.

---

