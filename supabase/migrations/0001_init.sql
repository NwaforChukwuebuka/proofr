-- PROOFR initial schema
-- See data-model.md for column reference.

create extension if not exists "pgcrypto";

-- merchants
create table merchants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id),
  business_name text not null,
  phone text,
  email text,
  bvn_nin_verified boolean not null default false,
  kyc_reference text,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  monnify_account_number text,
  monnify_account_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- transactions (insert-only / immutable, never updated after webhook ingestion)
create table transactions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  monnify_reference text not null unique,
  amount numeric not null,
  payer_name text,
  payer_account text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

-- fraud_flags
create table fraud_flags (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  rule_type text not null check (rule_type in ('circular_transfer', 'self_funding', 'identical_transfers', 'velocity_spike')),
  severity text not null check (severity in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'overridden')),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- reports (snapshot, regenerated on demand)
create table reports (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  revenue_summary jsonb,
  trend_data jsonb,
  confidence_score numeric,
  fraud_flags_snapshot jsonb,
  generated_at timestamptz not null default now()
);

-- lenders
create table lenders (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id),
  org_name text not null,
  created_at timestamptz not null default now()
);

-- loans (mock approval + simulated repayment)
create table loans (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  lender_id uuid not null references lenders(id),
  amount numeric not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'repaying', 'repaid')),
  mock_repayment_schedule jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

-- Row-Level Security
-- See data-model.md "Row-Level Security (RLS)" for the policy rationale.

alter table merchants enable row level security;
alter table transactions enable row level security;
alter table fraud_flags enable row level security;
alter table reports enable row level security;
alter table lenders enable row level security;
alter table loans enable row level security;

-- merchants: owner can select/update their own row; lenders can select any merchant row
create policy "merchants_select_own" on merchants
  for select using (auth_user_id = auth.uid());

create policy "merchants_update_own" on merchants
  for update using (auth_user_id = auth.uid());

create policy "merchants_select_by_lenders" on merchants
  for select using (exists (select 1 from lenders where lenders.auth_user_id = auth.uid()));

-- transactions: scoped to the owning merchant
create policy "transactions_select_own" on transactions
  for select using (
    exists (
      select 1 from merchants
      where merchants.id = transactions.merchant_id
      and merchants.auth_user_id = auth.uid()
    )
  );

-- fraud_flags: scoped to the owning merchant via transaction -> merchant
create policy "fraud_flags_select_own" on fraud_flags
  for select using (
    exists (
      select 1 from transactions
      join merchants on merchants.id = transactions.merchant_id
      where transactions.id = fraud_flags.transaction_id
      and merchants.auth_user_id = auth.uid()
    )
  );

-- reports: owner can select their own; lenders can select any report
create policy "reports_select_own" on reports
  for select using (
    exists (
      select 1 from merchants
      where merchants.id = reports.merchant_id
      and merchants.auth_user_id = auth.uid()
    )
  );

create policy "reports_select_by_lenders" on reports
  for select using (exists (select 1 from lenders where lenders.auth_user_id = auth.uid()));

-- lenders: owner can select/update their own row
create policy "lenders_select_own" on lenders
  for select using (auth_user_id = auth.uid());

create policy "lenders_update_own" on lenders
  for update using (auth_user_id = auth.uid());

-- loans: merchant can select their own; lender can select/insert/update their own
create policy "loans_select_by_merchant" on loans
  for select using (
    exists (
      select 1 from merchants
      where merchants.id = loans.merchant_id
      and merchants.auth_user_id = auth.uid()
    )
  );

create policy "loans_select_by_lender" on loans
  for select using (
    exists (
      select 1 from lenders
      where lenders.id = loans.lender_id
      and lenders.auth_user_id = auth.uid()
    )
  );

create policy "loans_insert_by_lender" on loans
  for insert with check (
    exists (
      select 1 from lenders
      where lenders.id = loans.lender_id
      and lenders.auth_user_id = auth.uid()
    )
  );

create policy "loans_update_by_lender" on loans
  for update using (
    exists (
      select 1 from lenders
      where lenders.id = loans.lender_id
      and lenders.auth_user_id = auth.uid()
    )
  );
