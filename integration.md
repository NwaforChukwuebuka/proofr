# Milestone 14 — Integration Notes (Admin stub)

Reflects current state as of this milestone. Overwrites milestone 13's `integration.md` per `handoff.md`'s convention — that milestone's history now lives in `handoff.md` only.

## What was built

- `app/api/admin/fraud-queue/route.ts` (`GET`) and `app/api/admin/fraud-flags/[id]/override/route.ts` (`POST`) — same `x-admin-secret` shared-secret gate as `POST /api/merchants/:id/approve` (milestone 2), using `createServiceRoleSupabaseClient()` to bypass RLS, exactly per `data-model.md`'s "Admin bypasses RLS via `SUPABASE_SERVICE_ROLE_KEY` in server-side API routes only" note.
- `app/admin/page.tsx` — a single page: an "enter admin secret" gate, then a flat fraud-queue list with Clear/Confirm buttons per row. No filtering/sorting/pagination/bulk actions, no audit log — matches `plan.md` milestone 14's explicit "not full CRUD/audit-log UI" scope note.

## The admin-auth decision (read before assuming milestone 2's "milestone 14 replaces it" note means a real login system)

`handoff.md` milestone 2 says `ADMIN_API_SECRET` is "not real admin auth (milestone 14 replaces it)." Taken literally that reads like this milestone should build a real admin identity system. It doesn't, deliberately:

- `data-model.md` has no `admins` table.
- `api-contracts.md` has no admin signup/login route.
- `architecture.md` states admin access goes through `SUPABASE_SERVICE_ROLE_KEY`-backed server routes, not a Supabase Auth role.

Building a real admin login (a Supabase Auth admin role, a new table, session handling) would be inventing an identity system nothing in the frozen spec supports — the same shape of gap milestone 12 hit with lender signup, and resolved by *not* inventing a route. This milestone resolves it the same way: **`ADMIN_API_SECRET` stays the real security boundary.** "Replaces it" is read here as "the admin *page* now exists to drive that gate through a UI," not "the gate itself gets replaced by real auth."

To still make the admin page *feel* gated to a human: on first load it shows a plain "enter admin secret" prompt (`app/admin/page.tsx`), the value is stored in `sessionStorage` only (cleared when the tab closes, never `localStorage`/a cookie), and sent as `x-admin-secret` on every fraud-queue/override call. A `401` from either route clears the stored value and re-prompts with "Wrong admin secret." No email/password field, no "remember me" — this deliberately does not pretend to be a real login form.

`fraud_flags.reviewed_by` (nullable FK → `auth.users.id`) is left `null` on every override. There is no real admin Supabase Auth user under this scheme to attribute a review to, and fabricating one (e.g. reusing a merchant's or a hardcoded UUID) would misrepresent who reviewed what. Left `null`, honestly.

## The clear/confirm schema decision

`api-contracts.md`'s `POST /api/admin/fraud-flags/:id/override` accepts `{ action: "clear" | "confirm" }` but `data-model.md`'s `fraud_flags.status` only has two values: `open` | `overridden`. Two actions, two statuses, but not a 1:1 mapping — `fraud-rules.md`'s framing (overridden flags don't count against the score) makes the honest reading:

- **`"clear"`** — admin determined the flag is a false positive or otherwise resolved → `status: "overridden"`, `reviewed_at` set. This is the action that actually changes `verifiedRevenue` (`lib/revenue.ts` excludes only `status: "open"` transactions) and the confidence-score penalty (`lib/confidence.ts` only sums *open* flags). Response: `{ flagId, status: "overridden" }` — matches the contract's example.
- **`"confirm"`** — admin looked at it and agrees it's real fraud → `status` stays `"open"`, but `reviewed_at` is set so it's distinguishable from a flag nobody has looked at yet. No effect on scoring (still open, still penalized) — by design, confirming real fraud shouldn't clear the penalty for it. Response: `{ flagId, status: "open" }` — the contract's own example only shows the `overridden` case and doesn't spell out `confirm`'s shape; this is the honest shape given what actually happened server-side, even though it diverges from the contract's single worked example.

The admin page distinguishes a "confirmed but still open" flag from an unreviewed one client-side only (an "Confirmed — still open" badge, tracked in local component state after a successful `confirm` call) — the queue response itself doesn't carry a `reviewedAt` field, since the frozen contract's queue shape doesn't include one and adding it wasn't necessary for this stub.

## Endpoints called, and shapes

- `GET /api/admin/fraud-queue` — matches `api-contracts.md`'s documented shape (`flagId, transactionId, merchantId, ruleType, severity, createdAt`) plus three extra fields not in the frozen contract: `amount`, `payerName`, `businessName`. These come from a join to `transactions`/`merchants` server-side (`!inner` joins, same RLS-bypassing service-role client) because the admin needs enough context to make a clear/confirm call, and the frozen contract's bare shape (just IDs) isn't enough for a human to act on without a second round-trip per row. Only **open** flags are returned — a "queue" implies unresolved work (per `userflows.md`'s framing), so a flag that was `confirm`ed (still `open`, `reviewed_at` set) stays in this list, by design; only `clear` (→ `overridden`) removes it.
- `POST /api/admin/fraud-flags/:id/override` — request/response as decided above. Errors: `401` (missing/wrong `x-admin-secret`), `400` (`action` missing or not `clear`/`confirm`), `404` (no `fraud_flags` row with that id), `500` (`ADMIN_API_SECRET` unset on the server, or a Supabase error) — same error shape convention as `POST /api/merchants/:id/approve`.

