import { NextResponse } from "next/server";
import { authenticateAsLender } from "@/lib/lender-auth";
import { computeLoanTerms } from "@/lib/loanTerms";

/**
 * Milestone 12/15 built the schedule *shape* here at approval time with a
 * fixed 3-month/0%-interest placeholder. Milestone 20 replaces that fixed
 * shape with lib/loanTerms.ts's credit_score-tiered term/interest — every
 * other placeholder-replacement note from milestone 12/15 still applies:
 * each period starts "pending" with paidAmount 0 and is only ever advanced
 * by lib/repayment.ts's applyRepaymentDeductions, called from the webhook
 * route as real merchant revenue arrives — never by elapsed time.
 *
 * Milestone 21 additionally snapshots the credit_score/recommended amount
 * that were live at approval time onto the loan row, for future outcome
 * recalibration — see supabase/migrations/0009_loan_outcome_tracking.sql.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await authenticateAsLender(request);
  if ("error" in auth) return auth.error;
  const { supabase, lender } = auth;

  const { data: loan, error: loanError } = await supabase
    .from("loans")
    .select("id, lender_id, merchant_id, amount, status")
    .eq("id", id)
    .maybeSingle();

  if (loanError) {
    return NextResponse.json({ error: loanError.message }, { status: 500 });
  }
  if (!loan) {
    return NextResponse.json({ error: "Loan not found" }, { status: 404 });
  }
  if (loan.lender_id !== lender.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: latestReport } = await supabase
    .from("reports")
    .select("credit_score, recommended_loan_amount")
    .eq("merchant_id", loan.merchant_id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const approvedAt = new Date();
  const terms = computeLoanTerms({
    amount: Number(loan.amount),
    creditScore: latestReport?.credit_score ?? null,
    approvedAt,
  });

  const { data: updated, error: updateError } = await supabase
    .from("loans")
    .update({
      status: "approved",
      approved_at: approvedAt.toISOString(),
      mock_repayment_schedule: terms.periods,
      interest_rate: terms.interestRate,
      term_months: terms.termMonths,
      credit_score_at_approval: latestReport?.credit_score ?? null,
      recommended_loan_amount_at_approval: latestReport?.recommended_loan_amount ?? null,
    })
    .eq("id", id)
    .select("id, status, mock_repayment_schedule, interest_rate, term_months")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Failed to approve loan" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    loanId: updated.id,
    status: updated.status,
    mockRepaymentSchedule: updated.mock_repayment_schedule,
    interestRate: updated.interest_rate,
    termMonths: updated.term_months,
    totalRepayment: terms.totalRepayment,
    rationale: terms.rationale,
  });
}
