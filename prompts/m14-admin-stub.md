# Build prompt — Milestone 14: Admin stub

Paste this whole prompt to the coding agent to execute M14.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements
2. `plan.md` — the full milestone list (you are implementing milestone 14 only — this one is tagged `(Both)`, backend and frontend together)
3. `userflows.md` — the admin flow (stub), which this milestone implements: login → view fraud queue → inspect a flagged transaction → override
4. `data-model.md` — the `fraud_flags` table shape, specifically `status` (`open` | `overridden` — **only two values**), `reviewed_by`, `reviewed_at`
5. `api-contracts.md` — the frozen `GET /api/admin/fraud-queue` and `POST /api/admin/fraud-flags/:id/override` contracts (note the request body's `action: "clear" | "confirm"` against a schema that only has two `status` values — see the design decision below)
6. `api.md` — as-built API reference; read the milestone 8/10 entries on `fraud_flags`/`verifiedRevenue`/confidence score, since overriding a flag here is meant to visibly change those numbers elsewhere in the app
7. `handoff.md` — read all thirteen milestone entries. **Milestone 2's entry says "`ADMIN_API_SECRET`... not real admin auth (milestone 14 replaces it)."** Read that expectation critically against what's actually spec'd below — there is no `admins` table anywhere in `data-model.md`, no admin signup/login route anywhere in `api-contracts.md`, and `architecture.md` states admin access is meant to go through `SUPABASE_SERVICE_ROLE_KEY`-backed server routes, not a Supabase Auth role. "Replaces it" cannot mean "build a full admin identity system" — nothing in the spec supports that, and milestone 12 already resolved an analogous gap (no lender signup route existed) by *not* inventing one. Resolve this the same way here: decide honestly, document it, and don't over-build.

Milestones 1–13 already delivered: the fraud engine (`lib/fraud.ts`) writes real `fraud_flags` rows; the merchant dashboard (`app/dashboard/fraud-flags.tsx`) and reports (`GET /api/merchants/:id/report`, `lib/confidence.ts`) already correctly react to a flag's `status` — an `overridden` flag stops excluding its transaction from `verifiedRevenue` and stops contributing to the confidence-score penalty, confirmed multiple times via direct Supabase updates in milestones 8/10 since no override route existed yet. `ADMIN_API_SECRET` already gates `POST /api/merchants/:id/approve` via an `x-admin-secret` header.

## Your task: Milestone 14 — Admin stub

A minimal, auth-gated admin page: fraud queue list + manual override action, backed by a small API route. Explicitly **not** full CRUD/audit-log UI.

### Scope

1. **Resolve the admin-auth question, and don't over-build it**
   - Given the absence of any `admins` table or signup/login route in the frozen spec, the pragmatic and consistent choice is to **keep `ADMIN_API_SECRET` as the real security boundary** — the same shared-secret gate milestone 2 already established for `POST /api/merchants/:id/approve` — rather than inventing a new Supabase Auth admin role that nothing else in the schema supports. This is a documented, deliberate scope decision (matching how milestone 12 resolved the analogous missing-lender-signup gap), not a shortcut taken by accident. State this plainly in your handoff entry so it doesn't get silently reinterpreted as a real gap later.
   - The admin page should still *feel* auth-gated to a human, even though the mechanism is a shared secret, not a session: a simple "enter admin secret" prompt on first load, stored client-side only for the duration of the session (e.g. `sessionStorage`, not `localStorage` or a cookie) and sent as `x-admin-secret` on every fraud-queue/override call. Don't build a login form that pretends this is a real identity system (no email/password, no "remember me").
   - `fraud_flags.reviewed_by` is a nullable FK to `auth.users.id` — since there's no real admin Supabase Auth user to attribute a review to under this scheme, leave it `null` on override. Note this plainly rather than fabricating an identity for it.

2. **`GET /api/admin/fraud-queue`** per `api-contracts.md`
   - Auth: `x-admin-secret` header, same pattern as the approve route.
   - List **open** flags only (a "queue" implies unresolved work) joined to their `transactions` (for `transactionId`) and `merchants` (for `merchantId`) — response: `[{ flagId, transactionId, merchantId, ruleType, severity, createdAt }]` per the frozen contract.

3. **`POST /api/admin/fraud-flags/:id/override`** per `api-contracts.md`
   - Auth: same `x-admin-secret` gate.
   - Request: `{ action: "clear" | "confirm" }`. **Resolve the schema mismatch**: `fraud_flags.status` only supports `open`/`overridden`, but the contract implies two distinct admin actions. The sensible reading, given `fraud-rules.md`'s framing (overridden flags don't count against the score — i.e., overriding means "this flag was wrong/resolved, don't penalize for it") is: `"clear"` sets `status: "overridden"` (admin determined the flag was a false positive or has been resolved — this is what actually changes `verifiedRevenue`/confidence score) and `"confirm"` leaves `status: "open"` but sets `reviewed_at` (admin looked at it and agrees it's real fraud — no change to scoring, just marks it as reviewed so it doesn't sit ambiguously in the queue as "never looked at"). Implement this distinction, and state it explicitly in your handoff entry since the frozen contract's own response example only shows the `"overridden"` case and doesn't spell out what `"confirm"` should return — decide and document what `"confirm"`'s response looks like too (still `{ flagId, status: "open" }` seems most honest, even though it diverges from the contract's single example).
   - Response and errors otherwise per `api-contracts.md`.

