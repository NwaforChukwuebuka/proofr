-- Milestone 8: fraud rule engine.
-- Prevents a rule from double-flagging the same transaction (defensive
-- second layer alongside lib/fraud.ts's own pre-insert check) and speeds up
-- the revenue route's per-request "which transactions have an open flag"
-- lookup.

create unique index if not exists idx_fraud_flags_transaction_rule
  on fraud_flags (transaction_id, rule_type);

create index if not exists idx_fraud_flags_status_transaction
  on fraud_flags (status, transaction_id);
