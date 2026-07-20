# PROOFR — API (as-built)

The frozen spec is [api-contracts.md](api-contracts.md). This doc tracks what's *actually implemented* — real request/response examples, auth headers, and which pieces are mocked — updated milestone by milestone. If this file and `api-contracts.md` disagree, this file wins; go fix the contract doc to match.

Base URL (deployed): `https://proofr.onrender.com`

---

## `POST /api/merchants`
*Milestone 2. Implemented in [app/api/merchants/route.ts](app/api/merchants/route.ts).*

Public signup. No auth.

**Request**
```json
{
  "phone": "+2348012345678",
  "email": "merchant@example.com",
  "password": "SuperSecret123!",
  "businessName": "Test Suya Spot",
  "bvnOrNin": "12345678901"
}
```
- `phone`, `email`, `password`, `businessName` are required, non-empty strings.
- `phone` must be **E.164** format (e.g. `+2348012345678`) — Supabase Auth rejects other formats with a 400.
- `bvnOrNin` is **optional**, not in the frozen contract — added so KYC can run inline at signup instead of needing a separate endpoint (no new DB columns were added; see `data-model.md`). Omit it to sign up with `bvn_nin_verified: false`.
- **Milestone 17 additions**, both optional, not in the frozen contract: `personalAccountNumber` (string) — the merchant's own personal bank account number, stored on `merchants.personal_account_number`. This is the identity value `lib/fraud.ts`'s `checkSelfFunding` rule always compared against `null` before (see `handoff.md` milestone 8) — providing it activates that rule against real data. `businessStartDate` (`YYYY-MM-DD` string) — self-reported business age, stored on `merchants.business_started_at`, used as an unverified secondary tenure signal by `lib/creditScore.ts` (see `credit-intelligence-engine.md`). Omitting either leaves the prior no-op/absent behavior unchanged.

**Response `201`**
```json
{ "merchantId": "313aaea8-3317-4639-b161-07e152cb96c6", "approvalStatus": "pending" }
```

**Errors**
- `400` — missing/empty required field, non-JSON body, bad `bvnOrNin` type, or Supabase Auth rejecting the input (e.g. bad phone format, duplicate email).
- `500` — merchant row insert failed after the auth user was created (the auth user is rolled back/deleted in this case).

**What happens server-side**
1. Creates a Supabase Auth user via the service-role client (`auth.admin.createUser`, `email_confirm: true`).
2. If `bvnOrNin` was provided, calls `mockVerifyBvnNin` ([lib/kyc.ts](lib/kyc.ts)) — **mocked**, see below.
3. Inserts the `merchants` row (`auth_user_id`, `business_name`, `phone`, `email`, `approval_status: "pending"`, `bvn_nin_verified`, `kyc_reference`).

**Mocked: BVN/NIN verification.** No Monnify (or other) sandbox KYC endpoint was reachable with the env vars in `.env.local.example` (`MONNIFY_*` are still empty). `mockVerifyBvnNin` deterministically marks any 10–11 digit string as verified and returns a `MOCK-KYC-<hash>` reference — obviously named so it's a one-line swap once real Monnify sandbox KYC credentials exist. See the [[monnify-sandbox-only]] memory note: check Monnify's sandbox docs for a real BVN/NIN endpoint before assuming this stays mocked.

---

## `POST /api/merchants/:id/approve`
*Milestone 2 (approval flip) + Milestone 4 (real Monnify reserved account issuance). Implemented in [app/api/merchants/[id]/approve/route.ts](app/api/merchants/[id]/approve/route.ts), Monnify client in [lib/monnify.ts](lib/monnify.ts).*

**Auth**: header `x-admin-secret: <ADMIN_API_SECRET>` — a minimal shared-secret gate, **not** real admin auth (that's milestone 14). `ADMIN_API_SECRET` is a new env var (see `.env.local.example`); must be set identically in Render's env vars and locally in `.env`.

**Request**: `{}` (body ignored beyond needing to be present)

**Response `200`** (happy path, verified against live Monnify sandbox)
```json
{ "merchantId": "42b2ebe5-442b-44c4-9a55-0d99447e19ad", "approvalStatus": "approved", "monnifyAccountNumber": "4119733541" }
```

**Response `200`** (approval succeeded, Monnify issuance failed — partial failure, not hidden behind a 500)
```json
{ "merchantId": "...", "approvalStatus": "approved", "monnifyAccountNumber": null, "monnifyError": "Monnify reserved account creation failed: <Monnify's responseMessage>" }
```

**Errors**
- `401` — missing/wrong `x-admin-secret` header.
- `404` — no merchant with that id.
- `500` — `ADMIN_API_SECRET` not configured on the server, or the Supabase update failed.

**Idempotency**: if the merchant is already `approved` and already has a `monnify_account_number`, no new Monnify call is made — the existing account number is returned as-is.

**Server-side flow**: flips `approval_status` to `approved` first (approval and account issuance are one API call per `api-contracts.md`, but approval is not rolled back if Monnify fails), then calls `createReservedAccount` in `lib/monnify.ts`:
1. `POST https://sandbox.monnify.com/api/v1/auth/login` with `Authorization: Basic base64(MONNIFY_API_KEY:MONNIFY_SECRET_KEY)` — token cached in-process, refreshed ~60s before its `expiresIn`.
2. `POST https://sandbox.monnify.com/api/v1/bank-transfer/reserved-accounts` with `Authorization: Bearer <token>`, `contractCode: MONNIFY_CONTRACT_CODE`, `accountReference: PROOFR-<merchantId>` (deterministic, doubles as a second layer of Monnify-side idempotency), `accountName`/`customerName` from `business_name`, `customerEmail` from the merchant row.
3. Persists `monnify_account_number` (Monnify's `accountNumber`) and `monnify_account_reference` (Monnify's `reservationReference` — their internal reference, distinct from our `accountReference`) onto the `merchants` row.

**Note on BVN/NIN**: Monnify's V1 reserved-account endpoint treats `customerBvn` as optional (required only later, before a regulated-category merchant can *receive* payments — not at creation time). PROOFR never persists raw BVN/NIN digits (milestone 2's `mockVerifyBvnNin` only stores a verified boolean + hashed `kyc_reference`), so `customerBvn` is omitted from the request. See [[monnify-sandbox-only]].

