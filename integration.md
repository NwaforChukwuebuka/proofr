# Milestone 11 — Integration Notes (Report view/share)

Reflects current state as of this milestone. Overwrites milestone 9's `integration.md` per `handoff.md`'s convention — that milestone's history now lives in `handoff.md` only.

## What was built

- `app/report/[id]/page.tsx` — the merchant-facing Proof-of-Revenue report view. `[id]` is the **merchant id** (not the report id) so the same route serves both the merchant's own "latest report" view (bearer token, no `?reportId=`) and the unauthenticated share-link view (`?reportId=<uuid>`, no auth header sent at all).
- `lib/fraud-labels.tsx` — `RULE_LABELS`/`SeverityBadge`/`formatNaira`/`formatDate` extracted out of milestone 9's `app/dashboard/fraud-flags.tsx` (which now imports from here instead of defining its own copies), so the report page's flat `fraudFlags` rows (`rule_type`/`severity`/`amount`/`created_at`, no nested `transactions` object) get the same plain-language labels as the dashboard without reimplementing the mapping. This is exactly the reuse milestone 10's handoff note anticipated.
- `app/dashboard/page.tsx` — new "Proof-of-Revenue report" card: a "Generate report" button (`POST .../report` with the merchant's bearer token, then navigates straight to `/report/:merchantId?reportId=<new id>`) and a "View my latest report" link (`/report/:merchantId`, no query — the report page fetches the latest via bearer token itself).
- `window.print()` "Download / Print" button + `print:` Tailwind variants throughout the report page (hides the share/print controls and nav on `print:hidden`, swaps shadows for a plain border, forces white backgrounds) + a `@page { margin: 1.5cm; }` rule added to `app/globals.css`.

## Endpoints called, and a real mismatch found + fixed

Both calls are exactly `api.md`'s milestone 10 routes:
- `POST /api/merchants/:id/report` (merchant bearer token) — generate.
- `GET /api/merchants/:id/report` (merchant bearer token, no `reportId`) — "my latest report."
- `GET /api/merchants/:id/report?reportId=<uuid>` (no auth header at all) — the share-link view.

**Mismatch found**: `api.md`'s documented `200` response for `GET /api/merchants/:id/report` never included the report's own id — only `profile`/`verificationStatus`/`revenueSummary`/`trendData`/`confidenceScore`/`fraudFlags`/`generatedAt`. Without the report id, the "my latest report" bearer-token path has no way to construct a canonical `?reportId=` share URL (the whole point of this milestone). **Resolved by fixing the backend, not adapting around it**: `app/api/merchants/[id]/report/route.ts`'s `buildReportResponse` now also returns `reportId: report.id` on both the latest-report path and the specific-`reportId` path (both queries already selected `id`, so no new query was needed — just one added line and a widened response type). `api.md`'s milestone 10 section should be read as if its example response included `"reportId": "..."` at the top level; not re-editing that file's frozen example blocks here, but noting the correction inline in this doc per the mismatch-resolution convention.

## Client-side assumptions

- **Ownership check is separate from the report fetch.** The page always attempts `supabase.auth.getSession()` and, if a session exists, does an RLS-scoped `select id from merchants where id = :id and auth_user_id = :user.id` to decide whether to show owner-only controls (the "Generate a fresh snapshot" button). This is independent of which report-fetch path was used — a merchant who opens their *own* share link still gets the regenerate control, not just a read-only view.
- **No `?reportId=` and no session → redirect to `/login`.** This only happens if someone navigates to `/report/:id` directly without ever generating a report or clicking a share link; the dashboard's own links always either include `?reportId=` or rely on an active session.
- **No report generated yet** (`GET` latest path returns `404`) renders a small empty state with a "Generate report" button, shown only if `isOwner` — this is only reachable via the bearer-token path, which already implies a session exists.
- **Share link is built from the fetched report's `reportId` field, not from `window.location`** — so "Copy share link" produces the same URL whether the merchant arrived via "View my latest report" (no query string) or via a share link someone sent them.
- **Trend chart is reused as-is** (`app/dashboard/trend-chart.tsx`) — it takes a plain `{period, amount}[]` prop and has no auth/session dependency, so it works unmodified for an unauthenticated viewer.
- **The share-link caveat is surfaced inline, not hidden**: "Anyone with this link can view this report — links don't expire yet, so only share it with people you trust," directly under the copy/download buttons. No real signed/expiring token mechanism was built — out of scope per milestone 10/11's handoff note.

## Manual test notes

Tested against the **live Supabase + Monnify sandbox backends** (same real project prior milestones use), first against the deployed Render URL, then locally once a code fix was needed.

1. Seeded a disposable `TEST-M11-SEED-*` merchant via `POST /api/merchants` against `https://proofr.onrender.com`, approved it via `POST .../approve` (real Monnify sandbox call, got a real `monnifyAccountNumber`), obtained a session via Supabase's password-grant token endpoint, and seeded two transactions directly via Supabase's REST API (`monnify_reference` prefixed `TEST-M11-SEED-*`, `raw_payload: {"test": true}`): one clean (₦50,000) and one with an **open** `self_funding` flag (₦15,000), plus an **overridden** `velocity_spike` flag on the clean transaction (to exercise both branches).
2. `POST /api/merchants/:id/report` against the deployed Render URL → `200`, got back `reportId`.
3. `GET /api/merchants/:id/report` (bearer, latest) against the **deployed** Render URL → **found the reportId gap above** (deployed instance was still serving pre-M11 code, expected since the fix hadn't been pushed/deployed yet).
4. Started a local `next dev` server wired to the same live Supabase/Monnify project and re-ran the same two `GET` calls locally: bearer-token "latest" path now correctly includes `reportId: "713dfb5e-..."`, and `GET .../report?reportId=713dfb5e-...` **with no Authorization header at all** (the literal request shape an unauthenticated lender's browser would send) returned a **byte-for-byte identical response** — confirmed via `diff`. Numbers matched expectations: `grossInflow: 65000`, `verifiedRevenue: 50000` (the ₦15,000 open-flagged transaction excluded), `confidenceScore: 70` (100 − 30 for the open `self_funding` flag; the overridden flag contributed nothing).
5. Smoke-tested that `/report/:id?reportId=...`, `/report/:id` (no query), and `/dashboard` all return `200` from the local server (confirms no server-side render crash on the new route); `npx tsc --noEmit` and `next build` both pass clean.
6. All seeded transactions, fraud flags, the merchant row, and its auth user were deleted afterward via the service-role REST API; confirmed a `business_name=like.TEST-M11-SEED*` query on `merchants` returns `[]`.

**Not tested this pass, and worth being explicit about**: no browser-automation tool was available in this environment, so the actual click-through — generate button → report renders → copy-link button → paste into a fresh incognito window → page renders identically — was verified at the **API contract level** (steps 3–4 above prove the two fetch paths the frontend depends on return identical data with zero auth on the share path) and by confirming the pages don't 500, but **not** by literally opening a private browser window and clicking. The `reportId` fix must also still be pushed and deployed to Render before the deployed-URL flow matches what was tested locally — the deployed instance was on pre-M11 code as of this test run.

## Before finishing

- No secrets committed — `.env` untouched; only `lib/fraud-labels.tsx`, `app/report/[id]/page.tsx`, `app/dashboard/page.tsx`, `app/dashboard/fraud-flags.tsx`, `app/globals.css`, and `app/api/merchants/[id]/report/route.ts` are new/changed.
