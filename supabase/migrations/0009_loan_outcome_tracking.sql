-- Milestone 21: outcome-tracking infrastructure.
-- Snapshots what the model predicted at the moment a loan was approved, so
-- that once real (non-simulated) loan outcomes exist, recalibrating
-- lib/creditScore.ts / lib/loanRecommendation.ts / lib/loanTerms.ts against
-- real outcomes is a query joining these columns against the eventual
-- outcome (loans.status + mock_repayment_schedule), not a rebuild. Deliberately
-- not a new table: one row per loan is exactly the right grain, and loans
-- already carries the eventual-outcome columns (status, mock_repayment_schedule).

alter table loans
  add column credit_score_at_approval numeric,
  add column recommended_loan_amount_at_approval numeric;
