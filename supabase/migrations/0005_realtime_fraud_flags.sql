-- Milestone 9: fraud flags on dashboard.
-- Same gap milestone 7 hit with `transactions` (0003_realtime_transactions.sql):
-- Supabase Realtime's postgres_changes requires the target table to be added
-- to the supabase_realtime publication before subscribers receive events.
-- fraud_flags is written by lib/fraud.ts's runFraudChecks *after* the
-- transaction insert, in the same webhook request but as a separate insert
-- moments later -- so the dashboard subscribes to this table directly
-- (in addition to the existing transactions subscription) to catch a flag
-- that lands after the transaction-insert event already fired.

alter publication supabase_realtime add table fraud_flags;
