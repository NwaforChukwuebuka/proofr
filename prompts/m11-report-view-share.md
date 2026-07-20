# Build prompt — Milestone 11: Report view/share

Paste this whole prompt to the coding agent to execute M11.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements
2. `plan.md` — the full milestone list (you are implementing milestone 11 only)
3. `userflows.md` — merchant flow steps 11–12, which this milestone implements ("merchant generates Proof-of-Revenue report" / "merchant shares report with a lender")
4. `fraud-rules.md` — so flag `rule_type`s can be labeled meaningfully, same as milestone 9 did on the dashboard
5. `data-model.md` — the `reports` shape, for context on what's a live-read field (`profile`/`verificationStatus`) vs. a stored snapshot field
6. `api.md` — as-built API reference; read the **milestone 10 entry in full**, it's the two routes this page is built entirely around
7. `handoff.md` — read all ten milestone entries, especially **milestone 10's seams for milestone 11** (the fraud-flag label-formatting reuse note, and the report-sharing auth caveat you must surface to the user) and milestone 9's fraud-flag labeling approach you're likely reusing

Milestones 1–10 already delivered: `POST /api/merchants/:id/report` (merchant-only, generates a snapshot) and `GET /api/merchants/:id/report` (two auth paths — owning merchant/lender bearer token for the latest report, or **no auth at all** via `?reportId=<uuid>`, since knowledge of the unguessable UUID is treated as the share credential today, per milestone 10's documented placeholder). The response shape includes `profile`, `verificationStatus`, `revenueSummary`, `trendData`, `confidenceScore`, and `fraudFlags` (raw flag rows — `rule_type`/`severity`/`status`/`payer_account`/`amount`/`transaction_id`/`created_at` — **not** the plain-language labels milestone 9 already built for the dashboard's `app/dashboard/fraud-flags.tsx`). The merchant dashboard (`app/dashboard/page.tsx`) and its session handling (`app/login/page.tsx`, `getBrowserSupabaseClient()`) are already live.

Read every image in `ui-inspirations-theme/` before writing any component — per `handoff.md`'s standing convention, this is the visual spec (Moniepoint-style Nigerian fintech look), not optional trim. Match the palette already established in `app/globals.css`.

## Your task: Milestone 11 — Report view/share

Build the merchant-facing report page and a shareable link/download.

### Scope

1. **Generate + view flow**
   - From the dashboard (or a new entry point on it — your call), let the merchant trigger `POST /api/merchants/:id/report` to generate a fresh snapshot, then navigate to a report view page (e.g. `app/report/[id]/page.tsx` or `app/dashboard/report/page.tsx`) that calls `GET /api/merchants/:id/report` (latest, via the merchant's bearer token) to render it.
   - Render all of the response: business profile + verification status, revenue summary (gross vs. verified — reuse the "excluded due to flagged activity" framing pattern milestone 9 already established for the same numbers), trend, confidence score (make this prominent — it's the headline number a lender will look at), and fraud flags.
   - For fraud flags: reuse or extract milestone 9's plain-language `rule_type` labeling logic from `app/dashboard/fraud-flags.tsx` rather than reimplementing it — per milestone 10's handoff note, this route deliberately returns raw rows so the display-formatting stays a frontend concern, and that formatting already exists.

2. **Shareable link**
   - Build a share link using `GET /api/merchants/:id/report?reportId=<uuid>` (the report's own id, not the merchant id, is what makes it fetchable without the merchant's auth). A simple "Copy share link" affordance is enough — no email/SMS delivery mechanism needed.
   - **Surface the real limitation to the merchant**, per milestone 10's explicit ask: this link is not expiring, scoped, or revocable today — anyone with the URL can view the report indefinitely. A brief, honest inline note (e.g. "Anyone with this link can view this report — links don't expire yet") is the right amount of transparency here; don't build the real signed/expiring-token mechanism milestone 10 sketched as a "real implementation would need" — that's a scope call for a later pass if there's time, not this milestone's job, and `plan.md`'s milestone 11 done-when doesn't require it.
   - The share link should render the report in a way that works for an unauthenticated viewer (a lender clicking the link isn't signed in) — build the report view component so it doesn't assume a logged-in session when rendering via the `?reportId=` path; only the "generate new report" action requires the merchant's own session.

3. **Download**
   - `plan.md`/`userflows.md` call for a "download" option alongside the share link. A browser print-to-PDF affordance (a "Download / Print" button calling `window.print()` with print-friendly CSS) is a reasonable, fast way to satisfy this within the hackathon timeline — building a server-side PDF generator is not required and would be disproportionate scope for this milestone. If you take this approach, make sure the printed layout is actually legible (hide nav/buttons in a `@media print` block, keep the report content readable), don't just ship the on-screen layout unchanged and call it done.

### Explicitly out of scope for this milestone

Do not build the lender portal — milestone 12/13 (though this milestone's unauthenticated report view is exactly what a lender will land on via a shared link, so keep that path working standalone). Do not build a real signed/expiring share-token mechanism — noted above, that's a stretch beyond this milestone's done-when. Do not build the admin override flow.

### Done-when (from plan.md)

A generated report renders correctly and is shareable — i.e. a merchant can generate a report from the deployed Render URL, view it fully rendered, copy a share link, and that same link opens the identical report correctly in a fresh, unauthenticated browser session (e.g. a private/incognito window).

### Before you finish

- Per this project's standing rule, manually test in a real browser against the deployed Render URL: generate a report for a merchant with real revenue/flag data (seed test flags if needed, following the `TEST-M11-SEED-*`-style convention, cleaned up after), view it, copy the share link, then open that link in a fresh private/incognito window (no session) and confirm it renders identically. Also test the download/print path.
- Drop an `integration.md` per `handoff.md`'s convention: which endpoints were called and how, any mismatch found vs. `api.md`, client-side assumptions, and manual test notes including the incognito share-link test.
- Add a one-line pointer to that `integration.md` in `handoff.md`'s milestone 11 entry.
- Double check no real API keys or secrets got committed.
- Report back: the deployed URL/path to try the flow, and confirmation the share link was actually tested working from an unauthenticated browser session (not just implemented).