**Verified against live Monnify sandbox** (not mocked) — see `handoff.md` milestone 4 entry for the local test transcript. One quirk found live: Monnify's docs show the create-reserved-account response nesting the account under an `accounts[]` array, but the actual sandbox response (without `getAllAvailableBanks: true`) returns `accountNumber`/`bankName`/`bankCode` flat on `responseBody` — `lib/monnify.ts` handles both shapes.

---

## `POST /api/webhooks/monnify`
*Milestone 5. Implemented in [app/api/webhooks/monnify/route.ts](app/api/webhooks/monnify/route.ts), signature verification in [lib/monnify.ts](lib/monnify.ts)'s `verifyWebhookSignature`.*

Public route — no session. Called directly by Monnify.

**Auth**: header `monnify-signature` — hex-encoded `HMAC-SHA512(MONNIFY_SECRET_KEY, rawRequestBody)`. **Correction to `architecture.md`'s original assumption**: Monnify signs webhooks with the same client secret key used for API auth (`MONNIFY_SECRET_KEY`), not a separate configurable "webhook secret" — confirmed both from Monnify's docs and by a real sandbox webhook call. `MONNIFY_WEBHOOK_SECRET` (scaffolded since milestone 1) is unused; left in `.env.local.example` as a no-op placeholder rather than removed, to avoid breaking anyone who already set it.

**Request** (real payload, captured from a live sandbox transfer — `SUCCESSFUL_TRANSACTION` event, `RESERVED_ACCOUNT` product)
```json
{
  "eventType": "SUCCESSFUL_TRANSACTION",
  "eventData": {
    "product": { "type": "RESERVED_ACCOUNT", "reference": "PROOFR-<merchantId>" },
    "transactionReference": "MNFY|79|20260719222030|000096",
    "paymentReference": "MNFY|79|20260719222030|000096",
    "amountPaid": 30000,
    "totalPayable": 30000,
    "paymentStatus": "PAID",
    "paymentMethod": "ACCOUNT_TRANSFER",
    "destinationAccountInformation": { "accountNumber": "4003488430", "bankCode": "035", "bankName": "Wema bank" },
    "paymentSourceInformation": [
      { "accountName": "Monnify Limited", "accountNumber": "2048714015", "bankCode": "057", "amountPaid": 30000, "sessionId": "..." }
    ],
    "customer": { "name": "suya joint", "email": "chukwuebuka.nwaforx@gmail.com" }
  }
}
```

**Response `200`**: `{ "ok": true }` on a new transaction insert, `{ "ok": true, "alreadyProcessed": true }` on a retry of an already-seen `monnify_reference`, `{ "ok": true, "ignored": "<eventType>" }` for non-`SUCCESSFUL_TRANSACTION` events, `{ "ok": true, "unmatched": true }` if no merchant owns the destination account number (logged server-side, not silently dropped).

**Errors**: `401` — missing/invalid `monnify-signature` (rejected before any DB access). `400` — unparseable JSON body, or a `SUCCESSFUL_TRANSACTION` event missing `transactionReference`/`destinationAccountInformation.accountNumber`/`amountPaid`. `500` — `MONNIFY_SECRET_KEY` not configured, or a Supabase error other than the expected unique-violation retry case.

