import type { TrendPoint } from "@/lib/revenue";

/**
 * Milestone 17 credit intelligence engine. See credit-intelligence-engine.md
 * for the full rationale; this is the implementation of its "v1 signal set"
 * table. Every input here is derivable from data already captured by the
 * existing pipeline (merchants, transactions, the milestone-6 revenue
 * summary, the milestone-10 fraud confidence score) — no external
 * integration. Deliberately not ML-based (same reasoning as lib/fraud.ts /
 * architecture.md's TS-only choice): a transparent, component-scored model
 * a lender can inspect beats an opaque one nobody can explain, especially
 * before any real repayment-outcome data exists to train or validate
 * against (see this file's and credit-intelligence-engine.md's "not a
 * validated predictor" caveat).
 *
 * This is additive to, not a replacement for, lib/confidence.ts's
 * fraud-only confidence_score — that score is one input here (see
 * `fraudConfidence` below), reused as-is.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface TransactionForCreditScore {
  payer_account: string | null;
}

export interface CreditScoreInput {
  /** From lib/revenue.ts's computeRevenueSummary. */
  trend: TrendPoint[];
  /** merchants.created_at — platform tenure, independently verified by PROOFR itself. */
  accountCreatedAt: string;
  /** merchants.business_started_at — self-reported, unverified. Null if never provided. */
  businessStartedAt: string | null;
  /** All of the merchant's transactions (any payer_account nullness), for customer-behavior signals. */
  transactions: TransactionForCreditScore[];
  /** lib/confidence.ts's computeConfidenceScore() output, 0-100. */
  confidenceScore: number;
  /** Injectable for deterministic testing; defaults to the real current time. */
  now?: Date;
}

export interface CreditScoreBreakdown {
  revenueTrend: { score: number; direction: "growing" | "stable" | "declining" | "insufficient_data" };
  revenueConsistency: { score: number; coefficientOfVariation: number | null };
  tenure: {
    score: number;
    platformDays: number;
    selfReportedDays: number | null;
  };
  customerBehavior: {
    score: number;
    uniqueCustomers: number;
    repeatCustomerRate: number | null;
    /** Share of transactions with a non-null payer_account — see credit-intelligence-engine.md's coverage caveat. */
    payerAccountCoverage: number | null;
  };
  fraudConfidence: { score: number; confidenceScore: number };
}

