import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase";

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

export async function GET(request: Request) {
  const authError = checkAdminSecret(request);
  if (authError) return authError;

  const supabase = createServiceRoleSupabaseClient();

  // api-contracts.md's shape doesn't include enough context for a human to
  // decide clear vs. confirm, so this joins in transaction amount/payer and
  // merchant business name alongside the frozen fields — see integration.md.
  const { data, error } = await supabase
    .from("fraud_flags")
    .select(
      "id, rule_type, severity, created_at, transactions!inner(id, amount, payer_name, merchant_id, merchants!inner(id, business_name))"
    )
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const queue = (data ?? []).map((row) => {
    const transaction = Array.isArray(row.transactions)
      ? row.transactions[0]
      : row.transactions;
    const merchant = Array.isArray(transaction.merchants)
      ? transaction.merchants[0]
      : transaction.merchants;

    return {
      flagId: row.id,
      transactionId: transaction.id,
      merchantId: transaction.merchant_id,
      ruleType: row.rule_type,
      severity: row.severity,
      createdAt: row.created_at,
      amount: transaction.amount,
      payerName: transaction.payer_name,
      businessName: merchant.business_name,
    };
  });

  return NextResponse.json(queue);
}
