/**
 * Milestone 19: recommended loan amount (Phase 3 of the roadmap in
 * credit-intelligence-engine.md). Translates lib/creditScore.ts's 0-100
 * score plus verified revenue into an actual naira figure a lender can act
 * on — the gap the PRD's original "confidence score only" report left
 * open.
 *
 * Repayment capacity is not something PROOFR can measure directly today —
 * no merchant expense data is captured anywhere in this system. Rather
 * than fabricate an expense estimate, this uses a stated, documented
 * assumption instead: repayment capacity is capped at a fixed fraction of
 * average verified monthly revenue (CAPACITY_RATIO). This is a named
 * heuristic, not a measured number — see credit-intelligence-engine.md's
 * "Explicitly out of scope for v1" note on this exact gap. Revisit if
 * real expense data or real repayment-outcome data ever becomes
 * available to calibrate against.
 *
 * Term is fixed at 3 months, no interest — deliberately reusing
 * lib/repayment.ts's existing mock schedule shape rather than
 * introducing a second, competing notion of loan terms. Milestone 19 is
 * scoped to "how much," not "on what terms" — that's flagged as
 * out-of-scope future work here, same as it was in milestone 17.
 */

const CAPACITY_RATIO = 0.25;
const TERM_MONTHS = 3;
const DAYS_PER_MONTH = 30;

export interface LoanRecommendationInput {
  /** lib/revenue.ts's verifiedRevenue — lifetime total, fraud-flagged transactions already excluded. */
  verifiedRevenue: number;
  /** Days between the merchant's first and most recent transaction (0 if no transactions yet). */
  daysOfHistory: number;
  /** lib/creditScore.ts's computeCreditScore().score, 0-100. */
  creditScore: number;
}

export interface LoanRecommendationResult {
  recommendedAmount: number;
  breakdown: {
    averageMonthlyVerifiedRevenue: number;
    capacityRatio: number;
    scoreMultiplier: number;
    monthlyInstallmentCap: number;
    termMonths: number;
  };
  /** Plain-language line items, same transparency pattern as lib/creditScore.ts's breakdown. */
  rationale: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to the nearest ₦1,000 — a lender-facing recommendation shouldn't imply naira-level precision this model doesn't have. */
function roundToThousand(value: number): number {
  return Math.round(value / 1000) * 1000;
}

export function computeLoanRecommendation(
  input: LoanRecommendationInput
): LoanRecommendationResult {
  const averageMonthlyVerifiedRevenue =
    input.daysOfHistory > 0
      ? (input.verifiedRevenue / input.daysOfHistory) * DAYS_PER_MONTH
      : 0;

  const scoreMultiplier = clamp(input.creditScore / 100, 0, 1);
  const monthlyInstallmentCap =
    averageMonthlyVerifiedRevenue * CAPACITY_RATIO * scoreMultiplier;
  const recommendedAmount = roundToThousand(
    Math.max(0, monthlyInstallmentCap * TERM_MONTHS)
  );

  const rationale = [
    `Average verified monthly revenue: ~₦${Math.round(averageMonthlyVerifiedRevenue).toLocaleString("en-NG")}`,
    `Capacity assumption: at most ${Math.round(CAPACITY_RATIO * 100)}% of monthly revenue toward loan repayment`,
    `Credit score adjustment: ${Math.round(scoreMultiplier * 100)}% of full capacity (from a credit score of ${input.creditScore}/100)`,
    `Term: ${TERM_MONTHS} months, no interest modeled — matches the existing mock repayment schedule`,
  ];

  return {
    recommendedAmount,
    breakdown: {
      averageMonthlyVerifiedRevenue,
      capacityRatio: CAPACITY_RATIO,
      scoreMultiplier,
      monthlyInstallmentCap,
      termMonths: TERM_MONTHS,
    },
    rationale,
  };
}
