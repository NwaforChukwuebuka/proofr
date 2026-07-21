import { describe, expect, it } from "vitest";
import { computeConfidenceScore } from "@/lib/confidence";

describe("computeConfidenceScore", () => {
  it("returns 100 when there are no open flags", () => {
    expect(computeConfidenceScore([])).toBe(100);
  });

  it("applies flat penalties for self_funding and velocity_spike once", () => {
    const score = computeConfidenceScore([
      { rule_type: "self_funding", payer_account: "A", amount: 1000 },
      { rule_type: "self_funding", payer_account: "A", amount: 2000 },
      { rule_type: "velocity_spike", payer_account: null, amount: 5000 },
      { rule_type: "velocity_spike", payer_account: null, amount: 6000 },
    ]);

    // 30 + 15 = 45 → 55
    expect(score).toBe(55);
  });

  it("dedupes circular_transfer by payer_account", () => {
    const score = computeConfidenceScore([
      { rule_type: "circular_transfer", payer_account: "A", amount: 1000 },
      { rule_type: "circular_transfer", payer_account: "A", amount: 2000 },
      { rule_type: "circular_transfer", payer_account: "B", amount: 3000 },
    ]);

    // two distinct payers × 20 = 40 → 60
    expect(score).toBe(60);
  });

  it("dedupes identical_transfers by payer_account + amount", () => {
    const score = computeConfidenceScore([
      { rule_type: "identical_transfers", payer_account: "A", amount: 5000 },
      { rule_type: "identical_transfers", payer_account: "A", amount: 5000 },
      { rule_type: "identical_transfers", payer_account: "A", amount: 7000 },
    ]);

    // two groups × 10 = 20 → 80
    expect(score).toBe(80);
  });

  it("never goes below 0", () => {
    const flags = [
      { rule_type: "self_funding" as const, payer_account: "A", amount: 1 },
      { rule_type: "velocity_spike" as const, payer_account: null, amount: 1 },
      { rule_type: "circular_transfer" as const, payer_account: "A", amount: 1 },
      { rule_type: "circular_transfer" as const, payer_account: "B", amount: 1 },
      { rule_type: "circular_transfer" as const, payer_account: "C", amount: 1 },
      { rule_type: "circular_transfer" as const, payer_account: "D", amount: 1 },
      { rule_type: "identical_transfers" as const, payer_account: "A", amount: 1 },
      { rule_type: "identical_transfers" as const, payer_account: "B", amount: 1 },
    ];

    expect(computeConfidenceScore(flags)).toBe(0);
  });
});
