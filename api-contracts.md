# PROOFR — API Contracts

Only the routes actually needed by [plan.md](plan.md)'s milestones — not a speculative full REST surface. All routes are Next.js API routes/Route Handlers (see [architecture.md](architecture.md)).

## Merchant

### `POST /api/merchants`
Signup. *Milestone 2.*
- Auth: none (public signup, creates Supabase Auth user)
- Request: `{ phone, email, password, businessName }`
- Response: `{ merchantId, approvalStatus: "pending" }`

### `POST /api/merchants/:id/approve`
Approve a pending merchant, triggers Monnify virtual account issuance. *Milestone 2, 4.*
- Auth: admin
- Request: `{}`
- Response: `{ merchantId, approvalStatus: "approved", monnifyAccountNumber }`

### `GET /api/merchants/:id/revenue`
Fetch computed revenue aggregates. *Milestone 6, 7.*
- Auth: merchant (own record) or lender
- Response: `{ grossInflow, verifiedRevenue, trend: [{ period, amount }] }`

## Webhooks

### `POST /api/webhooks/monnify`
Receives transaction notifications. *Milestone 5.*
- Auth: Monnify signature header, verified against `MONNIFY_WEBHOOK_SECRET`
- Request: Monnify's transaction payload
- Response: `200 OK` (must ack quickly; fraud/revenue processing happens synchronously in-process for MVP)

## Reports

### `POST /api/merchants/:id/report`
Generate a new Proof-of-Revenue report snapshot. *Milestone 10.*
- Auth: merchant (own record)
- Response: `{ reportId, generatedAt }` — must return in <5s per PRD acceptance criteria

### `GET /api/merchants/:id/report`
Fetch latest (or specified) report. *Milestone 11.*
- Auth: merchant (own record) or lender with a valid share link/report ID
- Response: `{ profile, verificationStatus, revenueSummary, trendData, confidenceScore, fraudFlags }`

## Lender

### `GET /api/lenders/search?query=...`
Search merchants by name/ID. *Milestone 12, 13.*
- Auth: lender
- Response: `[{ merchantId, businessName, confidenceScore }]`

### `GET /api/lenders/merchants/:id`
Fetch a merchant's score/revenue summary for lender view. *Milestone 12, 13.*
- Auth: lender
- Response: same shape as `GET /api/merchants/:id/report`

## Loans

### `POST /api/loans`
Create a loan request/offer. *Milestone 13.*
- Auth: lender
- Request: `{ merchantId, amount }`
- Response: `{ loanId, status: "pending" }`

### `POST /api/loans/:id/approve`
Approve mock loan, schedules simulated repayment. *Milestone 13, 15.*
- Auth: lender
- Response: `{ loanId, status: "approved", mockRepaymentSchedule }`

## Admin (stub)

### `GET /api/admin/fraud-queue`
List open fraud flags. *Milestone 14.*
- Auth: admin
- Response: `[{ flagId, transactionId, merchantId, ruleType, severity, createdAt }]`

### `POST /api/admin/fraud-flags/:id/override`
Clear/confirm a flag. *Milestone 14.*
- Auth: admin
- Request: `{ action: "clear" | "confirm" }`
- Response: `{ flagId, status: "overridden" }`
