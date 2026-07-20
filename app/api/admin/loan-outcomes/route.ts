import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase";
import type { RepaymentPeriod } from "@/lib/repayment";

/**
 * Milestone 21: outcome-tracking infrastructure. Not a recalibration of
 * lib/creditScore.ts / lib/loanRecommendation.ts / lib/loanTerms.ts — every
 * loan today is still lib/repayment.ts's simulated deduction, not a real
 * disbursement, so there is no real-world outcome to recalibrate against
 * yet (see credit-intelligence-engine.md's non-goals note). This endpoint
 * exists so that pairing (what the model predicted at approval time) with
 * (what actually happened to the loan) is a query away the moment real
 * outcomes do exist, instead of a data-modeling exercise done from scratch
 * at that point.
 *
 * `outcome` is derived, not stored — computed fresh from
 * mock_repayment_schedule's due dates vs now on every request, so it never
 * goes stale the way a cached status would.
 */

function checkAdminSecret(request: Request): NextResponse | null {
  const adminSecret = process.env.ADMIN_API_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "Admin access is not configured on this server" },
      { status: 500 }
    );
  }
  if (request.headers.get("x-admin-secret") !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

type Outcome = "repaid_full" | "delinquent" | "in_progress" | "not_yet_approved";

function deriveOutcome(status: string, schedule: RepaymentPeriod[] | null): Outcome {
  if (status === "repaid") return "repaid_full";
  if (status === "pending") return "not_yet_approved";

  const now = Date.now();
  const hasOverdueUnpaid = (schedule ?? []).some(
    (p) => p.status !== "paid" && new Date(p.dueDate).getTime() < now
  );
  return hasOverdueUnpaid ? "delinquent" : "in_progress";
}

export async function GET(request: Request) {
  const authError = checkAdminSecret(request);
  if (authError) return authError;

  const supabase = createServiceRoleSupabaseClient();

  const { data, error } = await supabase
    .from("loans")
    .select(
      "id, merchant_id, amount, status, interest_rate, term_months, credit_score_at_approval, recommended_loan_amount_at_approval, mock_repayment_schedule, created_at, approved_at, merchants!inner(business_name)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const outcomes = (data ?? []).map((row) => {
    const merchant = Array.isArray(row.merchants) ? row.merchants[0] : row.merchants;
    const schedule = (row.mock_repayment_schedule as RepaymentPeriod[] | null) ?? null;

    return {
      loanId: row.id,
      merchantId: row.merchant_id,
      businessName: merchant?.business_name ?? null,
      amount: row.amount,
      status: row.status,
      outcome: deriveOutcome(row.status, schedule),
      predicted: {
        creditScoreAtApproval: row.credit_score_at_approval,
        recommendedLoanAmountAtApproval: row.recommended_loan_amount_at_approval,
        interestRate: row.interest_rate,
        termMonths: row.term_months,
      },
      actual: {
        amountApproved: row.amount,
        amountRecommendedDelta:
          row.recommended_loan_amount_at_approval !== null
            ? Number(row.amount) - Number(row.recommended_loan_amount_at_approval)
            : null,
      },
      createdAt: row.created_at,
      approvedAt: row.approved_at,
    };
  });

  return NextResponse.json(outcomes);
}
