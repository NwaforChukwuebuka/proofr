import { describe, expect, it } from "vitest";
import {
  checkCircularTransfers,
  checkIdenticalTransfers,
  checkSelfFunding,
  checkVelocitySpike,
  type TransactionRecord,
} from "@/lib/fraud";

function tx(
  overrides: Partial<TransactionRecord> & Pick<TransactionRecord, "id">
): TransactionRecord {
  return {
    merchant_id: "m1",
    payer_account: "ACC-1",
    amount: 10_000,
    created_at: "2026-07-21T12:00:00.000Z",
    ...overrides,
  };
}

describe("checkCircularTransfers", () => {
  it("returns null when payer_account is missing", () => {
    const current = tx({ id: "c", payer_account: null });
    expect(checkCircularTransfers(current, [current])).toBeNull();
  });

  it("flags when the same payer appears >= 3 times in 24h", () => {
    const current = tx({ id: "c3" });
    const history = [tx({ id: "c1" }), tx({ id: "c2" }), current];
    expect(checkCircularTransfers(current, history)).toEqual({
      rule_type: "circular_transfer",
      severity: "high",
    });
  });

  it("does not flag below the threshold", () => {
    const current = tx({ id: "c2" });
    const history = [tx({ id: "c1" }), current];
    expect(checkCircularTransfers(current, history)).toBeNull();
  });
});

describe("checkSelfFunding", () => {
  it("returns null when merchant personal account is unknown", () => {
    expect(checkSelfFunding(tx({ id: "1" }), null)).toBeNull();
  });

  it("flags when payer matches the merchant personal account", () => {
    expect(checkSelfFunding(tx({ id: "1", payer_account: "ME" }), "ME")).toEqual({
      rule_type: "self_funding",
      severity: "high",
    });
  });

  it("does not flag a different payer", () => {
    expect(checkSelfFunding(tx({ id: "1", payer_account: "OTHER" }), "ME")).toBeNull();
  });
});

describe("checkIdenticalTransfers", () => {
  it("flags >= 5 same payer + exact amount in 1h", () => {
    const current = tx({ id: "i5", amount: 2500 });
    const history = [
      tx({ id: "i1", amount: 2500 }),
      tx({ id: "i2", amount: 2500 }),
      tx({ id: "i3", amount: 2500 }),
      tx({ id: "i4", amount: 2500 }),
      current,
    ];
    expect(checkIdenticalTransfers(current, history)).toEqual({
      rule_type: "identical_transfers",
      severity: "medium",
    });
  });

  it("ignores same payer with different amounts", () => {
    const current = tx({ id: "i2", amount: 2500 });
    const history = [
      tx({ id: "i1", amount: 1000 }),
      tx({ id: "i1b", amount: 1000 }),
      tx({ id: "i1c", amount: 1000 }),
      tx({ id: "i1d", amount: 1000 }),
      current,
    ];
    expect(checkIdenticalTransfers(current, history)).toBeNull();
  });
});

describe("checkVelocitySpike", () => {
  it("does not flag when baseline history is empty", () => {
    const current = tx({ id: "v1" });
    expect(checkVelocitySpike(current, [current], [])).toBeNull();
  });

  it("flags a count spike of 3x the hourly baseline average", () => {
    const current = tx({ id: "spike" });
    // baseline: 168 hours, 56 txs → avgCount = 56/168 = 1/3
    // 3x threshold ≈ 1; recent hour with 2 txs is enough
    const baseline = Array.from({ length: 56 }, (_, i) =>
      tx({ id: `b${i}`, created_at: "2026-07-10T00:00:00.000Z" })
    );
    const recentHour = [tx({ id: "r1" }), current];

    expect(checkVelocitySpike(current, recentHour, baseline)).toEqual({
      rule_type: "velocity_spike",
      severity: "medium",
    });
  });

  it("flags a volume spike even when count is calm", () => {
    const current = tx({ id: "vol", amount: 1_000_000 });
    // baseline volume: 168 hours × tiny amounts → low avgVolume
    const baseline = Array.from({ length: 168 }, (_, i) =>
      tx({ id: `b${i}`, amount: 100, created_at: "2026-07-10T00:00:00.000Z" })
    );
    // avgVolume = 16800/168 = 100; 3x = 300; recent volume 1_000_000 spikes
    expect(checkVelocitySpike(current, [current], baseline)).toEqual({
      rule_type: "velocity_spike",
      severity: "medium",
    });
  });
});