**Merchant matching**: via `eventData.destinationAccountInformation.accountNumber` against `merchants.monnify_account_number` — the flat bank account number Monnify actually pays into, which milestone 4 already persists. (Not via `product.reference`/`accountReference` — that's the reference PROOFR sent at account-creation time, `PROOFR-<merchantId>`, which isn't separately stored on the `merchants` row; the account number is the more direct match given what's already persisted.)

**Transaction row fields**: `monnify_reference` = `transactionReference` (idempotency key), `amount` = `amountPaid`, `payer_name`/`payer_account` = `paymentSourceInformation[0].accountName`/`.accountNumber` (falls back to `customer.name`/`null` if absent), `raw_payload` = the full parsed webhook body.

**Verified against a live Monnify sandbox payment, not just code-path.** Approved a real test merchant ("suya joint"), got a real reserved account (`4003488430`, Wema Bank) from `lib/monnify.ts`, configured the "Transaction completion" webhook in the Monnify dashboard to `https://proofr.onrender.com/api/webhooks/monnify`, and sent a ₦30,000 transfer via Monnify's Bank Simulator (`https://websim.sdk.monnify.com`). A correctly-shaped row appeared in the live Supabase `transactions` table within ~2 seconds. Re-sent the identical signed payload against the live endpoint afterward and confirmed no duplicate row (same row `id` returned, `alreadyProcessed: true`). Confirmed signature rejection (`401`) on both a tampered body and a missing header, against both local and live Render deployments.

**Milestone 8 update**: after a successful insert (new transaction, not a retry), the route now calls `runFraudChecks` from [lib/fraud.ts](lib/fraud.ts) synchronously before acking — runs the four rules in `fraud-rules.md` against bounded 24h/1h/7-day-baseline windows for the merchant and writes any resulting `fraud_flags` rows. A fraud-engine error is caught and logged, not surfaced as a 500 — a real, already-stored payment must still be ack'd back to Monnify even if fraud scoring fails. The response shape is unchanged (`{ ok: true }` etc.); flags are a side effect, not part of the webhook response. Full rule detail, verification transcript, and the `payer_account`-null / self-funding-identity decisions in `handoff.md`'s milestone 8 entry.

---

## `GET /api/merchants/:id/revenue`
*Milestone 6. Implemented in [app/api/merchants/[id]/revenue/route.ts](app/api/merchants/[id]/revenue/route.ts).*

**Auth**: header `Authorization: Bearer <supabase-access-token>` — a real Supabase Auth JWT, verified server-side via `supabase.auth.getUser(token)`. The route then checks the token's user against either the merchant's own `auth_user_id` (owning merchant) or a row in `lenders` matching that `auth_user_id` (any lender — lender-to-merchant scoping is milestone 12's job, not this route's). No bespoke session layer was built; there wasn't one to plug into yet (milestone 3's signup UI persists no client-side session, milestone 12's lender portal doesn't exist), so a caller obtains a token by signing in against Supabase Auth directly (e.g. `supabase.auth.signInWithPassword` or an admin-issued magic link) — same auth users milestones 2/3 already created. Aggregates are computed with the service-role client (RLS is bypassed for the query itself, since the `transactions` RLS policy only covers the owning merchant, not lenders — see `data-model.md`); the route's own bearer-token check is what actually gates access.

**Request**: `GET /api/merchants/:id/revenue?granularity=daily|monthly` (optional query param, defaults to `daily` — not in the frozen contract, additive).

**Response `200`** (real merchant, real Monnify sandbox transaction from milestone 5, `granularity=daily` default)
```json
{ "grossInflow": 30000, "verifiedRevenue": 30000, "trend": [{ "period": "2026-07-19", "amount": 30000 }] }
```
`period` is `YYYY-MM-DD` for `daily`, `YYYY-MM` for `monthly`.

**Errors**: `401` — missing/invalid/expired bearer token. `403` — valid token, but the user is neither the owning merchant nor a lender. `404` — no merchant with that id. `500` — Supabase error.

**"Gross inflow" vs "verified revenue"** (updated milestone 8): `grossInflow` is the unfiltered sum of `transactions.amount`. `verifiedRevenue` now excludes any transaction with an **open** `fraud_flags` row (any `rule_type`/severity — all four rules are high or medium per `fraud-rules.md`, so this is equivalent to "open, high or medium" today). Transactions whose only flags are `status: "overridden"` are not excluded. Implementation: one extra query fetching `fraud_flags.transaction_id` where `status = 'open'` for the merchant's transaction ids, skipped entirely if the merchant has no transactions. Full reasoning and live verification transcript in `handoff.md`'s milestone 6 and milestone 8 entries.

**Index applied**: `idx_transactions_merchant_created` on `transactions (merchant_id, created_at)` (`supabase/migrations/0002_revenue_indexes.sql`) — run manually by the user against the live Supabase project (the agent's environment couldn't reach the DB directly over raw Postgres TCP).

**Verified against the live Render deployment and real Supabase data**: queried the real "suya joint" merchant (`27608236-61e7-4a96-afdc-e2d3d872af5c`) with its real milestone-5 sandbox transaction (₦30,000) — response matched exactly. Also seeded three extra `transactions` rows spanning two months (clearly marked `TEST-M6-SEED-*` in `monnify_reference` and `{"test": true}` in `raw_payload`) to verify daily and monthly trend bucketing math, then deleted them afterward — confirmed `grossInflow` returned to ₦30,000 post-cleanup. Confirmed `401` (no token, garbage token), `403` (a different, unrelated merchant's real token against this merchant's id).

---

## `POST /api/merchants/:id/report`
*Milestone 10. Implemented in [app/api/merchants/[id]/report/route.ts](app/api/merchants/[id]/report/route.ts). Shares revenue aggregation with [lib/revenue.ts](lib/revenue.ts) (factored out of the milestone 6 revenue route) and confidence scoring with [lib/confidence.ts](lib/confidence.ts).*

**Auth**: same `Authorization: Bearer <supabase-access-token>` pattern as `GET /api/merchants/:id/revenue`, restricted to the **owning merchant only** (no lender path — the frozen contract for `POST` is merchant-only; lenders read via `GET`).

**Request**: `{}` (body ignored)

**Response `200`**
```json
{ "reportId": "07569391-f3ef-432c-abda-276dbbfacfcf", "generatedAt": "2026-07-19T23:48:48.740099+00:00" }
```

**Errors**: `401` — missing/invalid bearer token. `403` — valid token belonging to a different merchant (or a lender — `POST` has no lender path). `404` — no merchant with that id. `500` — Supabase error.

**Server-side flow**: runs `computeRevenueSummary` (grossInflow/verifiedRevenue/trend, daily granularity), a fetch of open `fraud_flags` joined to their `transactions` (for `payer_account`/`amount`), and (milestone 17) a fetch of all the merchant's transactions' `payer_account` values, in parallel; computes `confidenceScore` via `computeConfidenceScore`, then `creditScore`/`creditScoreBreakdown` via `lib/creditScore.ts`'s `computeCreditScore` (inputs: the trend array, `merchants.created_at`, `merchants.business_started_at`, the transaction payer_accounts, and `confidenceScore` itself — see `credit-intelligence-engine.md`), then inserts one `reports` row: `revenue_summary: { grossInflow, verifiedRevenue }`, `trend_data` (the trend array), `confidence_score`, `credit_score`, `credit_score_breakdown`, `fraud_flags_snapshot` (raw open-flag rows plus their transaction's `payer_account`/`amount`, per milestone 9's note that plain-language labels are a display concern, not a snapshot concern).

