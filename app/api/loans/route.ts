import { NextResponse } from "next/server";
import { authenticateAsLender } from "@/lib/lender-auth";

interface CreateLoanBody {
  merchantId?: unknown;
  amount?: unknown;
}

/**
 * Milestone 12. Pragmatic backend home for the lender-facing loan actions in
 * api-contracts.md's "Loans" section — not explicitly a milestone 12 bullet
 * in plan.md, but nothing else owns a backend route for it before milestone
 * 15, and milestone 13's frontend done-when needs it to exist.
 */
export async function POST(request: Request) {
  const auth = await authenticateAsLender(request);
  if ("error" in auth) return auth.error;
  const { supabase, lender } = auth;

  let body: CreateLoanBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { merchantId, amount } = body;
  if (typeof merchantId !== "string" || !merchantId.trim()) {
    return NextResponse.json({ error: "merchantId is required" }, { status: 400 });
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("id", merchantId)
    .maybeSingle();

  if (merchantError) {
    return NextResponse.json({ error: merchantError.message }, { status: 500 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  const { data: loan, error: loanError } = await supabase
    .from("loans")
    .insert({
      merchant_id: merchantId,
      lender_id: lender.id,
      amount,
      status: "pending",
    })
    .select("id, status")
    .single();

  if (loanError || !loan) {
    return NextResponse.json(
      { error: loanError?.message ?? "Failed to create loan" },
      { status: 500 }
    );
  }

  return NextResponse.json({ loanId: loan.id, status: loan.status }, { status: 201 });
}