## Client-side assumptions

- **`sessionStorage`, not `localStorage`, not a cookie** — the admin secret should not survive closing the tab, and should never be sent automatically by the browser the way a cookie would.
- **No merchant/lender flow was touched.** The dashboard's `FraudFlagsCard` and `GET /api/merchants/:id/report` already reacted correctly to `status` changes (confirmed directly via Supabase updates in milestones 8/10, before any override route existed) — this milestone only adds a real way to *trigger* that status change, not new logic on the receiving end.
- **`GET /api/merchants/:id/revenue` is live-computed per call** (`lib/revenue.ts`, not read from a stored `reports` snapshot), so clearing a flag through the admin UI is reflected on the merchant's dashboard on its very next fetch — no report regeneration needed to see the effect. A merchant's stored `reports.confidence_score`/`revenue_summary` snapshot (from `POST /api/merchants/:id/report`) is **not** retroactively updated by an override — that's a frozen-at-generation-time snapshot per milestone 10's design; a merchant would need to regenerate a new report to see an updated snapshot reflect a clear/confirm decision.

## Manual test notes

Both a scripted Supabase+fetch test and a real Playwright browser run, first against a local `next dev` server pointed at the live Supabase project, then re-run against the deployed `https://proofr.onrender.com` after pushing to `main`.

1. **Scripted test** (disposable, not committed): found an existing approved merchant, seeded a `TEST-M14-SEED-*` transaction (₦5,000) + one open `fraud_flags` row (`self_funding`, `high`) directly via the service-role client. Computed `verifiedRevenue` before/after seeding using the same logic `lib/revenue.ts` uses — confirmed the seeded transaction was excluded once the flag existed (`gross: 35000, verified: 30000`).
   - `GET /api/admin/fraud-queue` (`200`) returned the seeded flag with the extra `amount`/`payerName`/`businessName` fields correctly joined.
   - `POST .../override` with `{ action: "confirm" }` → `200 { flagId, status: "open" }`; `verifiedRevenue` unchanged (`30000`, still excluded); flag still present in the open queue afterward.
   - `POST .../override` with `{ action: "clear" }` → `200 { flagId, status: "overridden" }`; `verifiedRevenue` changed to `35000` (the ₦5,000 transaction is no longer excluded) — **confirmed via direct recomputation, not just the override route's own response**; flag no longer present in `GET /api/admin/fraud-queue`.
   - Auth/error matrix: wrong `x-admin-secret` → `401`; missing header → `401`; invalid `action` → `400`; non-existent flag id → `404`. All confirmed.
   - Cleanup: seeded transaction + flag deleted; recomputed revenue matched the pre-seed baseline exactly.
2. **Real browser test** (Playwright, headless Chromium against `http://localhost:3000`): seeded a second disposable `TEST-M14-SEED-BROWSER-*` transaction (₦7,500, `velocity_spike`, `medium`) the same way. Navigated to `/admin`, entered a wrong secret → confirmed the "Wrong admin secret." message renders and the page re-prompts (not a silent failure). Entered the real `ADMIN_API_SECRET` → fraud queue loaded, seeded row visible with the merchant's business name, amount, payer, and severity badge, matching the app's established rounded-card/brand-blue style (`ui-inspirations-theme/` read before writing the page). Clicked **Clear** on the seeded row → row disappeared from the list within ~1s (no manual refresh). Re-queried the flag directly via Supabase afterward: `status: "overridden"`, `reviewed_at` set, `reviewed_by: null`. Recomputed the merchant's revenue directly: the ₦7,500 now counted toward `verifiedRevenue` — **the cross-milestone effect the done-when criterion asks for, confirmed via real recomputation of the same aggregation `GET /api/merchants/:id/revenue` uses, not just the override route's `200`.** Cleaned up the seeded transaction/flag afterward.
3. `npx tsc --noEmit` and `npx eslint` both pass clean on the new files.
4. **Re-verified against the deployed Render URL** (`https://proofr.onrender.com`) after pushing to `main`: re-ran the same scripted seed/queue/confirm/clear/cleanup flow against the live deployment with a fresh `TEST-M14-SEED-*` transaction/flag on the same test merchant — identical results (queue listing, confirm leaving `verifiedRevenue` unchanged, clear changing it, `404`/`400`/`401` error matrix), then cleaned up. See the confirmation note appended to `handoff.md`'s milestone 14 entry for the exact run details.

## Before finishing

- No secrets committed — `.env` untouched; `ADMIN_API_SECRET` itself only ever read from `process.env` server-side, never sent to or rendered by the client except as the literal string the admin types into the `sessionStorage`-backed prompt (which lives in the browser's session storage, not in any tracked file). Only `app/admin/page.tsx` (new), `app/api/admin/fraud-queue/route.ts` (new), `app/api/admin/fraud-flags/[id]/override/route.ts` (new), and this doc set changed.
