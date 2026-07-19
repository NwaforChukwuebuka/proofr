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