4. **Admin page** (e.g. `app/admin/page.tsx`)
   - Read every image in `ui-inspirations-theme/` before writing any component — per `handoff.md`'s standing convention (this milestone is explicitly listed as one of the frontend milestones bound by it), match the established palette/style, but keep the UI genuinely minimal per this milestone's explicit "not full CRUD/audit-log UI" scope note — a flat list with clear/confirm buttons is enough, no filtering/sorting/pagination/bulk actions.
   - List the fraud queue (plain-language rule labels — reuse `lib/fraud-labels.tsx` from milestone 9/11 rather than reinventing formatting), showing enough transaction/merchant context (amount, payer, merchant business name — you'll need to fetch/join what the queue response doesn't already include, e.g. `businessName`, or extend the queue response server-side if that's simpler; your call) for an admin to make a clear/confirm decision.
   - Clear/confirm buttons calling the override route; after a successful override, remove the flag from the visible open queue (it either resolved to `overridden` and drops out of "open," or stays `open` but reviewed — decide how you distinguish a "confirmed but still open" flag in the list so it doesn't look identical to an unreviewed one).

### Explicitly out of scope for this milestone

Do not build a real admin identity/login system — resolved above. Do not build full CRUD over `fraud_flags`/`transactions`/anything else, an audit log view, filtering, or bulk actions — the plan is explicit that this is a stub. Do not touch the lender or merchant flows beyond what naturally follows from a flag's `status` changing (which already works, per milestones 8/10's existing behavior).

### Done-when (from plan.md)

An admin can view flagged transactions and clear/override a flag — i.e., using the admin secret against the deployed Render URL, the admin page lists real open flags and clearing one via the UI visibly changes that transaction's exclusion from `verifiedRevenue` on the merchant's own dashboard/report (confirm this cross-milestone effect, don't just confirm the override route returns `200`).

### Before you finish

- Per this project's standing rule, manually test in a real browser against the deployed Render URL: seed a real open flag (following the `TEST-M14-SEED-*` convention, cleaned up after), view it in the admin queue, clear it, and confirm the underlying merchant's `verifiedRevenue`/confidence score actually changes as a result (check via the dashboard or the report API, not just the override route's own response). Also test the "confirm" action's effect (or lack thereof) on scoring.
- Confirm the admin page correctly rejects/re-prompts with a wrong or missing secret.
- Drop an `integration.md` per `handoff.md`'s convention (this milestone is bound by it): endpoints called, any mismatch found (including the clear/confirm schema ambiguity you resolved), client-side assumptions (the `sessionStorage` secret handling), and manual test notes including the cross-milestone `verifiedRevenue` check.
- Add a one-line pointer to that `integration.md` in `handoff.md`'s milestone 14 entry, along with the admin-auth decision and the clear/confirm semantics you landed on.
- Double check no real API keys or secrets got committed, including `ADMIN_API_SECRET` itself.
- Report back: the deployed URL/path to try the admin flow, and confirmation that clearing a flag through the UI produced a real, observable change in `verifiedRevenue` elsewhere in the app.
