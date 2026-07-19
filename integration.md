# Milestone 3 — Integration Notes (Merchant onboarding UI)

Reflects current state as of this milestone. Overwrite on the next frontend milestone (7) per `handoff.md`'s convention.

## Endpoints called

- `POST /api/merchants` — called once, from the signup wizard's final "Submit application" step (`app/signup/page.tsx`), with:
  ```json
  {
    "phone": "+2348012345678",
    "email": "merchant@example.com",
    "password": "...",
    "businessName": "...",
    "bvnOrNin": "12345678901"
  }
  ```
  `bvnOrNin` is only included in the body if the user filled it in (omitted entirely, not sent empty), matching the "optional" contract in `api.md`.
- `GET /api/merchants/:id/approve` — **not called**. Admin-only per scope; the UI has no path to it.
- No other endpoints exist yet to call (no merchant-facing status/polling route), so the pending-approval screen is a static confirmation, not a live status check.

## Mismatch found vs. `api.md`

`api.md` documents duplicate-email as a `400`. In practice, Supabase Auth's `admin.createUser` returns a `422` for a duplicate email, and `app/api/merchants/route.ts` forwards that status verbatim (it only downgrades to 400 when the auth error status is missing or outside the 400–499 range). Confirmed live: `POST /api/merchants` with a reused email returns **422**, not 400.

**Resolution: adapted the frontend, didn't touch the backend.** The signup form's error handling treats any non-2xx response the same way — read `error` from the JSON body and display it — so the actual status code (400 vs 422) doesn't matter to the UI. No behavior change needed. Flagging here since `api.md` should probably be corrected to say 422 for the duplicate-email case, but that's milestone 2's doc to fix, not this milestone's scope.

## Client-side assumptions

- **No polling, no realtime.** The pending screen is static text shown immediately after a successful `201` response — there's no merchant-facing status endpoint to poll yet, and none was added (out of scope for this milestone).
- **No session persistence.** Signup creates a Supabase Auth user server-side via the service-role client, but the browser never receives or stores a session/JWT — the UI doesn't log the merchant in or redirect to any authenticated area. This is intentional per the milestone scope ("do not build merchant login/session persistence beyond what's needed to reach [the pending] screen").
- **KYC is inline, not a separate step's own API call.** The wizard has a distinct "Verification" step in the UI for UX clarity (matches `userflows.md` step 2 as a separate stage), but `bvnOrNin` is just accumulated into the same form state and sent in the single final `POST /api/merchants` call — there's no second request per the seam `api.md`/`handoff.md` left open.
- **"Verified" badge on the pending screen reflects that a BVN/NIN was submitted, not the actual `bvn_nin_verified` value returned by the API** — the `201` response body only contains `merchantId` and `approvalStatus` (per `api.md`), not the KYC result, so the UI can't distinguish "verified" from "rejected" today. Given `mockVerifyBvnNin` currently marks any 10–11 digit string as verified, this doesn't misrepresent anything yet, but if a later milestone's mock (or the real Monnify KYC check) can fail, the UI will need `POST /api/merchants` to return `bvn_nin_verified` in its response body so the pending screen can show the true result instead of assuming success.
- Client-side phone validation uses `/^\+[1-9]\d{7,14}$/` (E.164) purely for UX (fail fast before hitting the API); the API's real enforcement point is Supabase Auth rejecting bad formats with an error, which the UI still surfaces correctly if a format slips past the client regex.

## PWA install prompt

- `app/install-prompt.tsx` listens for `beforeinstallprompt`, suppresses the browser's default mini-infobar, and shows a small dismissible banner instead. No install prompt fires in a plain desktop Chromium tab without HTTPS + PWA installability criteria fully met (manifest + service worker + icons — already in place from milestone 1) — confirmed no console errors from the `beforeinstallprompt` listener itself; the actual install-eligible banner should be checked against the deployed HTTPS Render URL, since Chromium's installability heuristics don't reliably fire on `http://localhost`.

## Manual test notes

Ran an automated-but-real-browser pass (Playwright + Chromium) against the local dev server (`next dev`, wired to the **live** Supabase project via the project's real `.env`, same DB `api.md`/`handoff.md` milestone 2 was verified against — not a mock):

1. Landing page (`/`) loads, title "PROOFR", CTA link visible and navigates to `/signup`.
2. Signup step 1 (account): submitting an invalid phone (`08012345678`, not E.164) shows the inline format error and blocks progress; correcting it to `+234801...` advances to the verification step.
3. Signup step 2 (verification): entering a BVN/NIN and continuing advances to business details.
4. Signup step 3 (business): business name required; continuing advances to review.
5. Signup step 4 (review): shows all entered values correctly, submits `POST /api/merchants`.
6. Pending screen: shown after `201`, displays business name, "Identity verified" badge (BVN/NIN was provided), and the returned `merchantId` as a reference.
7. Duplicate-email resubmission: second signup with the same email correctly surfaces the server's "A user with this email address has already been registered" message (see mismatch note above — actual status was 422).
8. Verified via `GET /api/health`'s `merchants_count` that the browser-driven signup actually inserted a new `merchants` row (count incremented), and via direct `curl` against the same running server that the created row's shape matches milestone 2's own documented example.
9. No unexpected console/page errors during the flow (only expected dev-mode HMR/DevTools noise, and the documented 422 from the deliberate duplicate-email test).

**Re-run against the live Render URL** (`https://proofr.onrender.com`) after pushing to `main` and confirming the deploy picked up the new pages: the identical Playwright script (landing → invalid phone → valid signup with BVN/NIN → pending screen with reference ID → duplicate-email 422 correctly surfaced) passed with no differences from the local run. `GET /api/health` confirmed `merchants_count` incremented with each browser-driven signup, and rows landed in the same live Supabase project milestone 2's API test used — same DB, same `merchants`/`auth.users` shape, just created through the browser instead of `curl`.
