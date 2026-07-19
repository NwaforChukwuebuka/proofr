# PROOFR — Handoff Log

Cross-milestone continuity: what shipped, what's mocked and why, env vars added, and what the next milestone's dev (human or agent) needs to know before touching this code. Append one entry per milestone as it completes — never rewrite past entries, only add to them if a later milestone changes something they assumed.

## Convention: visual theme

Every **frontend** milestone (3, 7, 9, 11, 13, 14) must read every image in `ui-inspirations-theme/` before writing any UI — it's the visual spec (Moniepoint-style Nigerian fintech look: brand-blue backgrounds, white rounded cards, bold headlines, pill buttons, balance-card motifs; see `app/globals.css`'s `--brand`/`--brand-dark`/`--brand-tint` vars from milestone 3 for the established palette). Milestone 3's first pass missed this folder (it isn't referenced from `plan.md`/`architecture.md`) and shipped a generic black/white UI before being redirected — don't repeat that.

## Convention: `integration.md`

After every **frontend** milestone (3, 7, 9, 11, 13, 14), the frontend dev drops an `integration.md` in the project root (overwrite the previous one — it reflects current state, not history; this log is the history) covering:
- Which backend endpoints from [api.md](api.md) it actually calls, and with what shapes.
- Any mismatch found between `api.md`/`api-contracts.md` and what the API really returned, and how it was resolved (fixed the backend, or adapted the frontend — say which).
- Any client-side assumption baked in (e.g. polling vs. realtime, optimistic UI, error states) that a later milestone should know about.
- Manual test notes: what was clicked through in a real browser against the deployed Render URL, per this project's standing rule to test UI changes live before calling them done.

This entry in `handoff.md` should then get a one-line pointer to that milestone's `integration.md` findings, once available.

---

## Milestone 1 — Project scaffold & deploy

- Next.js (App Router, TS) + PWA scaffold, Supabase schema migrated (`supabase/migrations/0001_init.sql`), deployed to Render at `https://proofr.onrender.com`.
- `lib/supabase.ts`: browser (anon key) client + server-only service-role client.
- `/api/health` confirms the live Supabase connection.
- Env vars: see `.env.local.example`. `MONNIFY_*` were left empty — no sandbox credentials configured yet.

## Milestone 2 — Merchant onboarding API

