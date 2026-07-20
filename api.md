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

**Server-side flow**: runs `computeRevenueSummary` (grossInflow/verifiedRevenue/trend, daily granularity) and a fetch of open `fraud_flags` joined to their `transactions` (for `payer_account`/`amount`) in parallel, computes `confidenceScore` via `computeConfidenceScore`, then inserts one `reports` row: `revenue_summary: { grossInflow, verifiedRevenue }`, `trend_data` (the trend array), `confidence_score`, `fraud_flags_snapshot` (raw open-flag rows plus their transaction's `payer_account`/`amount`, per milestone 9's note that plain-language labels are a display concern, not a snapshot concern).

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
  "fraudFlags": [ { "id": "...", "rule_type": "identical_transfers", "severity": "medium", "status": "open", "transaction_id": "...", "payer_account": "...", "amount": 1000, "created_at": "..." } ],
  "generatedAt": "2026-07-19T23:48:48.740099+00:00"
}
```
`profile`/`verificationStatus` are read live from the `merchants` row (not part of the stored snapshot — a merchant's business name/KYC status can change after a report was generated, and re-reading live is cheap and more accurate than baking it into the snapshot too). Everything else is the stored `reports` row as-is.

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
  { "merchantId": "c8f4b842-cf81-4173-a94a-c27f38949bdf", "businessName": "TEST-M12-SEED merchant", "confidenceScore": 100 }
]
```
`confidenceScore` is `null` for a merchant with no `reports` row yet (deliberate — not omitted, not defaulted to `100`; see `handoff.md`'s milestone 12 entry for why). For a merchant with one or more reports, it's the `confidence_score` of that merchant's most recently generated report.

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
*Milestone 12 (see note above; milestone 15 owns the real repayment simulation). Implemented in [app/api/loans/[id]/approve/route.ts](app/api/loans/[id]/approve/route.ts).*

**Auth**: lender-only, and additionally scoped to **the loan's own lender** — `loan.lender_id` must equal the authenticated lender's id (per `data-model.md`'s RLS intent that lenders only touch their own `loans` rows), `403` otherwise, even for a different, legitimately-authenticated lender.

**Request**: `{}` (body ignored)

**Response `200`**
```json
{
  "loanId": "34aaf648-aa9e-4161-a3e3-a94bac56896d",
  "status": "approved",
  "mockRepaymentSchedule": [
    { "period": 1, "amount": 30000, "dueDate": "2026-08-20T00:31:20.164Z" },
    { "period": 2, "amount": 30000, "dueDate": "2026-09-20T00:31:20.164Z" },
    { "period": 3, "amount": 30000, "dueDate": "2026-10-20T00:31:20.164Z" }
  ]
}
```

**`mockRepaymentSchedule` is a placeholder, not real simulation logic** — an even 3-way split of `amount` with no interest/fees, one period per month starting the month after approval. Milestone 15 (repayment automation) is expected to replace this computation entirely with the real "simulated deduction from future revenue" logic, the same way milestone 2 left `monnifyAccountNumber: null` for milestone 4 to fill in for real.

**Errors**: `401`/`403` — as above (including a different lender's own token, valid but not this loan's owner). `404` — no loan with that id.

---

## Lender provisioning (milestone 12)

There is **no public lender signup route** — not in the frozen `api-contracts.md`, and `userflows.md`'s lender flow starts at login. One real lender was provisioned directly against Supabase (same two-step mechanism `POST /api/merchants` uses internally: `auth.admin.createUser` via the Auth Admin REST API with the service-role key, then an insert into `lenders` with the returned `auth_user_id`), run as a disposable script, not committed. See `handoff.md`'s milestone 12 entry for the test account's email/org name/id — the password was reported to the user out-of-band, never committed. A lender authenticates identically to a merchant: `supabase.auth.signInWithPassword({ email, password })`, then `Authorization: Bearer <access_token>` on every route above.

---

## Not yet implemented

Admin fraud queue (`api-contracts.md`'s Admin section) — see `plan.md` for which milestone owns it.
