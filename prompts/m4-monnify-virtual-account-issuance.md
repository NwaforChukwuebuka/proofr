# Build prompt — Milestone 4: Monnify virtual account issuance

Paste this whole prompt to the coding agent to execute M4.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements
2. `plan.md` — the full milestone list (you are implementing milestone 4 only)
3. `architecture.md` — system design, deploy topology, required env vars
4. `data-model.md` — the `merchants` table columns you'll be writing to (`monnify_account_number`, `monnify_account_reference`)
5. `api-contracts.md` — the frozen `POST /api/merchants/:id/approve` contract
6. `api.md` — **as-built** API reference; this is the source of truth over `api-contracts.md` where they differ
7. `handoff.md` — read milestones 1–3 in full, especially milestone 2's "seam left for milestone 4" note and the `[[monnify-sandbox-only]]` reference about checking Monnify sandbox docs

Milestones 1–3 already delivered: Next.js app deployed to Render at `https://proofr.onrender.com`, Supabase schema + Auth wired, `lib/supabase.ts` clients, `POST /api/merchants` (signup, with a mocked `mockVerifyBvnNin` in `lib/kyc.ts`), and `POST /api/merchants/:id/approve` (admin route, gated by `x-admin-secret` header against `ADMIN_API_SECRET`) at `app/api/merchants/[id]/approve/route.ts`. That route currently flips `approval_status` to `approved` and always returns `monnifyAccountNumber: null`, with an explicit comment marking the hook point — read that file before editing it.

## Your task: Milestone 4 — Monnify virtual account issuance

Wire real Monnify sandbox reserved-virtual-account creation into the approval flow.

### Scope

1. **Monnify sandbox client** (e.g. `lib/monnify.ts`)
   - Look up Monnify's actual sandbox API docs for reserved/virtual account creation (the "Create Reserved Account" endpoint) — auth flow (Monnify uses an OAuth-style bearer token obtained via `MONNIFY_API_KEY`/`MONNIFY_SECRET_KEY` Basic auth against their `/api/v1/auth/login` endpoint, token cached/reused per their expiry), and the request/response shape for reserved account creation using `MONNIFY_CONTRACT_CODE`.
   - `MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, `MONNIFY_CONTRACT_CODE` are already defined (empty) in `.env.local.example` per `architecture.md`'s env var table — you'll need real Monnify sandbox credentials to test this against a live call. If credentials aren't available, implement the real integration code path against Monnify's documented sandbox contract (correct auth, correct request/response parsing) but flag clearly in your final report that it's untested against a live sandbox, rather than silently falling back to a mock the way milestone 2's KYC did. Check whether Monnify sandbox credentials already exist in Render's env vars before assuming none are available.

2. **Wire into `POST /api/merchants/:id/approve`**
   - At the exact hook point already commented in `app/api/merchants/[id]/approve/route.ts` (right before `monnifyAccountNumber` is set), call the new Monnify client to create a reserved account for the merchant — pass whatever merchant identity fields Monnify's API requires (name, email, BVN if required by the sandbox contract — check the docs, don't guess).
   - Persist the returned account number and Monnify's internal reference onto the merchant row: `monnify_account_number` and `monnify_account_reference` (per `data-model.md` — these columns already exist from milestone 1's migration, no schema change needed).
   - Update the response to return the real `monnifyAccountNumber` instead of `null`.
   - If Monnify's call fails, decide and clearly implement the failure behavior: the merchant should still end up `approved` (per `api-contracts.md`, approval and account issuance are one API call) — but don't silently swallow a Monnify failure. Return a response that makes the partial-failure state visible (e.g. `approvalStatus: "approved"`, `monnifyAccountNumber: null`, plus an error detail) rather than a generic 500 that hides that approval itself succeeded.

3. **Idempotency / re-approval safety**
   - If `POST /api/merchants/:id/approve` is called again on an already-approved merchant with an existing `monnify_account_number`, do not create a second Monnify account — return the existing one. Check the current row before calling Monnify.

### Explicitly out of scope for this milestone

Do not build the webhook receiver for transaction notifications — that's milestone 5 (a different Monnify API surface: incoming payment webhooks vs. this milestone's outbound account-creation call). Do not touch the merchant onboarding UI (milestone 3, already done) or build any UI for this milestone — it's backend-only, verified via direct API calls. Do not implement BVN/NIN verification changes — milestone 2's mock stays as-is unless Monnify's reserved-account API itself requires already-verified KYC data as an input, in which case just consume what's already on the merchant row.

### Done-when (from plan.md)

An approved merchant has a real Monnify reserved account number persisted — i.e. calling `POST /api/merchants/:id/approve` against the deployed Render URL with real Monnify sandbox credentials configured returns a real, working `monnifyAccountNumber`, and it's saved on the `merchants` row in Supabase.

### Before you finish

- Test the approve route against the live Render deployment with real Monnify sandbox credentials if they're available (check Render's env vars first); if genuinely unavailable, say so explicitly rather than reporting this as done.
- Confirm idempotency: calling approve twice on the same merchant doesn't create two Monnify accounts.
- Double check no real API keys or secrets got committed — only `.env.local.example` should be tracked, and only with placeholder values.
- Update `handoff.md` with a milestone 4 entry: what shipped, whether it was verified against a live Monnify sandbox call or only code-path-verified, any new env vars, and the seam left for milestone 5 (webhook ingestion needs the account number/reference this milestone persists, to match incoming transactions to merchants).
- Report back: example request/response from the live approve route, the Supabase row showing the persisted account number/reference, and honest confirmation of whether this was tested against Monnify's real sandbox or not.
