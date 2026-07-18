# Build prompt — Milestone 1: Project scaffold & deploy

Paste this whole prompt to the coding agent to execute M1.

---

You are building PROOFR, a Proof-of-Revenue platform, for a 2-day hackathon. This is a real product build, not throwaway demo code — treat it with normal engineering standards.

Read these files in the project root first, in this order, to get full context:
1. `PROOFR_MVP_PRD.md` — product requirements
2. `plan.md` — the full milestone list (you are implementing milestone 1 only)
3. `architecture.md` — system design and why key stack decisions were made
4. `data-model.md` — the Supabase schema you need to create

## Your task: Milestone 1 — Project scaffold & deploy

Set up the foundational app and get it deployed so later milestones (starting with Monnify webhook wiring) have a stable public URL to build against.

### Scope

1. **Next.js app**
   - Initialize a Next.js (App Router) project with TypeScript, in the project root (don't nest it in a subfolder unless one doesn't already exist for the app).
   - Configure it as an installable PWA: web manifest, icons (placeholder is fine), service worker registration (`next-pwa` or equivalent). Mobile-first is a stated PRD requirement.
   - Set up a `.env.local.example` file listing every env var from `architecture.md`'s table (`MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, `MONNIFY_CONTRACT_CODE`, `MONNIFY_WEBHOOK_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) with empty/placeholder values — do not commit real secrets.
   - Add a Supabase client helper (`lib/supabase.ts` or similar): one client for browser/RLS-scoped use (anon key) and one for server-only use (service role key), matching the split described in `data-model.md`'s RLS section.

2. **Supabase schema**
   - Write a SQL migration (e.g. `supabase/migrations/0001_init.sql`) creating all six tables from `data-model.md`: `merchants`, `transactions`, `fraud_flags`, `reports`, `lenders`, `loans` — exact columns/types as specified there.
   - Include the RLS policies described in `data-model.md`'s RLS section (merchants scoped to their own `auth_user_id`, lenders can read all merchants/reports but not write them, admin via service role only).
   - Do not create tables or columns beyond what `data-model.md` specifies — no speculative fields.

3. **Deploy**
   - Get the app deployed to Vercel under a real project (ask me for confirmation before running any Vercel CLI command that creates or links a project, since that touches an external account).
   - Confirm the deployed URL loads and that a basic Supabase query (e.g. a health-check route) succeeds against the live Supabase project.

### Explicitly out of scope for this milestone

Do not build merchant signup, KYC, Monnify account issuance, webhooks, dashboards, or any other milestone from `plan.md` — those are milestones 2+. If you find yourself writing UI beyond a placeholder home page, stop — that belongs to milestone 3.

### Done-when (from plan.md)

The app is live on a Vercel URL with a working Supabase connection — i.e., the deployed site loads, and a page or API route on that live URL can successfully read/write to the real Supabase project.

### Before you finish

- Double check no real API keys or secrets got committed (only `.env.local.example` with placeholders should be tracked).
- Report back: the Vercel URL, the Supabase project ref, and confirmation the health-check query worked against the deployed (not just local) app.
