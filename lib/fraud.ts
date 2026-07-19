import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PROOFR fraud rule engine. Implements the four rules in fraud-rules.md
 * exactly as specified there. Each rule is a standalone, pure function over
 * plain transaction records so it can be unit-tested without a DB — the
 * Supabase-querying orchestrator (`runFraudChecks`) is a thin wrapper that
 * fetches the relevant window(s) and calls into these.
 *
 * `payer_account` null handling (applies to all rules below that key off
 * it): a null payer_account means Monnify's webhook didn't include
 * paymentSourceInformation for that transaction (see api.md milestone 5
 * entry). None of these rules can determine "same payer" against a null, so
 * a transaction with a null payer_account is simply excluded from any
 * same-payer grouping — it can neither trigger a same-payer rule itself nor
 * count toward another transaction's group. This means a transaction with
 * no payer_account can only ever be flagged by velocity_spike (the one rule
 * that doesn't group by payer). This is a deliberate under-detection
 * tradeoff, not a bug: matching null-to-null as "same payer" would produce
 * false positives across unrelated payers who all happen to be missing the
 * field.
 */

export type RuleType =
  | "circular_transfer"
  | "self_funding"
  | "identical_transfers"
  | "velocity_spike";

export type Severity = "high" | "medium";

export interface TransactionRecord {
  id: string;
  merchant_id: string;
  payer_account: string | null;
  amount: number;
  created_at: string;
}

export interface FraudFlagCandidate {
  rule_type: RuleType;
  severity: Severity;
}

const CIRCULAR_TRANSFER_THRESHOLD = 3;
const IDENTICAL_TRANSFER_THRESHOLD = 5;
const VELOCITY_MULTIPLIER = 3;

/**
 * Rule 1 — circular transfers. `history24h` must be every transaction for
 * this merchant in the rolling 24h window ending at `current.created_at`,
 * including `current` itself. Flags `current` if its payer_account appears
 * >= 3 times in that window.
 */
export function checkCircularTransfers(
  current: TransactionRecord,
  history24h: TransactionRecord[]
): FraudFlagCandidate | null {
  if (!current.payer_account) return null;

  const matchCount = history24h.filter(
    (t) => t.payer_account === current.payer_account
  ).length;

  if (matchCount >= CIRCULAR_TRANSFER_THRESHOLD) {
    return { rule_type: "circular_transfer", severity: "high" };
  }
  return null;
}

/**
 * Rule 2 — self-funding. `merchantPersonalAccountNumber` is the merchant's
 * own personal account number, if PROOFR has ever captured one. It does
 * not exist as a column on `merchants` today (see handoff.md milestone 2/4:
 * KYC only stores a verified boolean + hashed kyc_reference, never a raw
 * BVN/NIN or personal account number) — so this is always called with
 * `null` in production right now, and the rule correctly never fires. It's
 * implemented against a real (if currently absent) identity value rather
 * than a fabricated one, so it starts working correctly the moment such a
 * value is captured, with no rule-logic change needed.
 */
export function checkSelfFunding(
  current: TransactionRecord,
  merchantPersonalAccountNumber: string | null
): FraudFlagCandidate | null {
  if (!merchantPersonalAccountNumber || !current.payer_account) return null;

  if (current.payer_account === merchantPersonalAccountNumber) {
    return { rule_type: "self_funding", severity: "high" };
  }
  return null;
}

/**
 * Rule 3 — excessive identical transfers. `history1h` must be every
 * transaction for this merchant in the rolling 1h window ending at
 * `current.created_at`, including `current`. Flags `current` if >= 5
 * transactions share both its payer_account and its exact amount.
 */
export function checkIdenticalTransfers(
  current: TransactionRecord,
  history1h: TransactionRecord[]
): FraudFlagCandidate | null {
  if (!current.payer_account) return null;

  const matchCount = history1h.filter(
    (t) =>
      t.payer_account === current.payer_account &&
      Number(t.amount) === Number(current.amount)
  ).length;

  if (matchCount >= IDENTICAL_TRANSFER_THRESHOLD) {
    return { rule_type: "identical_transfers", severity: "medium" };
  }
  return null;
}

/**
 * Rule 4 — velocity spikes. `recentHour` is every transaction in the
 * rolling 1h window ending at `current.created_at` (including `current`);
 * `baseline7day` is every transaction in the trailing 7-day window ending
 * 1 day before `current.created_at` (per fraud-rules.md's SQL sketch: `now()
 * - 8 days` to `now() - 1 day`), used to compute an hourly average.
 *
 * If the baseline window has zero transactions, the hourly average is 0
 * and "3x average" is undefined (anything divided by zero looks like an
 * infinite spike) — a brand-new merchant's very first busy hour would
 * trivially "spike" against no history. This implementation deliberately
 * does not flag in that case: no baseline means nothing to compare against,
 * not evidence of fraud.
 */
export function checkVelocitySpike(
  current: TransactionRecord,
  recentHour: TransactionRecord[],
  baseline7day: TransactionRecord[]
): FraudFlagCandidate | null {
  const recentCount = recentHour.length;
  const recentVolume = recentHour.reduce((sum, t) => sum + Number(t.amount), 0);

  const baselineHours = 24 * 7;
  const avgCount = baseline7day.length / baselineHours;
  const avgVolume =
    baseline7day.reduce((sum, t) => sum + Number(t.amount), 0) / baselineHours;

  if (avgCount === 0 && avgVolume === 0) return null;

  const countSpike = avgCount > 0 && recentCount >= VELOCITY_MULTIPLIER * avgCount;
  const volumeSpike = avgVolume > 0 && recentVolume >= VELOCITY_MULTIPLIER * avgVolume;

  if (countSpike || volumeSpike) {
    return { rule_type: "velocity_spike", severity: "medium" };
  }
  return null;
}

/**
 * Runs all four rules against a freshly-inserted transaction and writes any
 * resulting fraud_flags rows. Called synchronously from the webhook route
 * right after insert, per architecture.md. Queries are scoped to the
 * merchant and bounded windows (24h / 1h / 7-day baseline) so this stays
 * cheap regardless of the merchant's total transaction history.
 *
 * Idempotency: the webhook route only reaches this function on a genuinely
 * new transaction insert (retries short-circuit earlier on the
 * monnify_reference unique-violation), so under normal operation this runs
 * at most once per transaction. As a defensive second layer against any
 * other retry path, existing flags for this transaction_id are fetched
 * first and any rule_type already flagged is skipped.
 */
export async function runFraudChecks(
  supabase: SupabaseClient,
  current: TransactionRecord,
  merchantPersonalAccountNumber: string | null
): Promise<FraudFlagCandidate[]> {
  const now = new Date(current.created_at);
  const window24hStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const window1hStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const baselineStart = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const baselineEnd = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

  const [history24hRes, baselineRes, existingFlagsRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, merchant_id, payer_account, amount, created_at")
      .eq("merchant_id", current.merchant_id)
      .gte("created_at", window24hStart)
      .lte("created_at", current.created_at),
    supabase
      .from("transactions")
      .select("id, merchant_id, payer_account, amount, created_at")
      .eq("merchant_id", current.merchant_id)
      .gte("created_at", baselineStart)
      .lte("created_at", baselineEnd),
    supabase
      .from("fraud_flags")
      .select("rule_type")
      .eq("transaction_id", current.id),
  ]);

  if (history24hRes.error) throw history24hRes.error;
  if (baselineRes.error) throw baselineRes.error;
  if (existingFlagsRes.error) throw existingFlagsRes.error;

  const history24h = (history24hRes.data ?? []) as TransactionRecord[];
  const baseline7day = (baselineRes.data ?? []) as TransactionRecord[];
  const history1h = history24h.filter((t) => t.created_at >= window1hStart);
  const alreadyFlagged = new Set(
    (existingFlagsRes.data ?? []).map((f) => f.rule_type as RuleType)
  );

  const candidates = [
    checkCircularTransfers(current, history24h),
    checkSelfFunding(current, merchantPersonalAccountNumber),
    checkIdenticalTransfers(current, history1h),
    checkVelocitySpike(current, history1h, baseline7day),
  ].filter((c): c is FraudFlagCandidate => c !== null && !alreadyFlagged.has(c.rule_type));

  if (candidates.length === 0) return [];

  const { error: insertError } = await supabase.from("fraud_flags").insert(
    candidates.map((c) => ({
      transaction_id: current.id,
      rule_type: c.rule_type,
      severity: c.severity,
      status: "open",
    }))
  );

  if (insertError) throw insertError;

  return candidates;
}
