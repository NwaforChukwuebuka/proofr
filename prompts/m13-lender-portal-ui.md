# Build prompt — Milestone 13: Lender portal UI

Paste this whole prompt to the coding agent to execute M13.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements
2. `plan.md` — the full milestone list (you are implementing milestone 13 only)
3. `userflows.md` — the lender flow, steps 1–5, which this milestone implements (login → search → view score/revenue → download report → approve mock loan)
4. `data-model.md` — `lenders`/`loans` shapes, for context on what a search result and a loan actually contain
5. `api.md` — as-built API reference; read the **milestone 12 entry in full** — every route this UI is built against
6. `handoff.md` — read all twelve milestone entries, especially **milestone 12's seams for milestone 13** (the test lender credentials, the `confidenceScore: null` UI state, and the "rough placeholder" framing for `mockRepaymentSchedule`), and milestone 11's note that the report page's unauthenticated share-link view is already the right thing to link to from search results

Milestones 1–12 already delivered: `GET /api/lenders/search?query=`, `GET /api/lenders/merchants/:id` (identical shape to `GET /api/merchants/:id/report`), `POST /api/loans`, `POST /api/loans/:id/approve` — all lender-bearer-token-gated using the same `supabase.auth.signInWithPassword` mechanism merchants already use (`app/login/page.tsx`). A real test lender was provisioned directly against Supabase (not via a public signup route — none exists in the frozen contract): email `lender-demo@proofr.test`, org name "Demo Capital Partners", `lenders.id` `0fabf7ef-8014-43ca-bfd0-3743b8e434cb`. **The password was reported to the user out-of-band and is not in this repo or in `handoff.md`** — ask the user for it before starting, or re-provision a fresh lender the same way (a Supabase Auth user + matching `lenders` row) if it's unavailable. The report view page (`app/report/[id]/page.tsx`, milestone 11) already renders correctly for an unauthenticated viewer via `?reportId=<uuid>` — that's the exact page a lender should land on to view a merchant's report, not a page to rebuild.

Read every image in `ui-inspirations-theme/` before writing any component — per `handoff.md`'s standing convention, this is the visual spec (Moniepoint-style Nigerian fintech look), not optional trim. Match the palette already established in `app/globals.css`. Milestone 3's login page already exists for merchants — decide whether lenders share it (with a role branch after sign-in) or get a distinct entry point; either is reasonable, just be consistent and don't duplicate the sign-in form logic wholesale.

## Your task: Milestone 13 — Lender portal UI

Search, merchant summary view, report download, and a mock loan approval action, per `userflows.md`'s lender flow and the Investor Demo Flow's step 7 ("lender approves mock loan").

### Scope

1. **Lender login**
   - Reuse the existing `supabase.auth.signInWithPassword` mechanism (same as merchant login) — no new auth pattern needed. After sign-in, distinguish a lender session from a merchant session (e.g. check for a `lenders` row matching the signed-in user, same check the backend routes already do) and route to a lender-specific landing page (e.g. `app/lender/page.tsx`) rather than the merchant dashboard.

2. **Search** — userflows.md step 2
   - A search input calling `GET /api/lenders/search?query=`, rendering `businessName` and `confidenceScore` per result.
   - Handle the `confidenceScore: null` case explicitly with a distinct "not yet scored" state, per milestone 12's handoff note — don't render it as `0` or leave it blank.

3. **Merchant summary view + report** — userflows.md steps 3–4
   - Clicking a search result should show the merchant's score/revenue summary (from `GET /api/lenders/merchants/:id`, same shape as a report) and link straight to the existing report page (`/report/:merchantId?reportId=<uuid>` — the `reportId` comes from this same response, per milestone 11's addition) for the full view/download experience, rather than building a second report renderer. This satisfies "report download" too, since that page already has the print/download affordance from milestone 11.
   - If a merchant has no report yet (search returned `confidenceScore: null`), decide how the summary view communicates that clearly rather than erroring or showing a broken report link.

4. **Mock loan approval** — userflows.md step 5, Investor Demo Flow step 7
   - From the merchant summary view, a simple form/action to call `POST /api/loans` (`merchantId`, an amount input) followed by `POST /api/loans/:id/approve` — whether this is a single "approve loan" action that does both calls in sequence, or a two-step pending→approve flow mirroring the API shape, is your call; either is a reasonable interpretation of "approve a mock loan" for this milestone.
   - Render the resulting `mockRepaymentSchedule`, but per milestone 12's explicit framing, present it as a rough/placeholder schedule (e.g. "estimated repayment schedule" rather than implying precision) — milestone 15 will replace the underlying computation, and the UI shouldn't oversell today's even 3-way split as real amortization logic.

### Explicitly out of scope for this milestone

Do not build the admin stub — milestone 14. Do not build real repayment-simulation UI beyond rendering what `mockRepaymentSchedule` already returns — milestone 15 owns the underlying logic and will likely revisit how it's surfaced (userflows.md's "view simulated repayment status over time," lender flow step 6, is milestone 15's territory, not this one). Do not build a lender signup flow — none exists in the frozen contract, per milestone 12's resolution of that gap.

### Done-when (from plan.md)

A lender can search → view → approve a mock loan in the browser — i.e., using the real test lender account against the deployed Render URL, a lender can log in, search for a real merchant with a generated report, view their summary/report, and approve a mock loan, all through the UI.

### Before you finish

- Per this project's standing rule, manually test the full flow in a real browser against the deployed Render URL: lender login, search (including a merchant with `confidenceScore: null` and one with a real score), view summary, view/download the full report, and approve a mock loan end-to-end. Seed whatever test merchant/transaction/report data is needed, following the `TEST-M13-SEED-*` convention, cleaned up after.
- Confirm a merchant's own session cannot access the lender landing page/search (or if it technically can per the backend's merchant-or-lender routes, that the UI doesn't present lender-only actions like loan approval to a non-lender).
- Drop an `integration.md` per `handoff.md`'s convention: which endpoints were called and how, any mismatch found vs. `api.md`, client-side assumptions, and manual test notes including the live loan-approval test.
- Add a one-line pointer to that `integration.md` in `handoff.md`'s milestone 13 entry.
- Double check no real API keys, secrets, or the test lender's password got committed anywhere.
- Report back: the deployed URL/path to try the lender flow, and confirmation a real mock loan was approved end-to-end through the UI (not just implemented).
