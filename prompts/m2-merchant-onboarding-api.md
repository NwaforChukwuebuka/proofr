# Build prompt — Milestone 2: Merchant onboarding API

Paste this whole prompt to the coding agent to execute M2.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements
2. `plan.md` — the full milestone list (you are implementing milestone 2 only)
3. `architecture.md` — system design and why key stack decisions were made
4. `data-model.md` — the Supabase schema (already migrated in milestone 1)
5. `api-contracts.md` — exact request/response shapes for the routes you're building
6. `prompts/m1-project-scaffold-deploy.md` — what milestone 1 already delivered, so you know what exists

Milestone 1 already set up: the Next.js (App Router + TS) app, PWA scaffold, `lib/supabase.ts` with a browser (anon key) client and a server-only service-role client, the `supabase/migrations/0001_init.sql` schema, and a Render deploy with a working `/api/health` route. Build on top of that — don't redo it.

## Your task: Milestone 2 — Merchant onboarding API

Implement the backend for merchant signup, KYC verification, business details, and the approval workflow — no UI (that's milestone 3).

### Scope

1. **`POST /api/merchants`** — signup, per `api-contracts.md`.
   - Auth: none (public signup).
   - Request: `{ phone, email, password, businessName }`.
   - Create a Supabase Auth user (email/password) using the service-role client, then insert a `merchants` row linked via `auth_user_id`, with `business_name`, `phone`, `email`, `approval_status: "pending"`, `bvn_nin_verified: false`.
   - Response: `{ merchantId, approvalStatus: "pending" }`.
   - Validate required fields and return clear 4xx errors for malformed input (don't let a missing field 500).

2. **KYC verification (BVN/NIN)**
   - Check whether Monnify's sandbox (or another available sandbox) actually exposes a BVN/NIN verification endpoint reachable with the env vars already defined in `.env.local.example`. If yes, call it for real.
   - If no real sandbox call is feasible in the time available, implement a clearly-labeled mock (e.g. a function named `mockVerifyBvnNin` with a comment-free but obviously-named implementation, isolated so it's a one-line swap for a real call later) that deterministically sets `bvn_nin_verified` and `kyc_reference` given a BVN/NIN input. Do not silently fake it — the mock path must be unmistakable in the code (naming, not comments/flags).
   - Wire this into signup or a follow-up step — whichever fits `data-model.md`'s fields without adding new ones. Do not add columns beyond what `data-model.md` specifies.

3. **`POST /api/merchants/:id/approve`** — approval workflow, per `api-contracts.md`.
   - Auth: admin. Milestone 14 owns the real admin UI/auth; for now gate this with a minimal check appropriate to what Supabase Auth is set up for at this point (e.g. service-role-only call, or a simple role check if you already have one) — don't build a full admin system here, that's out of scope.
   - Request: `{}`. Response: `{ merchantId, approvalStatus: "approved", monnifyAccountNumber }`.
   - This route is *only* responsible for flipping `approval_status` to `approved`. Monnify virtual account issuance itself is milestone 4 — stub `monnifyAccountNumber` as `null`/not-yet-issued in the response for now, and leave a clear seam (e.g. a TODO-free function call point or comment marking milestone 4's hook) rather than building the Monnify integration now.

4. **Supabase Auth wiring**
   - Confirm signup actually creates a row in Supabase Auth's `auth.users` (visible in the Supabase dashboard or via a query) and that the `merchants.auth_user_id` foreign key is correctly populated.
   - Confirm the existing RLS policies from `data-model.md` (merchant scoped to own `auth_user_id`) actually hold: a merchant's anon-key session should only be able to read their own `merchants` row.

### Explicitly out of scope for this milestone

Do not build the merchant signup UI, KYC UI, business details form, or pending-approval UI — those are milestone 3. Do not call the real Monnify virtual account issuance API — that's milestone 4. Do not build a full admin auth system — that's milestone 14; use the minimal service-role/role-check gate described above and move on.

### Done-when (from plan.md)

A merchant record can be created end-to-end via API and appears in Supabase — i.e. `POST /api/merchants` against the deployed Render URL produces a real row in both `auth.users` and `merchants`, and `POST /api/merchants/:id/approve` correctly flips `approval_status` to `approved`.

### Before you finish

- Test both routes against the live Render deployment (not just locally) — confirm rows land in the real Supabase project.
- Double check no real API keys or secrets got committed.
- Report back: example request/response for both routes run against the deployed URL, and confirmation the `auth.users` ↔ `merchants` link and RLS scoping both hold.
