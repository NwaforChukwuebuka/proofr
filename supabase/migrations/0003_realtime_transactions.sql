-- Milestone 7: merchant revenue dashboard.
-- Supabase Realtime only streams Postgres changes for tables added to the
-- `supabase_realtime` publication. Without this, the dashboard's
-- `postgres_changes` subscription on `transactions` silently never fires.

alter publication supabase_realtime add table transactions;
