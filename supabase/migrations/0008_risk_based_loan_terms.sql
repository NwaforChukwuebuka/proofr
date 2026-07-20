-- Milestone 20: risk-based loan terms.
-- interest_rate/term_months record the actual terms lib/loanTerms.ts chose
-- at approval time (mock_repayment_schedule already carries the resulting
-- per-period amounts/due dates — these two columns make the *inputs* to
-- that schedule (rate, term) queryable without re-deriving them from the
-- period count/amounts).

alter table loans
  add column interest_rate numeric,
  add column term_months integer;
