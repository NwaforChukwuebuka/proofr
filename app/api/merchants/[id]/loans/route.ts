import { NextResponse } from "next/server";
import {
  createBrowserSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase";
import type { RepaymentPeriod } from "@/lib/repayment";

/**
 * Real gap, found late: `loans_select_by_merchant` (data-model.md) has
 * always let a merchant read their own `loans` rows via RLS, but nothing
 * ever surfaced that to the merchant — milestone 15 was explicitly
 * backend-only ("no dedicated frontend milestone owns this," per its
 * handoff entry), and milestone 16's demo rehearsal that would have caught
 * this was never actually run. A lender approving a loan produced a real
 * row and a real schedule, but the merchant had no way to ever see it.
 *
 * This route exists (rather than reading `loans` directly client-side, the
 * pattern used for `transactions`/`fraud_flags`) because showing the
 * lender's name requires joining `lenders.org_name`, and `lenders` has no
 * RLS policy letting a merchant read an arbitrary lender's row (only
 * `lenders_select_own`, scoped to the lender themselves). Rather than add a
 * new permissive RLS policy exposing lender identities more broadly than
 * necessary, this route uses the service-role client, scoped strictly to
 * the authenticated merchant's own loans — same reasoning
 * `GET /api/merchants/:id/revenue` used for its own RLS gap.
 */

async function authenticateAsOwningMerchant(request: Request, merchantId: string) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return { error: NextResponse.json({ error: "Missing bearer token" }, { status: 401 }) };
  }

  const anonClient = createBrowserSupabaseClient();
  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: "Invalid or expired token" }, { status: 401 }) };
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id, auth_user_id")
    .eq("id", merchantId)
    .maybeSingle();

  if (merchantError) {
    return { error: NextResponse.json({ error: merchantError.message }, { status: 500 }) };
  }
  if (!merchant) {
    return { error: NextResponse.json({ error: "Merchant not found" }, { status: 404 }) };
  }
  if (merchant.auth_user_id !== userData.user.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { supabase };
}

interface LoanRow {
  id: string;
  amount: number;
  status: string;
  interest_rate: number | null;
  term_months: number | null;
  mock_repayment_schedule: RepaymentPeriod[] | null;
  created_at: string;
  approved_at: string | null;
  lenders: { org_name: string } | { org_name: string }[] | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateAsOwningMerchant(request, id);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("loans")
    .select(
      "id, amount, status, interest_rate, term_months, mock_repayment_schedule, created_at, approved_at, lenders(org_name)"
    )
    .eq("merchant_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const loans = (data as unknown as LoanRow[]).map((loan) => {
    const lender = Array.isArray(loan.lenders) ? loan.lenders[0] : loan.lenders;
    return {
      loanId: loan.id,
      lenderOrgName: lender?.org_name ?? null,
      amount: loan.amount,
      status: loan.status,
      interestRate: loan.interest_rate,
      termMonths: loan.term_months,
      mockRepaymentSchedule: loan.mock_repayment_schedule,
      createdAt: loan.created_at,
      approvedAt: loan.approved_at,
    };
  });

  return NextResponse.json(loans);
}