**Milestone 17 note**: `creditScore` (0-100) and its `creditScoreBreakdown` are a separate, broader repayment-likelihood signal, not a replacement for `confidenceScore`'s narrower fraud-only signal — both are stored and both are returned by `GET`, below. **Live-verified** against the local dev server hitting the live Supabase + Monnify sandbox project: a real seeded merchant with `personalAccountNumber`/`businessStartDate` produced a real `self_funding` fraud flag and a real, correctly-shaped `creditScore`/`creditScoreBreakdown` on generation. Full transcript in `handoff.md`'s milestone 17 entry.

**Milestone 19 note**: `recommendedLoanAmount` (numeric) and `loanRecommendationBreakdown` (component figures + a `rationale` string array) are computed alongside `creditScore` and stored on the same `reports` row — see `lib/loanRecommendation.ts` and `credit-intelligence-engine.md`. **Live-verified**: a seeded merchant with two backdated (20-day-apart), clean, distinct-payer transactions totaling ₦40,000 verified revenue produced `creditScore: 57`, `recommendedLoanAmount: 26000` (₦60,000 average monthly verified revenue × 25% × 57% score multiplier × 3 months, rounded to the nearest ₦1,000) — math confirmed correct against the pure function's formula. Not yet re-verified against the deployed Render URL for either milestone 17 or 19 — do that before the investor demo.

