import { describe, expect, it } from "vitest";
import { computeLoanTerms } from "@/lib/loanTerms";

const APPROVED_AT = new Date("2026-01-15T00:00:00.000Z");

describe("computeLoanTerms", () => {
  it("uses Strong tier for scores >= 80", () => {
    const result = computeLoanTerms({
      amount: 100_000,
      creditScore: 80,
      approvedAt: APPROVED_AT,
    });

    expect(result.termMonths).toBe(6);
    expect(result.interestRate).toBe(0.05);
    expect(result.totalRepayment).toBe(105_000);
    expect(result.periods).toHaveLength(6);
    expect(result.rationale[0]).toContain("Strong");
  });

  it("uses Fair tier for scores in [50, 79]", () => {
    const result = computeLoanTerms({
      amount: 100_000,
      creditScore: 50,
      approvedAt: APPROVED_AT,
    });

    expect(result.termMonths).toBe(4);
    expect(result.interestRate).toBe(0.1);
    expect(result.totalRepayment).toBe(110_000);
    expect(result.periods).toHaveLength(4);
  });

  it("uses Weak/unscored tier for low scores and null", () => {
    const weak = computeLoanTerms({
      amount: 100_000,
      creditScore: 49,
      approvedAt: APPROVED_AT,
    });
    const unscored = computeLoanTerms({
      amount: 100_000,
      creditScore: null,
      approvedAt: APPROVED_AT,
    });

    expect(weak.termMonths).toBe(3);
    expect(weak.interestRate).toBe(0.15);
    expect(weak.totalRepayment).toBe(115_000);

    expect(unscored.termMonths).toBe(3);
    expect(unscored.interestRate).toBe(0.15);
    expect(unscored.rationale[0]).toContain("most conservative");
  });

  it("builds pending periods with monthly due dates from approval", () => {
    const result = computeLoanTerms({
      amount: 90_000,
      creditScore: 90,
      approvedAt: APPROVED_AT,
    });

    expect(result.periods[0]).toMatchObject({
      period: 1,
      status: "pending",
      paidAmount: 0,
      paidAt: null,
    });
    expect(result.periods.every((p) => p.amount === result.periods[0].amount)).toBe(true);

    const dueTimes = result.periods.map((p) => new Date(p.dueDate).getTime());
    expect(dueTimes[1]).toBeGreaterThan(dueTimes[0]);
    expect(dueTimes[2]).toBeGreaterThan(dueTimes[1]);
  });
});
