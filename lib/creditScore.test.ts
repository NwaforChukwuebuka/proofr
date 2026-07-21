import { describe, expect, it } from "vitest";
import { computeCreditScore } from "@/lib/creditScore";

const NOW = new Date("2026-07-21T12:00:00.000Z");

describe("computeCreditScore", () => {
  it("returns a low honest score when trend data is insufficient", () => {
    const result = computeCreditScore({
      trend: [{ period: "2026-07", amount: 100_000 }],
      accountCreatedAt: "2026-07-01T00:00:00.000Z",
      businessStartedAt: null,
      transactions: [],
      confidenceScore: 100,
      now: NOW,
    });

    expect(result.breakdown.revenueTrend).toEqual({
      score: 5,
      direction: "insufficient_data",
    });
    expect(result.breakdown.revenueConsistency.coefficientOfVariation).toBeNull();
    expect(result.breakdown.fraudConfidence.score).toBe(10);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("scores growing revenue higher than declining revenue", () => {
    const growing = computeCreditScore({
      trend: [
        { period: "2026-01", amount: 50_000 },
        { period: "2026-02", amount: 50_000 },
        { period: "2026-03", amount: 120_000 },
        { period: "2026-04", amount: 120_000 },
      ],
      accountCreatedAt: "2025-07-21T00:00:00.000Z",
      businessStartedAt: null,
      transactions: [],
      confidenceScore: 100,
      now: NOW,
    });

    const declining = computeCreditScore({
      trend: [
        { period: "2026-01", amount: 120_000 },
        { period: "2026-02", amount: 120_000 },
        { period: "2026-03", amount: 50_000 },
        { period: "2026-04", amount: 50_000 },
      ],
      accountCreatedAt: "2025-07-21T00:00:00.000Z",
      businessStartedAt: null,
      transactions: [],
      confidenceScore: 100,
      now: NOW,
    });

    expect(growing.breakdown.revenueTrend.direction).toBe("growing");
    expect(declining.breakdown.revenueTrend.direction).toBe("declining");
    expect(growing.score).toBeGreaterThan(declining.score);
  });

  it("rewards consistent revenue over spiky revenue", () => {
    const consistent = computeCreditScore({
      trend: [
        { period: "2026-01", amount: 100_000 },
        { period: "2026-02", amount: 100_000 },
        { period: "2026-03", amount: 100_000 },
        { period: "2026-04", amount: 100_000 },
      ],
      accountCreatedAt: "2025-07-21T00:00:00.000Z",
      businessStartedAt: null,
      transactions: [],
      confidenceScore: 100,
      now: NOW,
    });

    const spiky = computeCreditScore({
      trend: [
        { period: "2026-01", amount: 10_000 },
        { period: "2026-02", amount: 190_000 },
        { period: "2026-03", amount: 10_000 },
        { period: "2026-04", amount: 190_000 },
      ],
      accountCreatedAt: "2025-07-21T00:00:00.000Z",
      businessStartedAt: null,
      transactions: [],
      confidenceScore: 100,
      now: NOW,
    });

    expect(consistent.breakdown.revenueConsistency.score).toBeGreaterThan(
      spiky.breakdown.revenueConsistency.score
    );
  });

  it("caps self-reported tenure below verified platform tenure", () => {
    const result = computeCreditScore({
      trend: [
        { period: "2026-01", amount: 100_000 },
        { period: "2026-02", amount: 100_000 },
      ],
      accountCreatedAt: "2025-07-21T12:00:00.000Z",
      businessStartedAt: "2020-01-01T00:00:00.000Z",
      transactions: [],
      confidenceScore: 100,
      now: NOW,
    });

    expect(result.breakdown.tenure.platformDays).toBe(365);
    expect(result.breakdown.tenure.selfReportedDays).toBeGreaterThan(365);
    expect(result.breakdown.tenure.score).toBeLessThanOrEqual(20);
    // platform max 15 + self-reported max 5
    expect(result.breakdown.tenure.score).toBe(20);
  });

  it("scores customer breadth and repeat rate from payer_account only", () => {
    const result = computeCreditScore({
      trend: [
        { period: "2026-01", amount: 100_000 },
        { period: "2026-02", amount: 100_000 },
      ],
      accountCreatedAt: "2025-07-21T00:00:00.000Z",
      businessStartedAt: null,
      transactions: [
        { payer_account: "111" },
        { payer_account: "111" },
        { payer_account: "222" },
        { payer_account: null },
        { payer_account: null },
      ],
      confidenceScore: 100,
      now: NOW,
    });

    expect(result.breakdown.customerBehavior.uniqueCustomers).toBe(2);
    expect(result.breakdown.customerBehavior.repeatCustomerRate).toBe(0.5);
    expect(result.breakdown.customerBehavior.payerAccountCoverage).toBe(0.6);
    expect(result.breakdown.customerBehavior.score).toBe(2 + 5); // breadth 2 + depth 5
  });

  it("scales fraud confidence linearly into 0-10 points", () => {
    const high = computeCreditScore({
      trend: [],
      accountCreatedAt: NOW.toISOString(),
      businessStartedAt: null,
      transactions: [],
      confidenceScore: 100,
      now: NOW,
    });
    const mid = computeCreditScore({
      trend: [],
      accountCreatedAt: NOW.toISOString(),
      businessStartedAt: null,
      transactions: [],
      confidenceScore: 50,
      now: NOW,
    });

    expect(high.breakdown.fraudConfidence.score).toBe(10);
    expect(mid.breakdown.fraudConfidence.score).toBe(5);
  });
});
