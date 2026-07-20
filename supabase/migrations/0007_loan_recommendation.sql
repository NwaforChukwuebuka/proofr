-- Milestone 19: recommended loan amount.
-- Additive alongside credit_score/credit_score_breakdown (milestone 17),
-- not a replacement — see lib/loanRecommendation.ts and
-- credit-intelligence-engine.md.

alter table reports
  add column recommended_loan_amount numeric,
  add column loan_recommendation_breakdown jsonb;