- `POST /api/merchants` and `POST /api/merchants/:id/approve` implemented and verified against the live Render deployment + real Supabase project (rows created/cleaned up in both `auth.users` and `merchants`; RLS scoping confirmed with a real anon-session JWT). Full request/response detail in [api.md](api.md).
- **Mocked**: BVN/NIN verification (`lib/kyc.ts`'s `mockVerifyBvnNin`) — no Monnify sandbox KYC endpoint was reachable with current env vars. See [[monnify-sandbox-only]]: check the sandbox docs before milestone 4/5 assume this needs to stay mocked.
- **New env var**: `ADMIN_API_SECRET` — minimal shared-secret gate for the approve route, not real admin auth (milestone 14 replaces it). Must be set in Render's dashboard and locally in `.env`; not committed anywhere.
- **Seam left for milestone 3**: `POST /api/merchants` accepts an optional `bvnOrNin` field (not in the frozen `api-contracts.md` shape) so the signup UI can pass it inline instead of needing a separate KYC-step endpoint. If milestone 3's UX wants a distinct verification step/screen, the frontend can just call `POST /api/merchants` without `bvnOrNin` first, then decide how to trigger verification later — no second endpoint exists yet for that.
- **Seam left for milestone 4**: the approve route's response always has `monnifyAccountNumber: null`; the hook point to call real Monnify issuance is commented directly above where that variable is set in `app/api/merchants/[id]/approve/route.ts`.

## Milestone 3 — Merchant onboarding UI

- Landing page (`app/page.tsx`), a 4-step signup wizard (`app/signup/page.tsx`: account → BVN/NIN verification → business details → review/submit, all rolled into a single `POST /api/merchants` call), a static pending-approval screen, and a `beforeinstallprompt`-driven install banner (`app/install-prompt.tsx`, wired into `app/layout.tsx`).
- Full detail — endpoint shapes called, a real `api.md` mismatch found (duplicate email returns `422` not the documented `400`, resolved by adapting the frontend to treat any non-2xx generically), client-side assumptions (no polling/realtime, no session persistence, KYC result not distinguishable from the `201` response body yet), and manual browser test notes — in [integration.md](integration.md).
- **Seam left for milestone 7** (revenue dashboard): if that milestone wants to route a merchant from signup straight into an authenticated dashboard, it'll need to add session handling — this milestone deliberately stops at the static pending screen with no session/JWT persisted client-side.

## Milestone 4 — Monnify virtual account issuance

- `lib/monnify.ts`: real Monnify sandbox client — `POST /api/v1/auth/login` (Basic auth, in-process token cache) then `POST /api/v1/bank-transfer/reserved-accounts` (Bearer auth, `contractCode`, deterministic `accountReference: PROOFR-<merchantId>`). Wired into the milestone-2 hook point in `app/api/merchants/[id]/approve/route.ts`. Full request/response detail in [api.md](api.md).
- **Verified against a live Monnify sandbox call, not mocked or code-path-only.** Real `MONNIFY_API_KEY`/`MONNIFY_SECRET_KEY`/`MONNIFY_CONTRACT_CODE` were provided by the user directly into local `.env` (never committed — `.env` stays gitignored; only `.env.local.example` with blank placeholders is tracked). Tested locally end-to-end: signed up a fresh test merchant via `POST /api/merchants`, approved it, got back a real `monnifyAccountNumber` (`4119733541`) and confirmed both `monnify_account_number` and `monnify_account_reference` (`7537FELYM895Z9EX856G`) persisted on the Supabase `merchants` row. Approved the same merchant two more times and got the identical cached account number back both times, with no new Monnify account created — idempotency confirmed.
- **Live-sandbox discrepancy found and fixed**: Monnify's docs (Confluence + developer docs) describe the create-reserved-account response nesting the issued account under a `responseBody.accounts[]` array. The actual sandbox response (without passing `getAllAvailableBanks: true`) returns `accountNumber`/`bankName`/`bankCode` flat on `responseBody` instead. `lib/monnify.ts` handles both shapes defensively, but only the flat shape has actually been observed live.
- **BVN/NIN**: not sent to Monnify. PROOFR never stores raw BVN/NIN (milestone 2's `mockVerifyBvnNin` only persists a verified boolean + hashed reference, see [[monnify-sandbox-only]]), and Monnify's V1 reserved-account endpoint documents `customerBvn` as optional at creation time (only required later, before a *regulated-category* merchant can receive payments) — so this was a non-blocking gap, not a scope violation. Revisit if a later milestone needs `customerBvn` set (would require milestone 2's KYC mock to start persisting the raw value, which it currently does not).
- **NOT tested against the live Render deployment** (`https://proofr.onrender.com`) — I do not have access to Render's dashboard to confirm/set `MONNIFY_API_KEY`/`MONNIFY_SECRET_KEY`/`MONNIFY_CONTRACT_CODE` there. Local testing (above) exercised the identical code path against the real Supabase project and real Monnify sandbox, so the only unverified variable is Render's env config. Whoever deploys this next should set those three vars in Render (values already known — see local `.env`) and re-run one approve call against the live URL to confirm.
- **Partial-failure behavior**: approval and account issuance are one API call per `api-contracts.md`. If Monnify's call fails, `approval_status` still flips to `approved` (not rolled back), and the response is `{ approvalStatus: "approved", monnifyAccountNumber: null, monnifyError: "<detail>" }` — a 200, not a generic 500, so the caller can see approval succeeded and retry issuance via a second `POST .../approve` call (idempotency check lets that retry through since `monnify_account_number` is still null on the row).
- **No new env vars beyond what was already scaffolded**: `MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, `MONNIFY_CONTRACT_CODE` (all already listed in `.env.local.example` since milestone 1, now populated locally with real sandbox values). `MONNIFY_WEBHOOK_SECRET` remains unused — that's milestone 5.
- **Seam left for milestone 5** (webhook ingestion): incoming Monnify transaction webhooks will need to match a payment to a merchant. `monnify_account_number` and `monnify_account_reference` are now populated on approved merchants' rows for exactly that lookup — join/match on whichever of the two Monnify's webhook payload actually includes (check the payload shape when building milestone 5; not confirmed here).
