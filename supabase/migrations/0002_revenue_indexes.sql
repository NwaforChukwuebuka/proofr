-- Milestone 6: revenue engine query support.
-- GET /api/merchants/:id/revenue filters transactions by merchant_id and
-- buckets by created_at (day/month) — this composite index covers both.
-- Flagged as missing in handoff.md's milestone 5 entry.

create index if not exists idx_transactions_merchant_created
  on transactions (merchant_id, created_at);
