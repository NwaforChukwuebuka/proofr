import { describe, expect, it } from "vitest";
import { computeLoanRecommendation } from "@/lib/loanRecommendation";

describe("computeLoanRecommendation", () => {
  it("returns 0 when there is no transaction history", () => {
    const result = computeLoanRecommendation({
      verifiedRevenue: 500_000,
      daysOfHistory: 0,
      creditScore: 80,
    });

    expect(result.recommendedAmount).toBe(0);
    expect(result.breakdown.averageMonthlyVerifiedRevenue).toBe(0);
    expect(result.breakdown.termMonths).toBe(3);
    expect(result.breakdown.capacityRatio).toBe(0.25);
  });

  it("scales recommendation by credit score and rounds to nearest ₦1,000", () => {
    // 900_000 over 90 days → 300_000 / month
    // cap = 300_000 * 0.25 * 0.8 = 60_000 / month
    // amount = 60_000 * 3 = 180_000
    const result = computeLoanRecommendation({
      verifiedRevenue: 900_000,
      daysOfHistory: 90,
      creditScore: 80,
    });

    expect(result.breakdown.averageMonthlyVerifiedRevenue).toBe(300_000);
    expect(result.breakdown.scoreMultiplier).toBe(0.8);
    expect(result.breakdown.monthlyInstallmentCap).toBe(60_000);
    expect(result.recommendedAmount).toBe(180_000);
  });

  it("clamps score multiplier to [0, 1]", () => {
    const over = computeLoanRecommendation({
      verifiedRevenue: 900_000,
      daysOfHistory: 90,
      creditScore: 150,
    });
    const under = computeLoanRecommendation({
      verifiedRevenue: 900_000,
      daysOfHistory: 90,
      creditScore: -20,
    });

    expect(over.breakdown.scoreMultiplier).toBe(1);
    expect(under.breakdown.scoreMultiplier).toBe(0);
    expect(under.recommendedAmount).toBe(0);
  });

  it("includes plain-language rationale lines", () => {
    const result = computeLoanRecommendation({
      verifiedRevenue: 300_000,
      daysOfHistory: 30,
      creditScore: 100,
    });

    expect(result.rationale).toHaveLength(4);
    expect(result.rationale[0]).toContain("Average verified monthly revenue");
    expect(result.rationale[1]).toContain("25%");
  });
});
