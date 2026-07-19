import type { RuleType } from "@/lib/fraud";

/**
 * Milestone 10 confidence score. fraud-rules.md words each rule's penalty
 * per *distinct triggering group* (circular_transfer: "per distinct
 * triggering payer", identical_transfers: "per triggering group" = same
 * payer_account + amount), not per flag row — but lib/fraud.ts's
 * runFraudChecks writes one flag row per rule per qualifying *transaction*,
 * so a merchant with 5 identical-amount transactions from one payer can
 * have up to 5 identical_transfers rows for what fraud-rules.md calls one
 * group (see handoff.md milestone 8's seam note).
 *
 * Decision: dedupe open flags to distinct groups before penalizing, rather
 * than summing per row (which would over-penalize relative to the spec's
 * wording). Grouping key per rule:
 *   - circular_transfer:    payer_account            (one group per payer)
 *   - identical_transfers:  payer_account + amount    (one group per payer+amount pair)
 *   - self_funding:         rule_type alone           (flat, single deduction per fraud-rules.md's
 *                                                       "single occurrence is enough" wording)
 *   - velocity_spike:       rule_type alone           (flat single deduction, no per-group notion
 *                                                       in fraud-rules.md — it's a merchant-wide check)
 *
 * circular_transfer and identical_transfers can only ever be flagged against
 * a non-null payer_account (lib/fraud.ts's checkCircularTransfers /
 * checkIdenticalTransfers both bail out on a null payer_account), so no
 * null-payer fallback grouping is needed here.
 */

const PENALTIES: Record<RuleType, number> = {
  circular_transfer: 20,
  identical_transfers: 10,
  self_funding: 30,
  velocity_spike: 15,
};

export interface FlagForScoring {
  rule_type: RuleType;
  payer_account: string | null;
  amount: number;
}

function groupKey(flag: FlagForScoring): string {
  switch (flag.rule_type) {
    case "circular_transfer":
      return `circular_transfer:${flag.payer_account}`;
    case "identical_transfers":
      return `identical_transfers:${flag.payer_account}:${Number(flag.amount)}`;
    case "self_funding":
      return "self_funding";
    case "velocity_spike":
      return "velocity_spike";
  }
}

export function computeConfidenceScore(openFlags: FlagForScoring[]): number {
  const groupPenalties = new Map<string, number>();
  for (const flag of openFlags) {
    const key = groupKey(flag);
    if (!groupPenalties.has(key)) {
      groupPenalties.set(key, PENALTIES[flag.rule_type]);
    }
  }

  let totalPenalty = 0;
  for (const penalty of groupPenalties.values()) {
    totalPenalty += penalty;
  }

  return Math.max(0, 100 - totalPenalty);
}
