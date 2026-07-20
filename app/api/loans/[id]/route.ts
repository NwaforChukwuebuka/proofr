import { NextResponse } from "next/server";
import { authenticateAsLender } from "@/lib/lender-auth";

/**
 * Milestone 15. Additive extension beyond the frozen api-contracts.md
 * "Loans" section — no `GET /api/loans/:id` existed before this, and
 * nothing let anyone re-fetch a loan's state after approval to observe
 * repayment progress. Same pragmatic-addition pattern as milestone 6's
 * `?granularity` or milestone 11's `reportId` field. Lender-only auth,
 * scoped to the loan's own lender, matching the same check
 * `POST /api/loans/:id/approve` already does per data-model.md's RLS intent.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await authenticateAsLender(request);
  if ("error" in auth) return auth.error;
  const { supabase, lender } = auth;

  const { data: loan, error } = await supabase
    .from("loans")
    .select(
      "id, lender_id, status, mock_repayment_schedule, interest_rate, term_months, credit_score_at_approval, recommended_loan_amount_at_approval"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!loan) {
    return NextResponse.json({ error: "Loan not found" }, { status: 404 });
  }
  if (loan.lender_id !== lender.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    loanId: loan.id,
    status: loan.status,
    mockRepaymentSchedule: loan.mock_repayment_schedule,
    interestRate: loan.interest_rate,
    termMonths: loan.term_months,
    creditScoreAtApproval: loan.credit_score_at_approval,
    recommendedLoanAmountAtApproval: loan.recommended_loan_amount_at_approval,
  });
}
