import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PROOFR repayment automation (milestone 15). Replaces milestone 12's static
 * 3-period even-split placeholder with a real, if simulated, mechanism:
 * incoming merchant revenue is applied against their approved loan's
 * schedule as it arrives. No real money moves — this only mutates
 * `loans.status` / `loans.mock_repayment_schedule`, never `transactions` or
 * anything revenue/fraud-related (see lib/revenue.ts, lib/confidence.ts —
 * both untouched by this file).
 *
 * Mechanism: a waterfall applied per incoming transaction. Each period in
 * `mock_repayment_schedule` gains `paidAmount` (cumulative) and `status`
 * ("pending" | "paid"). The incoming transaction amount is applied to the
 * oldest unpaid period first; once that period's `amount` is fully covered
 * it's marked "paid" and any remainder cascades into the next period. This
 * is genuinely tied to incoming revenue (a transaction directly funds
 * whichever period is currently owed), not to elapsed time, and needs no
 * extra "accumulated since last update" bookkeeping since progress already
 * lives in `paidAmount` between calls.
 */

export interface RepaymentPeriod {
  period: number;
  amount: number;
  dueDate: string;
  status: "pending" | "paid";
  paidAmount: number;
  paidAt: string | null;
}

interface LoanRow {
  id: string;
  status: string;
  mock_repayment_schedule: RepaymentPeriod[] | null;
}

const ACTIVE_LOAN_STATUSES = ["approved", "repaying"];

function normalizeSchedule(raw: LoanRow["mock_repayment_schedule"]): RepaymentPeriod[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => ({
      period: p.period,
      amount: Number(p.amount),
      dueDate: p.dueDate,
      status: (p.status === "paid" ? "paid" : "pending") as "pending" | "paid",
      paidAmount: Number(p.paidAmount ?? 0),
      paidAt: p.paidAt ?? null,
    }))
    .sort((a, b) => a.period - b.period);
}

/**
 * Applies an incoming transaction's amount as a simulated repayment
 * deduction against every active (`approved` | `repaying`) loan for the
 * paying merchant. Called synchronously from the webhook route, same
 * process, after the transaction insert — mirrors how milestone 8's fraud
 * engine is wired in. Errors are the caller's responsibility to catch; this
 * never touches `transactions` or revenue/fraud tables.
 */
export async function applyRepaymentDeductions(
  supabase: SupabaseClient,
  merchantId: string,
  transactionAmount: number
): Promise<void> {
  const { data: loans, error } = await supabase
    .from("loans")
    .select("id, status, mock_repayment_schedule")
    .eq("merchant_id", merchantId)
    .in("status", ACTIVE_LOAN_STATUSES);

  if (error) throw error;
  if (!loans || loans.length === 0) return;

  for (const loan of loans as LoanRow[]) {
    const schedule = normalizeSchedule(loan.mock_repayment_schedule);
    if (schedule.length === 0) continue;

    let remaining = transactionAmount;
    const now = new Date().toISOString();

    for (const p of schedule) {
      if (remaining <= 0) break;
      if (p.status === "paid") continue;

      const owed = p.amount - p.paidAmount;
      const applied = Math.min(remaining, owed);
      p.paidAmount += applied;
      remaining -= applied;

      if (p.paidAmount >= p.amount) {
        p.status = "paid";
        p.paidAt = now;
      }
    }

    const allPaid = schedule.every((p) => p.status === "paid");
    const anyProgress = schedule.some((p) => p.paidAmount > 0);
    const nextStatus = allPaid ? "repaid" : anyProgress ? "repaying" : loan.status;

    if (nextStatus === loan.status && !anyProgress) continue; // nothing changed

    const { error: updateError } = await supabase
      .from("loans")
      .update({
        status: nextStatus,
        mock_repayment_schedule: schedule,
      })
      .eq("id", loan.id);

    if (updateError) throw updateError;
  }
}
