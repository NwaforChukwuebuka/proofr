# PROOFR — Data Model (Supabase / Postgres)

Supports [plan.md](plan.md) milestones 1–23. All tables use `uuid` primary keys (`gen_random_uuid()`) and `created_at timestamptz default now()` unless noted.

## `merchants`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `auth_user_id` | uuid, FK → `auth.users.id` | Supabase Auth link |
| `business_name` | text | |
| `phone` / `email` | text | Signup contact |
| `bvn_nin_verified` | boolean | Set after KYC check |
| `kyc_reference` | text, nullable | External verification reference |
| `approval_status` | text | `pending` \| `approved` \| `rejected` |
| `monnify_account_number` | text, nullable | Set at milestone 4 |
| `monnify_account_reference` | text, nullable | Monnify's internal reference |
| `personal_account_number` | text, nullable | Milestone 17. Optional, captured at signup. Activates `lib/fraud.ts`'s `self_funding` rule (previously always inert — see [fraud-rules.md](fraud-rules.md)) |
| `business_started_at` | date, nullable | Milestone 17. Self-reported, unverified business age — distinct from `created_at` (platform tenure). See [credit-intelligence-engine.md](credit-intelligence-engine.md) |
| `public_api_consent_at` | timestamptz, nullable | Milestone 23. `null` by default for every merchant (including everyone who existed before this column) — set only via the merchant's own explicit `POST /api/merchants/:id/public-api-consent`. Gates `GET /api/public/score` (milestone 22) |
| `created_at`, `updated_at` | timestamptz | |

## `transactions`

Insert-only / immutable — never updated after webhook ingestion (milestone 5).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `merchant_id` | uuid, FK → `merchants.id` | |
| `monnify_reference` | text, unique | Idempotency key for webhook retries |
| `amount` | numeric | |
| `payer_name` / `payer_account` | text | From webhook payload |
| `raw_payload` | jsonb | Full webhook body, for audit/debug |
| `created_at` | timestamptz | |

## `fraud_flags`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `transaction_id` | uuid, FK → `transactions.id` | |
| `rule_type` | text | `circular_transfer` \| `self_funding` \| `identical_transfers` \| `velocity_spike` — see [fraud-rules.md](fraud-rules.md) |
| `severity` | text | `low` \| `medium` \| `high` |
| `status` | text | `open` \| `overridden` |
| `reviewed_by` | uuid, nullable, FK → `auth.users.id` | Admin who overrode it |
| `created_at`, `reviewed_at` | timestamptz | |

## `reports`

Snapshot record, not live-computed on every view (regenerated on demand, milestone 10).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `merchant_id` | uuid, FK → `merchants.id` | |
| `revenue_summary` | jsonb | Gross inflow, verified revenue |
| `trend_data` | jsonb | Daily/monthly series |
| `confidence_score` | numeric | Penalized by open fraud flags — see [fraud-rules.md](fraud-rules.md) |
| `credit_score` | numeric, nullable | Milestone 17. Repayment-likelihood signal — see [credit-intelligence-engine.md](credit-intelligence-engine.md). Distinct from and not derived by replacing `confidence_score` |
| `credit_score_breakdown` | jsonb, nullable | Milestone 17. Named component contributions to `credit_score` |
| `recommended_loan_amount` | numeric, nullable | Milestone 19. Naira figure derived from verified revenue + `credit_score` — see [credit-intelligence-engine.md](credit-intelligence-engine.md). Additive alongside the two scores above, not a replacement |
| `loan_recommendation_breakdown` | jsonb, nullable | Milestone 19. Component figures + plain-language rationale for `recommended_loan_amount` |
| `fraud_flags_snapshot` | jsonb | Flags at time of generation |
| `generated_at` | timestamptz | |

## `lenders`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `auth_user_id` | uuid, FK → `auth.users.id` | |
| `org_name` | text | |
| `created_at` | timestamptz | |

## `loans`

Supports plan.md milestones 13 and 15 (mock approval + simulated repayment).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `merchant_id` | uuid, FK → `merchants.id` | |
| `lender_id` | uuid, FK → `lenders.id` | |
| `amount` | numeric | |
| `status` | text | `pending` \| `approved` \| `repaying` \| `repaid` |
| `mock_repayment_schedule` | jsonb | Simulated deduction plan, not real disbursement |
| `interest_rate` | numeric, nullable | Milestone 20. Flat rate chosen at approval by `lib/loanTerms.ts`'s credit-score tier — see [credit-intelligence-engine.md](credit-intelligence-engine.md) |
| `term_months` | integer, nullable | Milestone 20. Term length chosen the same way |
| `credit_score_at_approval` | numeric, nullable | Milestone 21. Snapshot of `credit_score` at the moment this loan was approved — for future outcome recalibration, see [credit-intelligence-engine.md](credit-intelligence-engine.md) |
| `recommended_loan_amount_at_approval` | numeric, nullable | Milestone 21. Same snapshot idea, for `recommended_loan_amount` |
| `created_at`, `approved_at` | timestamptz | |

## `api_clients`

Milestone 22. Third-party platforms (not PROOFR lenders) granted API-key access to `GET /api/public/score` — see [credit-intelligence-engine.md](credit-intelligence-engine.md)'s "Phase 4" section. Provisioned manually via `scripts/provision-api-client.ts`, no public signup.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `name` | text | Platform name |
| `api_key_hash` | text, unique | SHA-256 hash of the raw key — the raw key itself is never stored |
| `created_at` | timestamptz | |
| `revoked_at` | timestamptz, nullable | Set to revoke access; `null` = active |

## `api_access_log`

Milestone 22. Records every `GET /api/public/score` query, found or not — the only abuse-detection mechanism until real rate-limiting is built.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `api_client_id` | uuid, FK → `api_clients.id` | |
| `queried_phone` | text | |
| `merchant_id` | uuid, nullable, FK → `merchants.id` | `null` if no matching approved merchant |
| `response_status` | integer | HTTP status returned |
| `created_at` | timestamptz | |

## Row-Level Security (RLS)

- **Merchants**: can only `select`/`update` rows where `merchants.auth_user_id = auth.uid()`; same scoping cascades to their own `transactions`, `fraud_flags`, `reports`.
- **Lenders**: can `select` any `merchants`/`reports` row (search is core to the product) but cannot `update`/`delete` merchant data; can `insert`/`update` only their own `loans` rows.
- **Admin**: bypasses RLS via `SUPABASE_SERVICE_ROLE_KEY` in server-side API routes only — no client-side admin key exposure.
- **`api_clients`/`api_access_log`**: RLS enabled, no policies defined (deny-all default) — only ever touched by server code via the service-role client, never by an anon/authenticated Supabase session. Milestone 22.