export interface CreditScoreResult {
  score: number;
  breakdown: CreditScoreBreakdown;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.max(0, (later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

/**
 * 0-25. Compares the average amount in the second half of the available
 * trend buckets against the first half. Needs >=2 buckets to say anything;
 * a brand-new merchant with one bucket gets a low, honest "insufficient
 * data" score rather than a fabricated direction.
 */
function scoreRevenueTrend(trend: TrendPoint[]): CreditScoreBreakdown["revenueTrend"] {
  if (trend.length < 2) {
    return { score: 5, direction: "insufficient_data" };
  }

  const mid = Math.floor(trend.length / 2);
  const firstHalf = trend.slice(0, mid);
  const secondHalf = trend.slice(mid);
  const avg = (points: TrendPoint[]) =>
    points.reduce((sum, p) => sum + p.amount, 0) / points.length;

  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);

  if (firstAvg === 0 && secondAvg === 0) {
    return { score: 5, direction: "insufficient_data" };
  }

  const change = firstAvg === 0 ? Infinity : (secondAvg - firstAvg) / firstAvg;

  if (change > 0.05) return { score: 25, direction: "growing" };
  if (change < -0.05) return { score: 10, direction: "declining" };
  return { score: 20, direction: "stable" };
}

/**
 * 0-25. Coefficient of variation (stdev/mean) across trend buckets — lower
 * variance (a merchant taking in roughly the same amount period to period)
 * scores higher than a merchant with the same total but wildly spiky
 * inflow, since the latter is a harder repayment-capacity signal to trust.
 */
function scoreRevenueConsistency(trend: TrendPoint[]): CreditScoreBreakdown["revenueConsistency"] {
  if (trend.length < 2) {
    return { score: 5, coefficientOfVariation: null };
  }

  const amounts = trend.map((p) => p.amount);
  const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;

  if (mean === 0) {
    return { score: 5, coefficientOfVariation: null };
  }

  const variance =
    amounts.reduce((sum, a) => sum + (a - mean) ** 2, 0) / amounts.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;

  const score = clamp(25 * (1 - coefficientOfVariation), 0, 25);
  return { score, coefficientOfVariation };
}

/**
 * 0-20. Platform tenure (independently verified — PROOFR observed this
 * merchant since accountCreatedAt) is weighted up to 15 of the 20 points at
 * one full year. Self-reported business age contributes at most 5
 * additional points, and only for the portion beyond platform tenure —
 * unverified, so deliberately capped lower than the verified signal. See
 * credit-intelligence-engine.md's "Known limitation: tenure".
 */
function scoreTenure(
  accountCreatedAt: string,
  businessStartedAt: string | null,
  now: Date
): CreditScoreBreakdown["tenure"] {
  const platformDays = daysBetween(new Date(accountCreatedAt), now);
  const platformScore = clamp((platformDays / 365) * 15, 0, 15);

  let selfReportedDays: number | null = null;
  let selfReportedScore = 0;
  if (businessStartedAt) {
    selfReportedDays = daysBetween(new Date(businessStartedAt), now);
    const extraDays = Math.max(0, selfReportedDays - platformDays);
    selfReportedScore = clamp((extraDays / 365) * 5, 0, 5);
  }

  return {
    score: platformScore + selfReportedScore,
    platformDays: Math.round(platformDays),
    selfReportedDays: selfReportedDays === null ? null : Math.round(selfReportedDays),
  };
}

/**
 * 0-20. Two sub-signals, both derived from transactions.payer_account:
 * breadth (how many distinct customers) and depth (what fraction of those
 * customers came back more than once). Transactions with a null
 * payer_account (Monnify didn't supply paymentSourceInformation) are
 * excluded from both the numerator and denominator — not treated as
 * distinct unknown payers — per lib/fraud.ts's established null-handling
 * convention. `payerAccountCoverage` is reported so a low score here can be
 * distinguished from "few customers" vs "little payer data available."
 */
function scoreCustomerBehavior(
  transactions: TransactionForCreditScore[]
): CreditScoreBreakdown["customerBehavior"] {
  const known = transactions.filter((t) => t.payer_account);
  const payerAccountCoverage =
    transactions.length > 0 ? known.length / transactions.length : null;

  if (known.length === 0) {
    return { score: 0, uniqueCustomers: 0, repeatCustomerRate: null, payerAccountCoverage };
  }

  const countsByPayer = new Map<string, number>();
  for (const t of known) {
    const key = t.payer_account as string;
    countsByPayer.set(key, (countsByPayer.get(key) ?? 0) + 1);
  }

  const uniqueCustomers = countsByPayer.size;
  const repeatCustomers = [...countsByPayer.values()].filter((c) => c >= 2).length;
  const repeatCustomerRate = repeatCustomers / uniqueCustomers;

  const breadthScore = clamp(uniqueCustomers, 0, 10);
  const depthScore = clamp(repeatCustomerRate * 10, 0, 10);

  return {
    score: breadthScore + depthScore,
    uniqueCustomers,
    repeatCustomerRate,
    payerAccountCoverage,
  };
}

/** 0-10. Straight linear scale-down of the existing fraud confidence score. */
function scoreFraudConfidence(confidenceScore: number): CreditScoreBreakdown["fraudConfidence"] {
  const score = clamp((confidenceScore / 100) * 10, 0, 10);
  return { score, confidenceScore };
}

export function computeCreditScore(input: CreditScoreInput): CreditScoreResult {
  const now = input.now ?? new Date();

  const revenueTrend = scoreRevenueTrend(input.trend);
  const revenueConsistency = scoreRevenueConsistency(input.trend);
  const tenure = scoreTenure(input.accountCreatedAt, input.businessStartedAt, now);
  const customerBehavior = scoreCustomerBehavior(input.transactions);
  const fraudConfidence = scoreFraudConfidence(input.confidenceScore);

  const total =
    revenueTrend.score +
    revenueConsistency.score +
    tenure.score +
    customerBehavior.score +
    fraudConfidence.score;

  return {
    score: Math.round(clamp(total, 0, 100)),
    breakdown: {
      revenueTrend,
      revenueConsistency,
      tenure,
      customerBehavior,
      fraudConfidence,
    },
  };
}
