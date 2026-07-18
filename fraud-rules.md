# PROOFR — Fraud Rules

Implementable definitions for the four rules named in the [PRD](PROOFR_MVP_PRD.md#fraud-rules). Implemented in TypeScript against Supabase (see [architecture.md](architecture.md) for why no Python/ML), triggered per-transaction at [plan.md](plan.md) milestone 8. Each rule writes to `fraud_flags` (see [data-model.md](data-model.md)).

## 1. Circular transfers

**Trigger**: the same payer account sends money to a merchant, and a matching outbound-looking pattern (same payer/merchant pair repeating inbound within a short window) occurs `>= 3` times within a rolling **24 hours**.

```sql
select payer_account, count(*)
from transactions
where merchant_id = :merchant_id
  and created_at > now() - interval '24 hours'
group by payer_account
having count(*) >= 3
```

- **Severity**: high
- **Confidence score penalty**: -20 points per distinct triggering payer

## 2. Self-funding

**Trigger**: `transactions.payer_account` or payer identity matches the merchant's own KYC-verified BVN/NIN or a known personal account on file.

```ts
if (transaction.payerIdentity === merchant.kycIdentity) {
  flag("self_funding", "high");
}
```

- **Severity**: high
- **Confidence score penalty**: -30 points (single occurrence is enough — this directly contradicts "verified business revenue")

## 3. Excessive identical transfers

**Trigger**: `>= 5` transactions with the **identical amount** from the **same payer** within a rolling **1 hour** window.

```sql
select payer_account, amount, count(*)
from transactions
where merchant_id = :merchant_id
  and created_at > now() - interval '1 hour'
group by payer_account, amount
having count(*) >= 5
```

- **Severity**: medium
- **Confidence score penalty**: -10 points per triggering group

## 4. Velocity spikes

**Trigger**: transaction count or total volume in a rolling **1 hour** window exceeds the merchant's trailing **7-day hourly average** by **3x or more**.

```sql
with recent as (
  select count(*) as cnt, sum(amount) as vol
  from transactions
  where merchant_id = :merchant_id
    and created_at > now() - interval '1 hour'
),
baseline as (
  select count(*) / (24.0 * 7) as avg_cnt, sum(amount) / (24.0 * 7) as avg_vol
  from transactions
  where merchant_id = :merchant_id
    and created_at between now() - interval '8 days' and now() - interval '1 day'
)
select * from recent, baseline
where recent.cnt >= 3 * baseline.avg_cnt or recent.vol >= 3 * baseline.avg_vol
```

- **Severity**: medium
- **Confidence score penalty**: -15 points

## Confidence score

Reports (milestone 10) compute a `confidence_score` starting at **100** and subtracting each open flag's penalty (floor at 0). Overridden flags (admin cleared them, milestone 14) do not count against the score. This score is what appears on the Proof-of-Revenue report for lenders.
