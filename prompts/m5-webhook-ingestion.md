# Build prompt — Milestone 5: Webhook ingestion

Paste this whole prompt to the coding agent to execute M5.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements
2. `plan.md` — the full milestone list (you are implementing milestone 5 only)
3. `architecture.md` — system design; note the diagram shows the webhook route feeding both the fraud engine and revenue engine synchronously in-process
4. `data-model.md` — the `transactions` table you're inserting into (insert-only/immutable, `monnify_reference` unique for idempotency)
5. `api-contracts.md` — the frozen `POST /api/webhooks/monnify` contract
6. `api.md` — **as-built** API reference; source of truth over `api-contracts.md` where they differ. Read the milestone 4 entry closely — it documents the real (not just-documented) shape of Monnify sandbox responses, since their live behavior has already diverged from their docs once
7. `handoff.md` — read all four milestone entries in full, especially milestone 4's "seam left for milestone 5" note about matching incoming webhook payloads to merchants via `monnify_account_number`/`monnify_account_reference`, and its note that Render can keep serving an old build briefly after a push even while `/api/health` reports healthy

Milestones 1–4 already delivered: the app deployed to Render at `https://proofr.onrender.com`; Supabase schema (including `transactions`) migrated; `lib/monnify.ts` with a working Monnify sandbox client (auth/token caching) used for reserved-account issuance; approved merchants have real `monnify_account_number` and `monnify_account_reference` persisted via `POST /api/merchants/:id/approve`. `MONNIFY_WEBHOOK_SECRET` has been scaffolded in `.env.local.example` since milestone 1 but is unused until now.

## Your task: Milestone 5 — Webhook ingestion

Build `POST /api/webhooks/monnify`: the public route Monnify calls when a customer pays into a merchant's reserved virtual account, verified and stored as an immutable transaction row.

### Scope

1. **Route handler** (`app/api/webhooks/monnify/route.ts`)
   - Public route (Monnify calls it directly, no user session) — auth is via signature verification only, not a session/header secret like the admin route.
   - Look up Monnify's actual sandbox webhook documentation for their transaction-notification payload shape and signature scheme (Monnify signs webhook payloads with a hash using the account's secret key — confirm the exact header name and hashing algorithm from their docs; don't guess). Given milestone 4's finding that Monnify's live behavior has diverged from their docs before, if a way to trigger a real sandbox test payment exists, prefer verifying against a real webhook call over trusting the docs alone.
   - Verify the signature against `MONNIFY_WEBHOOK_SECRET` before doing anything else. Reject (4xx) unverified requests without touching the database.

2. **Merchant matching**
   - Match the incoming payload to a merchant via whichever of `monnify_account_number` / `monnify_account_reference` Monnify's actual webhook payload includes (check the real payload shape — milestone 4 left this unconfirmed). If neither is present or no merchant matches, decide and clearly implement the failure behavior (log/reject) rather than silently dropping the event.

3. **Immutable transaction storage**
   - Insert a row into `transactions` per `data-model.md`: `merchant_id`, `monnify_reference` (Monnify's transaction reference — unique, this is the idempotency key), `amount`, `payer_name`, `payer_account`, `raw_payload` (the full webhook body, for audit/debug).
   - Idempotency: if `monnify_reference` already exists (Monnify retries webhooks on non-2xx or timeout), do not insert a duplicate row — return `200 OK` for the already-processed case too, since a retry isn't an error from Monnify's perspective.
   - Never update a `transactions` row after insert — the table is insert-only per `data-model.md`. If a correction scenario comes up, that's out of scope here.

4. **Response timing**
   - Per `api-contracts.md`, this route must ack quickly (`200 OK`) since fraud/revenue processing happens synchronously in-process for the MVP. Milestones 6 (revenue engine) and 8 (fraud engine) aren't built yet, so there's nothing to call synchronously right now beyond the transaction insert itself — don't build placeholder calls to engines that don't exist yet. Just make sure the insert path itself is fast and don't add unnecessary synchronous work that would slow down the ack.

### Explicitly out of scope for this milestone

Do not implement the fraud rule engine (milestone 8) or revenue aggregation (milestone 6) — this milestone only gets the transaction safely into the `transactions` table. Do not build any UI. Do not modify the Monnify reserved-account issuance flow from milestone 4.

### Done-when (from plan.md)

A sandbox test payment produces a stored transaction row within seconds — i.e. triggering a real Monnify sandbox payment into an approved merchant's reserved account results in a correctly-matched, correctly-shaped row appearing in the live Supabase `transactions` table shortly after.

### Before you finish

- Test against the live Render deployment with a real Monnify sandbox test payment if one can be triggered (check Monnify sandbox docs/dashboard for a way to simulate a payment into a reserved account) — per milestone 4's note, wait for Render's new build to actually finish deploying before testing, don't rely on `/api/health` alone as a signal that the new code is live.
- Verify idempotency by re-sending (or re-triggering) the same webhook payload and confirming no duplicate row is created.
- Verify signature rejection actually rejects a tampered/unsigned request.
- Double check no real API keys or secrets got committed.
- Update `handoff.md` with a milestone 5 entry: what shipped, the real (observed, not just documented) webhook payload/signature shape, whether it was verified against a live Monnify sandbox payment or only code-path-verified, and the seam left for milestone 6 (revenue engine needs to query `transactions` — note any relevant shape/indexing considerations found here).
- Report back: the observed webhook payload shape, confirmation of a real stored transaction row (or honest confirmation that only code-path verification was possible, with the reason why), and idempotency/signature-rejection test results.
