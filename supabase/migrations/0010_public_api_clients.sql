-- Milestone 22: public credit-lookup API (Phase 4 — portable, cross-platform
-- identity). api_clients are third-party platforms (not PROOFR lenders)
-- granted API-key access to GET /api/public/score. Provisioned manually via
-- scripts/provision-api-client.ts — no public self-serve signup, same
-- posture milestone 12 established for lenders. api_key_hash is a SHA-256
-- hash of the raw key; the raw key is shown to the operator exactly once at
-- provisioning time and never stored.
--
-- api_access_log records every query (found/not-found/unauthorized) since
-- no rate-limiting exists yet — this is the only abuse-detection mechanism
-- until real rate-limiting is built (see credit-intelligence-engine.md's
-- "Phase 4" section for what's explicitly still open).
--
-- Neither table has any RLS policy defined (RLS is enabled, so the default
-- is deny-all) — both are only ever touched by server code using the
-- service-role client, never by an anon/authenticated Supabase session.

create table api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  api_key_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table api_access_log (
  id uuid primary key default gen_random_uuid(),
  api_client_id uuid references api_clients(id),
  queried_phone text,
  merchant_id uuid references merchants(id),
  response_status integer not null,
  created_at timestamptz not null default now()
);

create index idx_api_access_log_client_created on api_access_log (api_client_id, created_at);

alter table api_clients enable row level security;
alter table api_access_log enable row level security;
