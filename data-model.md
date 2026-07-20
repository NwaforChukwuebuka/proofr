# PROOFR — Data Model (Supabase / Postgres)

Supports [plan.md](plan.md) milestones 1–17. All tables use `uuid` primary keys (`gen_random_uuid()`) and `created_at timestamptz default now()` unless noted.

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
| `created_at`, `approved_at` | timestamptz | |

## Row-Level Security (RLS)

- **Merchants**: can only `select`/`update` rows where `merchants.auth_user_id = auth.uid()`; same scoping cascades to their own `transactions`, `fraud_flags`, `reports`.
- **Lenders**: can `select` any `merchants`/`reports` row (search is core to the product) but cannot `update`/`delete` merchant data; can `insert`/`update` only their own `loans` rows.
- **Admin**: bypasses RLS via `SUPABASE_SERVICE_ROLE_KEY` in server-side API routes only — no client-side admin key exposure.
