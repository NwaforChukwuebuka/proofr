# PROOFR

## The problem

We target Nigeria’s **informal economy**: millions of MSMEs that collect revenue but have no bank statements, no formal registration, and no traditional credit history. Financial institutions want to lend to them, but have no reliable way to answer: *if I lend this merchant money, will they repay?*

PROOFR is credit infrastructure for that segment. Merchants collect payments through a dedicated account; we turn that verified payment behavior into a credit score and recommended loan amount. Financial institutions consume that signal through a lender portal and a **credit-score-facing API** (`GET /api/public/score`) — so other platforms and lenders can underwrite informal businesses without building their own revenue-verification stack.

---

## Stack

- **Next.js** (App Router, TypeScript) — UI + API
- **Supabase** — Auth, Postgres, Realtime
- **Monnify sandbox** — virtual accounts + payment webhooks

Live demo: [https://proofr.onrender.com](https://proofr.onrender.com)

---

## Install

**Requirements:** Node.js 20+, npm, and access to a Supabase project + Monnify sandbox (env values below).

```bash
git clone <repo-url>
cd proofr
npm install
```

Copy the env template and fill in real values:

```bash
cp .env.local.example .env.local
```

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key |
| `MONNIFY_API_KEY` / `MONNIFY_SECRET_KEY` / `MONNIFY_CONTRACT_CODE` | Monnify sandbox API |
| `ADMIN_API_SECRET` | Gates merchant approval + `/admin` |

Apply SQL migrations in `supabase/migrations/` to your Supabase project (in order, `0001` → latest), if the database is not already set up.

---

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Health check: [http://localhost:3000/api/health](http://localhost:3000/api/health)

Optional checks:

```bash
npm run lint
npm run build
npm test
```

`npm test` runs Vitest unit tests for the core scoring, fraud, KYC, and webhook-signature logic. Verify the full product with the end-to-end flow below.

---

## Test end-to-end

Walk this flow in the browser (local or [live](https://proofr.onrender.com)).

### 1. Merchant signup → approval → virtual account

1. Open `/signup` and create a merchant (BVN/NIN verification is mocked).
2. Approve the merchant with `ADMIN_API_SECRET`:

```bash
curl -X POST http://localhost:3000/api/merchants/<MERCHANT_ID>/approve \
  -H "x-admin-secret: <ADMIN_API_SECRET>"
```

3. Log in at `/login` → dashboard should show a real Monnify virtual account number.

### 2. Collect a payment → revenue updates live

1. Keep the merchant dashboard open.
2. Send a transfer into the virtual account via [Monnify Bank Simulator](https://websim.sdk.monnify.com/?#/bankingapp).
3. Confirm revenue updates **without a manual refresh** (Supabase Realtime). Give the page a few seconds after load before paying — the first Realtime subscribe can be slow.

### 3. Generate a Proof-of-Revenue report

1. On the dashboard, click **Generate report**.
2. Confirm you see:
   - **Credit score** (repayment likelihood) + breakdown
   - **Recommended loan amount**
   - **Fraud confidence score** (separate, narrower signal)

### 4. Lender review → approve mock loan

1. Log in as a lender (provision a `lenders` row + Auth user in Supabase if you do not already have one).
2. Open `/lender`, search for the merchant, open their profile.
3. Confirm the same credit score / recommended amount.
4. Click **Approve mock loan** — terms should reflect the merchant’s credit tier (not a generic fixed schedule).

### 5. (Optional) Repayment illustration

Send another payment into the merchant’s virtual account, then reload the lender’s loan view — a repayment period should move to paid.

### 6. (Optional) Admin fraud queue

Open `/admin`, enter `ADMIN_API_SECRET`, and confirm the fraud queue loads. Clear/confirm flags if any exist.

---

## Key routes

| Path | Who |
|---|---|
| `/` | Landing |
| `/signup` · `/login` · `/dashboard` | Merchant |
| `/report/[id]` | Shared Proof-of-Revenue report |
| `/lender` · `/lender/merchants/[id]` | Lender |
| `/admin` | Admin fraud queue |
| `/api` | OpenAPI docs |
| `/api/health` | Health check |

---

## Notes for graders

- Target market: **informal MSMEs**. The product is credit scoring infrastructure for financial institutions.
- Payment collection is the **data layer**; the product is the **credit decision** (score + recommended amount) exposed via the lender portal and public API.
- KYC (BVN/NIN) is intentionally mocked for the MVP.
- Do not commit real secrets — only `.env.local.example` belongs in git.
