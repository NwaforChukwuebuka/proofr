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

**"Gross inflow" vs "verified revenue"**: identical for now — both sum `transactions.amount` (Monnify's gross `amountPaid`). No fraud screening exists yet (milestone 8), so "verified" has nothing to exclude yet. Full reasoning in `handoff.md`'s milestone 6 entry.

**Verified against the live Render deployment and real Supabase data**: queried the real "suya joint" merchant (`27608236-61e7-4a96-afdc-e2d3d872af5c`) with its real milestone-5 sandbox transaction (₦30,000) — response matched exactly. Also seeded three extra `transactions` rows spanning two months (clearly marked `TEST-M6-SEED-*` in `monnify_reference` and `{"test": true}` in `raw_payload`) to verify daily and monthly trend bucketing math, then deleted them afterward — confirmed `grossInflow` returned to ₦30,000 post-cleanup. Confirmed `401` (no token, garbage token), `403` (a different, unrelated merchant's real token against this merchant's id).

---

## Not yet implemented

Everything else in `api-contracts.md` (reports, lender search/detail routes, loans, admin fraud queue) — see `plan.md` for which milestone owns each.
