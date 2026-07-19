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

## Not yet implemented

Everything else in `api-contracts.md` (`GET /api/merchants/:id/revenue`, `POST /api/webhooks/monnify`, reports, lender routes, loans, admin fraud queue) — see `plan.md` for which milestone owns each.