**Confidence score grouping decision** (the seam milestone 8 flagged): `fraud-rules.md` words penalties per *distinct triggering group* (circular_transfer: per payer; identical_transfers: per payer+amount group), but `lib/fraud.ts` writes one flag row per rule per qualifying transaction. `lib/confidence.ts` dedupes open flags into groups before penalizing — `circular_transfer` grouped by `payer_account`, `identical_transfers` grouped by `payer_account + amount`, `self_funding` and `velocity_spike` each collapsed to a single flat deduction regardless of row count (per `fraud-rules.md`'s "single occurrence is enough" / merchant-wide-check wording). Score starts at 100, floors at 0. Only `status: "open"` flags count — `overridden` flags are excluded entirely from both the score and the snapshot.

**Verified against real data (local dev server against the live Supabase project)**: seeded a disposable `TEST-M10-SEED-*` merchant. Clean case (1 real transaction, no flags): `confidenceScore: 100`, `grossInflow === verifiedRevenue === 50000`. Seeded-flags case (added 2 `identical_transfers` flags on 2 different transactions sharing one payer+amount, 1 `self_funding` flag, 1 `overridden` `circular_transfer` flag): `confidenceScore: 60` (100 − 30 self_funding − 10 identical_transfers-as-one-group; the overridden circular_transfer contributed nothing), `verifiedRevenue` correctly excluded the 3 open-flagged transactions. All test data deleted afterward. **Timing**: 1.56s and 1.67s measured (`curl -w time_total`) against the local dev server hitting the live Supabase project — comfortably under the 5s PRD threshold; the query pattern (one indexed transactions scan + one flags-joined-to-transactions scan, both already used by other routes) doesn't change with report generation.

---

## `GET /api/merchants/:id/report`
*Milestone 10. Implemented in the same route file as `POST`, above.*

**Auth**: two paths.
1. `Authorization: Bearer <supabase-access-token>` (no `reportId` query param) — owning merchant or any lender (same pattern as `GET /api/merchants/:id/revenue`), returns the merchant's **most recently generated** report.
2. `?reportId=<uuid>` — **no auth check at all**. Per `api-contracts.md`'s "lender with a valid share link/report ID" and the absence of any lender auth system (milestone 12), knowledge of the report's UUID is treated as the credential. **This is a placeholder, not a real share mechanism**: a `reportId` is an unguessable v4 UUID today, but nothing expires it, scopes it to a specific viewer, or revokes it. A real implementation (post-hackathon) would need a signed, expiring share token (e.g. a JWT or HMAC'd value with an expiry claim) minted by the merchant, not the bare row id.

**Request**: `GET /api/merchants/:id/report` (latest) or `GET /api/merchants/:id/report?reportId=<uuid>` (specific report; must belong to the merchant in the path, `404` otherwise).

**Response `200`**
```json
{
  "reportId": "713dfb5e-40c1-4880-9fcf-cfbc639eac43",
  "profile": { "businessName": "...", "approvalStatus": "approved", "hasVirtualAccount": true },
  "verificationStatus": { "bvnNinVerified": false },
  "revenueSummary": { "grossInflow": 77000, "verifiedRevenue": 55000 },
  "trendData": [{ "period": "2026-07-19", "amount": 77000 }],
  "confidenceScore": 60,
  "creditScore": 71,
  "creditScoreBreakdown": {
    "revenueTrend": { "score": 20, "direction": "stable" },
    "revenueConsistency": { "score": 18.4, "coefficientOfVariation": 0.264 },
    "tenure": { "score": 9.2, "platformDays": 224, "selfReportedDays": null },
    "customerBehavior": { "score": 17, "uniqueCustomers": 12, "repeatCustomerRate": 0.5, "payerAccountCoverage": 0.83 },
    "fraudConfidence": { "score": 6, "confidenceScore": 60 }
  },
  "recommendedLoanAmount": 26000,
  "loanRecommendationBreakdown": {
    "averageMonthlyVerifiedRevenue": 60000,
    "capacityRatio": 0.25,
    "scoreMultiplier": 0.57,
    "monthlyInstallmentCap": 8550,
    "termMonths": 3,
    "rationale": [
      "Average verified monthly revenue: ~₦60,000",
      "Capacity assumption: at most 25% of monthly revenue toward loan repayment",
      "Credit score adjustment: 57% of full capacity (from a credit score of 57/100)",
      "Term: 3 months, no interest modeled — matches the existing mock repayment schedule"
    ]
  },
  "fraudFlags": [ { "id": "...", "rule_type": "identical_transfers", "severity": "medium", "status": "open", "transaction_id": "...", "payer_account": "...", "amount": 1000, "created_at": "..." } ],
  "generatedAt": "2026-07-19T23:48:48.740099+00:00"
}
```
`profile`/`verificationStatus` are read live from the `merchants` row (not part of the stored snapshot — a merchant's business name/KYC status can change after a report was generated, and re-reading live is cheap and more accurate than baking it into the snapshot too). Everything else is the stored `reports` row as-is. `creditScore`/`creditScoreBreakdown` (milestone 17) shown above are illustrative example numbers, not a literal copy-paste of any one live-verified run's output — see `handoff.md`'s milestone 17 entry for the actual real numbers from that run (`creditScore: 23`, driven by a brand-new merchant with only one transaction — a low score is the *correct* output for that thin a history, not a bug). `recommendedLoanAmount`/`loanRecommendationBreakdown` (milestone 19) shown above **are** copy-pasted from a real live-verified run (see `handoff.md`'s milestone 19 entry) — the numbers are internally consistent and check out against the formula.

**Milestone 11 addition**: `reportId` (the report's own row id) was added to this response — it was missing from the original milestone 10 shape, and without it the frontend's "my latest report" bearer-token fetch had no way to construct a `?reportId=` share link. Both the latest-report query and the specific-`reportId` query already selected `id`, so this was a one-line addition to `buildReportResponse`, not a new query. See `handoff.md`'s milestone 11 entry.

**Errors**: `401`/`403`/`404` as above for the bearer-token path. `404` — no report has ever been generated for the merchant (latest-report path), or the given `reportId` doesn't exist / doesn't belong to this merchant id (share-link path).

**Verified**: both paths tested against the same seeded data as `POST` above — bearer-token latest-report fetch and unauthenticated `?reportId=` fetch both returned the identical, correct shape.

---

## `GET /api/lenders/search`
*Milestone 12. Implemented in [app/api/lenders/search/route.ts](app/api/lenders/search/route.ts).*

**Auth**: header `Authorization: Bearer <supabase-access-token>`, checked against the `lenders` table only (`lib/lender-auth.ts`'s `authenticateAsLender`) — a merchant's own token is `403`'d here, unlike the merchant-or-lender routes.

**Request**: `GET /api/lenders/search?query=<string>`. `query` matches `merchants.business_name` case-insensitively (partial match) and, if `query` is itself a valid UUID, also matches `merchants.id` exactly. Results are deduped and capped at 25 name matches.

**Response `200`**
```json
[
  { "merchantId": "c8f4b842-cf81-4173-a94a-c27f38949bdf", "businessName": "TEST-M12-SEED merchant", "confidenceScore": 100, "creditScore": 82, "recommendedLoanAmount": 26000 }
]
```
`confidenceScore`/`creditScore`/`recommendedLoanAmount` are all `null` for a merchant with no `reports` row yet (deliberate — not omitted, not defaulted; see `handoff.md`'s milestone 12 entry for the original `confidenceScore` reasoning, extended identically to `creditScore` in milestone 17 and `recommendedLoanAmount` in milestone 19). For a merchant with one or more reports, all three come from that merchant's most recently generated report. Live-verified in milestone 19's pass: search-result `recommendedLoanAmount` matched the source report's own value exactly.

**Errors**: `401` — missing/invalid bearer token. `400` — missing `query`. `403` — valid token, but no `lenders` row for that user.

---

## `GET /api/lenders/merchants/:id`
*Milestone 12. Implemented in [app/api/lenders/merchants/[id]/route.ts](app/api/lenders/merchants/[id]/route.ts) — a one-line delegation to `lib/reports.ts`'s `getLatestReportForBearerToken`, the exact function `GET /api/merchants/:id/report`'s bearer-token path also calls. No reimplementation.*

**Auth**: same as `GET /api/merchants/:id/report`'s bearer-token path — owning merchant OR any lender. Not re-gated to lender-only, by design (this route is a literal alias of the shared logic, per api-contracts.md's "same shape" wording and milestone 10's reuse seam note).

**Request**: `GET /api/lenders/merchants/:id`

**Response `200`** — identical shape to `GET /api/merchants/:id/report`'s bearer-token response (see above): `{ reportId, profile, verificationStatus, revenueSummary, trendData, confidenceScore, fraudFlags, generatedAt }`.

**Errors**: `401`/`403`/`404` as documented for `GET /api/merchants/:id/report`'s bearer-token path (including `404` if the merchant has never generated a report).

---

## `POST /api/loans`
*Milestone 12 (built ahead of its milestone 13 mention, since nothing else owns a backend route for it and milestone 13's frontend needs it). Implemented in [app/api/loans/route.ts](app/api/loans/route.ts).*

**Auth**: lender-only (`authenticateAsLender`).

**Request**
```json
{ "merchantId": "c8f4b842-cf81-4173-a94a-c27f38949bdf", "amount": 90000 }
```
`merchantId` must reference an existing merchant. `amount` must be a positive number.

**Response `201`**
```json
{ "loanId": "34aaf648-aa9e-4161-a3e3-a94bac56896d", "status": "pending" }
```
`lender_id` on the inserted `loans` row is always the authenticated lender's own id — never taken from the request body.

**Errors**: `400` — bad/missing `merchantId`/`amount`, or non-JSON body. `401`/`403` — as above. `404` — no merchant with that id. `500` — Supabase error.

---

## `POST /api/loans/:id/approve`
*Milestone 12 (schedule shape) + 15 (progress fields). Implemented in [app/api/loans/[id]/approve/route.ts](app/api/loans/[id]/approve/route.ts).*

**Auth**: lender-only, and additionally scoped to **the loan's own lender** — `loan.lender_id` must equal the authenticated lender's id (per `data-model.md`'s RLS intent that lenders only touch their own `loans` rows), `403` otherwise, even for a different, legitimately-authenticated lender.

**Request**: `{}` (body ignored)

**Response `200`**
```json
{
  "loanId": "31545b04-9276-4b34-8341-c083b3b42215",
  "status": "approved",
  "mockRepaymentSchedule": [
    { "period": 1, "amount": 27500, "dueDate": "2026-08-20T17:19:10.322Z", "status": "pending", "paidAmount": 0, "paidAt": null },
    { "period": 2, "amount": 27500, "dueDate": "2026-09-20T17:19:10.322Z", "status": "pending", "paidAmount": 0, "paidAt": null },
    { "period": 3, "amount": 27500, "dueDate": "2026-10-20T17:19:10.322Z", "status": "pending", "paidAmount": 0, "paidAt": null },
    { "period": 4, "amount": 27500, "dueDate": "2026-11-20T17:19:10.322Z", "status": "pending", "paidAmount": 0, "paidAt": null }
  ],
  "interestRate": 0.1,
  "termMonths": 4,
  "totalRepayment": 110000,
  "rationale": [
    "Credit score 71/100 → \"Fair\" tier",
    "Interest: 10% flat, added to principal (not compounding)",
    "Term: 4 months",
    "Total repayment: ₦110,000 (principal ₦100,000 + interest)"
  ]
}
```
Real, live-verified response shown above (see `handoff.md`'s milestone 20 entry) — not illustrative numbers.

**Milestone 20 update**: the schedule's shape is no longer a fixed 3-month/0%-interest placeholder. `app/api/loans/[id]/approve/route.ts` now fetches the merchant's most recently generated report's `credit_score` and calls `lib/loanTerms.ts`'s `computeLoanTerms`, which picks a term/interest tier (Strong ≥80: 6mo/5%; Fair 50-79: 4mo/10%; Weak/unscored <50 or no report: 3mo/15% — see `credit-intelligence-engine.md`). `interestRate`, `termMonths`, `totalRepayment`, and `rationale` (plain-language lines, same pattern as the credit-score/loan-recommendation breakdowns) are new in the response; `mockRepaymentSchedule` now has however many periods the chosen tier calls for, not always 3. `lib/repayment.ts`'s `applyRepaymentDeductions` needed no change — it already reads schedule length generically.

**Milestone 21 update**: the loan row additionally snapshots `credit_score_at_approval` and `recommended_loan_amount_at_approval` (not in this response, but readable via `GET /api/admin/loan-outcomes` below) — see `credit-intelligence-engine.md`'s outcome-tracking section.

**Errors**: `401`/`403` — as above (including a different lender's own token, valid but not this loan's owner). `404` — no loan with that id.

---

## `GET /api/loans/:id`
*Milestone 15. Additive — not in the frozen `api-contracts.md` "Loans" section (same kind of pragmatic addition as milestone 6's `?granularity` param or milestone 11's `reportId` field). Implemented in [app/api/loans/[id]/route.ts](app/api/loans/[id]/route.ts).*

Fetch a loan's current state — the only way to observe repayment progress after approval, since no route previously let anyone re-fetch a loan.

**Auth**: lender-only, scoped to the loan's own lender (identical check to `POST /api/loans/:id/approve` above).

**Response `200`**
```json
{
  "loanId": "34aaf648-aa9e-4161-a3e3-a94bac56896d",
  "status": "repaying",
  "mockRepaymentSchedule": [
    { "period": 1, "amount": 10000, "dueDate": "2026-08-20T01:56:07.027Z", "status": "paid", "paidAmount": 10000, "paidAt": "2026-07-20T01:56:12.951Z" },
    { "period": 2, "amount": 10000, "dueDate": "2026-09-20T01:56:07.027Z", "status": "pending", "paidAmount": 3000, "paidAt": null },
    { "period": 3, "amount": 10000, "dueDate": "2026-10-20T01:56:07.027Z", "status": "pending", "paidAmount": 0, "paidAt": null }
  ],
  "interestRate": 0.1,
  "termMonths": 3,
  "creditScoreAtApproval": 71,
  "recommendedLoanAmountAtApproval": 37000
}
```

`status` on the loan itself progresses `approved` → `repaying` (first deduction applied) → `repaid` (every period `"paid"`). **Milestone 20/21 update**: `interestRate`/`termMonths` (chosen at approval, milestone 20) and `creditScoreAtApproval`/`recommendedLoanAmountAtApproval` (the milestone 21 prediction snapshot) are now included.

**Errors**: `401` (missing/invalid bearer token), `403` (valid lender token, but not this loan's lender), `404` (no loan with that id).

---

## `POST /api/webhooks/monnify` — repayment deduction (milestone 15 addition)

No new route — this is a synchronous side effect added to the existing webhook handler (`app/api/webhooks/monnify/route.ts`), right after the milestone 8 fraud engine call, before acking. See [lib/repayment.ts](lib/repayment.ts).

**Mechanism**: on every successfully-inserted transaction, look up the paying merchant's loans with `status` `approved` or `repaying`. For each, apply the transaction's full `amount` as a waterfall against the schedule's periods in order: the oldest unpaid period absorbs as much as it needs (`paidAmount` accumulates), any remainder cascades into the next period, and so on until the transaction amount is exhausted or the schedule runs out. A period flips to `"paid"` (with `paidAt` set) once its `paidAmount` reaches its `amount`. The loan's own `status` becomes `"repaying"` on first progress and `"repaid"` once every period is `"paid"`. This is genuinely tied to arriving revenue (a transaction directly funds whichever period is currently owed), not to elapsed calendar time, and needs no separate "amount accumulated since last update" bookkeeping — progress already lives in each period's `paidAmount` between calls.

**Explicitly does not touch** `transactions`, `fraud_flags`, or anything `verifiedRevenue`/`grossInflow` computations read (`lib/revenue.ts`, `lib/confidence.ts`) — this is loan bookkeeping only. Confirmed live: revenue figures before and after a deduction are identical apart from the transaction's own amount being counted as normal (see `handoff.md` milestone 15 entry for the exact before/after numbers).

**Failure isolation**: wrapped in its own `try/catch`, same as the fraud engine call above it — a repayment-deduction error is logged (`console.error`) but never blocks or delays the webhook's `200` ack.

---

## Lender provisioning (milestone 12)

There is **no public lender signup route** — not in the frozen `api-contracts.md`, and `userflows.md`'s lender flow starts at login. One real lender was provisioned directly against Supabase (same two-step mechanism `POST /api/merchants` uses internally: `auth.admin.createUser` via the Auth Admin REST API with the service-role key, then an insert into `lenders` with the returned `auth_user_id`), run as a disposable script, not committed. See `handoff.md`'s milestone 12 entry for the test account's email/org name/id — the password was reported to the user out-of-band, never committed. A lender authenticates identically to a merchant: `supabase.auth.signInWithPassword({ email, password })`, then `Authorization: Bearer <access_token>` on every route above.

---

## `GET /api/admin/loan-outcomes`
*Milestone 21. Implemented in [app/api/admin/loan-outcomes/route.ts](app/api/admin/loan-outcomes/route.ts).*

**Auth**: `x-admin-secret` header, same shared-secret gate as `GET /api/admin/fraud-queue`.

**Response `200`**
```json
[
  {
    "loanId": "31545b04-9276-4b34-8341-c083b3b42215",
    "merchantId": "297f322c-33cc-425e-bde5-dcdcd1f75668",
    "businessName": "Suya Spot",
    "amount": 100000,
    "status": "approved",
    "outcome": "in_progress",
    "predicted": { "creditScoreAtApproval": 71, "recommendedLoanAmountAtApproval": 37000, "interestRate": 0.1, "termMonths": 4 },
    "actual": { "amountApproved": 100000, "amountRecommendedDelta": 63000 },
    "createdAt": "2026-07-20T17:19:03.546793+00:00",
    "approvedAt": "2026-07-20T17:19:10.322+00:00"
  }
]
```
`outcome` is derived fresh on every request (not stored) from `status` + whether any `mock_repayment_schedule` period is unpaid and past its `dueDate`: `"not_yet_approved"` (still `pending`), `"in_progress"` (no overdue unpaid periods), `"delinquent"` (at least one overdue unpaid period), `"repaid_full"` (`status: "repaid"`). `amountRecommendedDelta` is `amount - recommendedLoanAmountAtApproval`, `null` if the merchant had no report at approval time — how far the lender's actual decision diverged from what the model suggested, the exact pairing a future recalibration would query. Live-verified: a freshly-approved loan correctly came back `"in_progress"` with matching predicted/actual figures — see `handoff.md`'s milestone 21 entry.

**Errors**: `401` — missing/wrong `x-admin-secret`. `500` — `ADMIN_API_SECRET` not configured, or a Supabase error.

---

## `GET /api/public/score?phone=<E.164>`
*Milestone 22. Implemented in [app/api/public/score/route.ts](app/api/public/score/route.ts), auth in [lib/public-api-auth.ts](lib/public-api-auth.ts).*

The Phase 4 "portable, cross-platform identity" endpoint — see `credit-intelligence-engine.md`'s Phase 4 section for the full rationale.

**Auth**: header `x-api-key: <raw key>` — checked against `api_clients.api_key_hash` (SHA-256 of the raw key). No Supabase session involved; callers are third-party platforms, not PROOFR lenders. Keys are provisioned only via `scripts/provision-api-client.ts` (no public signup, same posture as milestone 12's lender provisioning).

**Request**: `GET /api/public/score?phone=+2348012345678` — `phone` must match `merchants.phone` exactly and be E.164-shaped (`^\+\d{8,15}$`).

**Milestone 23 update**: a merchant must now also have granted consent (`merchants.public_api_consent_at` non-null, via `POST /api/merchants/:id/public-api-consent` below) — `approval_status: "approved"` alone is no longer sufficient. Live-verified: an approved-but-unconsented merchant returns `404` identical to a nonexistent phone number; granting consent immediately makes the same query return `200`; revoking immediately reverts it to `404`.

**Response `200`** (real, live-verified example)
```json
{
  "merchantId": "f48cdb5e-1b0a-4e2d-b033-96902c3a4844",
  "businessName": "TEST-M22-SEED merchant",
  "confidenceScore": 100,
  "creditScore": 21,
  "recommendedLoanAmount": 0,
  "scoredAt": "2026-07-20T17:27:39.488935+00:00"
}
```
Deliberately capped at these three summary fields — no `revenueSummary`, `trendData`, `creditScoreBreakdown`, or `fraudFlags`, unlike the full report a lender's own session can see. Confirmed live that the response contains nothing beyond this shape.

**Errors**: `400` — missing/malformed `phone`. `401` — missing, invalid, or revoked API key. `404` — no `approval_status: "approved"` merchant matches that phone number (an unapproved/rejected/nonexistent merchant is indistinguishable from the caller's perspective — deliberate, matches milestone 12's non-disclosure-of-existence stance). `500` — Supabase error.

**Every query is logged** to `api_access_log` (client id, queried phone, matched merchant id or `null`, response status) — found, not-found, and unauthorized attempts alike, since no rate-limiting exists yet. Live-verified: a successful query produced exactly one `response_status: 200` log row.

---

## `GET` / `POST /api/merchants/:id/public-api-consent`
*Milestone 23. Implemented in [app/api/merchants/[id]/public-api-consent/route.ts](app/api/merchants/[id]/public-api-consent/route.ts).*

Lets a merchant grant or revoke their own visibility to `GET /api/public/score` — closes the consent gap milestone 22 shipped with.

**Auth**: merchant-owner-only, same bearer-token-owns-the-record pattern as `POST /api/merchants/:id/report` — no lender path, this is squarely the merchant's own decision.

**`GET` response `200`**
```json
{ "consentGranted": false, "consentedAt": null }
```
`null`/`false` for every merchant by default, including everyone who signed up before this migration — nobody was retroactively opted in.

**`POST` request**
```json
{ "consent": true }
```

**`POST` response `200`** (after granting)
```json
{ "consentGranted": true, "consentedAt": "2026-07-20T17:43:03.189+00:00" }
```
Sending `{ "consent": false }` sets `consentedAt` back to `null` — full revocation, not a soft flag; `GET /api/public/score` immediately stops returning this merchant.

**Errors**: `400` — `consent` missing or not a boolean, or non-JSON body. `401` — missing/invalid bearer token. `403` — valid token belonging to a different merchant. `404` — no merchant with that id.

**Live-verified, the full grant/revoke cycle**: default state `{ consentGranted: false, consentedAt: null }` → `GET /api/public/score` for that merchant returned `404` → granted consent → identical query returned `200` with correct data → revoked → identical query returned `404` again. Also confirmed a different merchant's own valid bearer token gets `403` attempting to change this merchant's consent.

---

## `GET` / `POST /api/lenders/api-keys`, `POST /api/lenders/api-keys/:id/revoke`
*Milestone 24. Implemented in [app/api/lenders/api-keys/route.ts](app/api/lenders/api-keys/route.ts) and [app/api/lenders/api-keys/[id]/revoke/route.ts](app/api/lenders/api-keys/[id]/revoke/route.ts).*

Lets a lender self-serve provision their own `api_clients` row for `GET /api/public/score`, rather than needing `scripts/provision-api-client.ts` run on their behalf (milestone 22's original, still-valid provisioning path for non-lender third parties). A lender-generated key authenticates against `GET /api/public/score` identically to a manually-provisioned one — same table, same `x-api-key` check.

**Auth**: lender-only bearer token (`lib/lender-auth.ts`'s `authenticateAsLender`), same pattern as `GET /api/lenders/search`.

**`GET /api/lenders/api-keys` response `200`** — every key belonging to the authenticated lender, newest first. Never includes the raw key or hash, only a non-secret `keyPreview` (e.g. `"proofr_pk_ab12…cd34"`) captured at creation time.
```json
[
  { "id": "…", "name": "Investor demo key", "keyPreview": "proofr_pk_ab12…cd34", "createdAt": "2026-07-20T…", "revokedAt": null }
]
```

**`POST /api/lenders/api-keys` request** — `{ "name": "Investor demo key" }` (optional; defaults to `"<org_name> key"`).

**`POST /api/lenders/api-keys` response `200`** — the **only** time the raw key is returned; not retrievable again afterward (same one-shot posture as `scripts/provision-api-client.ts`).
```json
{ "id": "…", "name": "Investor demo key", "keyPreview": "proofr_pk_ab12…cd34", "createdAt": "2026-07-20T…", "apiKey": "proofr_pk_<48 hex chars>" }
```

**`POST /api/lenders/api-keys/:id/revoke`** — sets `revoked_at`; a revoked key immediately fails `GET /api/public/score` auth (same `revoked_at is null` check `lib/public-api-auth.ts` already applied to script-provisioned keys). `404` if the key doesn't exist or belongs to a different lender — a lender can only see/revoke their own keys.

**Errors**: `401` — missing/invalid bearer token. `403` — token doesn't belong to a lender. `404` (revoke only) — key not found or not owned by this lender. `500` — Supabase error.

**UI**: `app/lender/page.tsx` gained a "Public API keys" card — generate (with an optional label), a one-time reveal banner with copy-to-clipboard for the raw key, a list of existing keys (name/preview/created date/status), and a revoke button per active key.

---

## Not yet implemented

Nothing currently tracked here — all `api-contracts.md` sections and milestones 1–23's additive endpoints are implemented as of this entry.
