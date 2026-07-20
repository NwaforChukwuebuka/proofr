import { NextResponse } from "next/server";
import { authenticateAsLender } from "@/lib/lender-auth";

/**
 * Milestone 12/15. The schedule *shape* (3 even monthly periods, no
 * interest/fees) is still built here at approval time — that part was never
 * the placeholder. What milestone 12 explicitly left as a placeholder, and
 * milestone 15's lib/repayment.ts now replaces, is the progress tracking:
 * each period starts "pending" with paidAmount 0 and is only ever advanced
 * by lib/repayment.ts's applyRepaymentDeductions, called from the webhook
 * route as real merchant revenue arrives — never by elapsed time.
 */
const MOCK_REPAYMENT_PERIODS = 3;

function buildMockRepaymentSchedule(amount: number, approvedAt: Date) {
  const perPeriod = Math.round((amount / MOCK_REPAYMENT_PERIODS) * 100) / 100;
  return Array.from({ length: MOCK_REPAYMENT_PERIODS }, (_, i) => {
    const dueDate = new Date(approvedAt);
    dueDate.setMonth(dueDate.getMonth() + i + 1);
    return {
      period: i + 1,
      amount: perPeriod,
      dueDate: dueDate.toISOString(),
      status: "pending" as const,
      paidAmount: 0,
      paidAt: null as string | null,
    };
  });
}

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
    .select("id, lender_id, amount, status")
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

  const approvedAt = new Date();
  const mockRepaymentSchedule = buildMockRepaymentSchedule(Number(loan.amount), approvedAt);

  const { data: updated, error: updateError } = await supabase
    .from("loans")
    .update({
      status: "approved",
      approved_at: approvedAt.toISOString(),
      mock_repayment_schedule: mockRepaymentSchedule,
    })
    .eq("id", id)
    .select("id, status, mock_repayment_schedule")
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
  });
}
