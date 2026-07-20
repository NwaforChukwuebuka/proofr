import type { RepaymentPeriod } from "@/lib/repayment";

/**
 * Milestone 20: risk-based loan terms. Milestones 12/15 fixed every mock
 * loan at 3 months, 0% interest, regardless of the merchant's credit_score
 * — a merchant with a strong score and one with no score at all got
 * identical terms. This replaces the fixed schedule with credit_score-tiered
 * term length and interest, reusing lib/repayment.ts's existing
 * RepaymentPeriod shape and lib/repayment.ts's applyRepaymentDeductions
 * unchanged (it already operates generically over however many periods a
 * schedule has).
 *
 * Same honesty stance as lib/loanRecommendation.ts: no real underwriting
 * data (default rates, real repayment outcomes) exists yet to derive these
 * tiers statistically — see milestone 21's outcome-tracking infrastructure,
 * which is what a future recalibration of these exact numbers would query.
 * These are named, stated tiers, not a fabricated precision model. A null
 * credit_score (merchant has never generated a report) is treated as the
 * most conservative tier, not a default in either direction.
 */

export interface LoanTier {
  minScore: number;
  termMonths: number;
  interestRate: number;
  label: string;
}

// Ordered highest score-requirement first; first match wins.
const TIERS: LoanTier[] = [
  { minScore: 80, termMonths: 6, interestRate: 0.05, label: "Strong" },
  { minScore: 50, termMonths: 4, interestRate: 0.1, label: "Fair" },
  { minScore: 0, termMonths: 3, interestRate: 0.15, label: "Weak/unscored" },
];

export interface LoanTermsInput {
  amount: number;
  creditScore: number | null;
  approvedAt: Date;
}

export interface LoanTermsResult {
  termMonths: number;
  interestRate: number;
  totalRepayment: number;
  periods: RepaymentPeriod[];
  rationale: string[];
}

function tierFor(creditScore: number | null): LoanTier {
  const score = creditScore ?? -1;
  return TIERS.find((t) => score >= t.minScore) ?? TIERS[TIERS.length - 1];
}

export function computeLoanTerms(input: LoanTermsInput): LoanTermsResult {
  const tier = tierFor(input.creditScore);
  const totalRepayment = Math.round(input.amount * (1 + tier.interestRate) * 100) / 100;
  const perPeriod = Math.round((totalRepayment / tier.termMonths) * 100) / 100;

  const periods: RepaymentPeriod[] = Array.from({ length: tier.termMonths }, (_, i) => {
    const dueDate = new Date(input.approvedAt);
    dueDate.setMonth(dueDate.getMonth() + i + 1);
    return {
      period: i + 1,
      amount: perPeriod,
      dueDate: dueDate.toISOString(),
      status: "pending",
      paidAmount: 0,
      paidAt: null,
    };
  });

  const rationale = [
    input.creditScore === null
      ? "No credit score available yet — treated as the most conservative tier"
      : `Credit score ${input.creditScore}/100 → "${tier.label}" tier`,
    `Interest: ${Math.round(tier.interestRate * 100)}% flat, added to principal (not compounding)`,
    `Term: ${tier.termMonths} months`,
    `Total repayment: ₦${totalRepayment.toLocaleString("en-NG")} (principal ₦${input.amount.toLocaleString("en-NG")} + interest)`,
  ];

  return { termMonths: tier.termMonths, interestRate: tier.interestRate, totalRepayment, periods, rationale };
}
