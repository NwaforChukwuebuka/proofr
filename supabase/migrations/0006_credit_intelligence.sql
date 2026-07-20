-- Milestone 17: credit intelligence engine.
-- personal_account_number activates the previously-inert self_funding
-- fraud rule (lib/fraud.ts's checkSelfFunding — see its doc comment).
-- business_started_at is a self-reported, unverified tenure signal,
-- distinct from merchants.created_at (platform tenure) — see
-- credit-intelligence-engine.md's "Known limitation: tenure".
-- credit_score/credit_score_breakdown are additive alongside the
-- existing confidence_score, not a replacement for it.

alter table merchants
  add column personal_account_number text,
  add column business_started_at date;

alter table reports
  add column credit_score numeric,
  add column credit_score_breakdown jsonb;
