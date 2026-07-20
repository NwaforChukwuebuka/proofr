-- Milestone 24: lenders can self-serve provision their own api_clients rows
-- (previously only possible via scripts/provision-api-client.ts, run
-- manually for third-party platforms). lender_id is nullable because
-- existing/future third-party rows still have no lender — only
-- lender-generated keys populate it. key_preview is a non-secret display
-- string (e.g. "proofr_pk_ab12…cd34") captured at creation time, since the
-- raw key itself is never stored anywhere and can't be re-derived later.

alter table api_clients
  add column lender_id uuid references lenders(id),
  add column key_preview text;

create index idx_api_clients_lender on api_clients (lender_id);
