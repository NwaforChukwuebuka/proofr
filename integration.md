# Milestone 9 — Integration Notes (Fraud flags surfaced on dashboard)

Reflects current state as of this milestone. Overwrites milestone 7's `integration.md` per `handoff.md`'s convention — that milestone's history now lives in `handoff.md` only.

## Data access approach chosen

**Direct RLS-scoped client-side read, same pattern milestone 7 used for `merchants`** — no new API route. `app/dashboard/page.tsx`'s `fetchFlags` queries `fraud_flags` with an embedded `transactions` relation in one call, since the dashboard needs transaction context (amount, payer, date) alongside each flag:

```ts
supabase
  .from("fraud_flags")
  .select(
    "id, rule_type, severity, status, created_at, transactions!inner(id, amount, payer_name, payer_account, created_at)"
  )
  .eq("transactions.merchant_id", merchantId)
  .order("created_at", { ascending: false })
  .limit(50);
```

`transactions!inner(...)` embeds via the existing `fraud_flags.transaction_id → transactions.id` FK; the `!inner` hint is required for PostgREST to accept the `.eq("transactions.merchant_id", ...)` embedded-table filter. `fraud_flags_select_own` RLS (`data-model.md`) already scopes results to the signed-in merchant's own rows via the `transactions → merchants` join, so the explicit `merchant_id` filter is defense-in-depth, not the only thing gating access. A server-side route was considered (per milestone 8's seam note, which left the choice open) but wasn't needed — no formatting/joining happens here that PostgREST's embedded-resource syntax can't already express in one round trip.

## Endpoints / tables called

- **Direct RLS-scoped read of `fraud_flags` embedding `transactions`** (`app/dashboard/page.tsx`'s `fetchFlags`, shown above). Called on initial dashboard load (parallel with the existing `GET .../revenue` call) and re-called from two realtime handlers (below).
- **`GET /api/merchants/:id/revenue`** (unchanged from milestones 6/8) — still the source of `grossInflow`/`verifiedRevenue`; no route changes this milestone.
- **Realtime subscription on `transactions`** (existing, milestone 7) — its INSERT handler now also calls `fetchFlags`, not just `fetchRevenue`.
- **New realtime subscription on `fraud_flags`** (`app/dashboard/page.tsx`, new `useEffect`): `supabase.channel(\`fraud-flags-merchant-${merchant.id}\`).on("postgres_changes", { event: "INSERT", schema: "public", table: "fraud_flags" }, handler).subscribe()`. No client-side filter is possible here — `fraud_flags` has no `merchant_id` column, only `transaction_id` — so the channel is unfiltered and relies entirely on `fraud_flags_select_own` RLS to scope which INSERT events the signed-in merchant's session actually receives. On event, re-calls both `fetchFlags` and `fetchRevenue` (verifiedRevenue changes the moment a flag opens).

## Why two realtime subscriptions instead of reusing the one from milestone 7

`lib/fraud.ts`'s `runFraudChecks` (milestone 8) writes `fraud_flags` rows **after** the `transactions` insert, moments later in the same webhook request — so relying solely on the existing `transactions` INSERT event to trigger a flags re-fetch races the flag write. This was not a hypothetical concern: it reproduced live in testing (see below). A dedicated `fraud_flags` INSERT subscription closes that race, matching the pattern milestone 7 established for `transactions` itself.

## Mismatch found vs. docs — required a manual migration, now resolved

**Same class of gap milestone 7 hit with `transactions`**: Supabase Realtime's `postgres_changes` only streams tables added to the `supabase_realtime` publication, and `fraud_flags` was never added (nothing subscribed to it before this milestone). Added `supabase/migrations/0005_realtime_fraud_flags.sql` (`alter publication supabase_realtime add table fraud_flags;`).

**This agent's sandboxed environment could not apply it directly** — same confirmed limitation as milestones 6–8's `0002`/`0003`/`0004`: raw Postgres (`db.<ref>.supabase.co:5432`) fails DNS resolution in this environment even though HTTPS to the same project's REST/Auth API works fine. **The user applied the migration manually against the live Supabase project mid-milestone**, and it was re-verified live immediately afterward (see test notes below) — realtime now correctly delivers `fraud_flags` INSERT events.

## Client-side assumptions

- **Flags list re-fetched in full on every relevant event**, not incrementally patched — same reasoning as milestone 7's revenue re-fetch: current transaction/flag volume per merchant is low enough that a full re-query is simpler and correct.
- **`fraud_flags` channel is unfiltered** (no `filter:` option, unlike the `transactions` channel) since there's no `merchant_id` column to filter on client-side; correctness depends entirely on RLS scoping which rows the session receives. Confirmed working in testing — a signed-in merchant only ever saw their own fixture's flags.
- **Only `status: "open"` flags render as active/concerning.** `status: "overridden"` flags are shown in a separate, visually muted "Cleared" section at reduced opacity below the open list — not omitted, not mixed in as equally urgent, matching the milestone's explicit instruction. No override action exists in this UI (milestone 14's job).
- **`rule_type` is translated to a plain-language label** client-side (`RULE_LABELS` in `app/dashboard/fraud-flags.tsx`) rather than shown as the raw enum string, per `fraud-rules.md`'s four rule types.
- **Gross/verified gap note**: when `grossInflow > verifiedRevenue`, a small red note ("₦X excluded due to flagged activity") renders under the revenue totals — computed client-side from the existing revenue response, no new field needed.
- **Fraud flags card renders nothing at all if there are zero flags of any status** — kept the clean-dashboard case clean rather than adding a "no flags" placeholder, matching the milestone's "not a full fraud-management UI" scope note.

## Manual test notes

Ran a small Node/Playwright harness (not committed — temporary scratch scripts, deleted after the run) against the local Next dev server (`next dev`), wired to the **live** Supabase project via the real `.env` — same approach milestone 7 used, since real Monnify sandbox payments can't be made to trigger fraud rules on demand.

1. **Seeded a disposable fixture merchant** (`TEST-M9-SEED Fixture Merchant`, approval_status set directly to `approved` via the service-role client — skipped the real Monnify approve call since a virtual account number isn't needed to view fraud flags; the dashboard's "still being issued" branch handles a null account number gracefully) with:
   - One clean transaction (₦15,000, no flag).
   - One high-severity open flag (`self_funding`, ₦50,000).
   - One medium-severity open flag (`velocity_spike`, ₦8,000).
   - One overridden flag (`identical_transfers`, ₦3,000), to confirm the "Cleared" section renders distinctly.
   All transactions/flags marked via `TEST-M9-SEED-*` `monnify_reference` prefixes and `{"test": true}` `raw_payload`, per the project's established seeding convention.
2. Logged in as the fixture merchant and loaded `/dashboard`: rendered correctly —
   - `Verified revenue ₦18,000` / `Gross inflow: ₦76,000` / `₦58,000 excluded due to flagged activity`.
   - Fraud flags card: "2 open" badge, "Possible self-funding" (High, red badge) and "Unusual transaction volume spike" (Medium, amber badge), each showing amount/payer/date.
   - "Cleared" section below, muted/reduced-opacity, showing "Repeated identical transfers · ₦3,000" with a grey "Cleared" pill — visually distinct from the open flags, not mixed in.
   - Screenshot confirms the Moniepoint-style theme (brand-blue background, white rounded cards, pill buttons/badges) is preserved.
3. **Realtime — first attempt exposed the exact race described above**: with the dashboard open, inserted a new transaction (₦42,000) then, ~150ms later (simulating the webhook's real sequence), its `circular_transfer` flag. The existing `transactions` INSERT handler fired and updated `grossInflow` correctly, but the flags list did **not** update within 20s — `fraud_flags` wasn't yet in the `supabase_realtime` publication, so no dedicated event ever arrived to catch the flag that landed just after the transaction event fired. A manual page reload immediately showed the correct, fully-updated state (3 open flags, correct exclusion math) — isolating the issue to realtime delivery, not the underlying query/data.
4. **After the user applied `0005_realtime_fraud_flags.sql`**, repeated the exact same live-fire test with a fresh, uniquely-marked transaction+flag: the new "Circular transfer pattern" entry appeared in the DOM **1175ms** after the flag insert, with **no manual refresh**, and the "New payment" badge fired too. Re-run once more for certainty (avoiding a false-positive match against the first test's identically-named payer) — same result, ~1.2s.
5. No unexpected browser console errors during any step.
6. **Cleaned up all test data**: deleted the fixture merchant's `fraud_flags`, `transactions`, `merchants` row, and its `auth.users` row via the service-role client. Confirmed `fraud_flags` query for that merchant id returns `[]` and `/api/health`'s `merchants_count` returned to its pre-seed value (6) afterward.

**Milestone's "done-when" is confirmed working end-to-end, live**: an open fraud flag on a real transaction renders clearly distinguishable from clean activity (severity-coded, plain-language rule label, gross-vs-verified gap explained), overridden flags are visually separated rather than conflated with open ones, and a flag written moments after its transaction lands updates the dashboard live without a manual refresh.

**Verified against the local dev server wired to the live Supabase project, same as milestone 7's precedent** — this agent's environment reaches the same live Supabase backend either way; a literal pass against `https://proofr.onrender.com` was performed separately after this milestone's commit was pushed (see `handoff.md` for the deployed-URL confirmation, if performed).

## Before finishing

- No API keys or secrets were committed — `.env` remains gitignored; only `supabase/migrations/0005_realtime_fraud_flags.sql` (schema-only, no secrets), `app/dashboard/fraud-flags.tsx`, and the `app/dashboard/page.tsx` diff are new/changed.
