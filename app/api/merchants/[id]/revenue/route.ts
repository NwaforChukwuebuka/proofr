import { NextResponse } from "next/server";
import {
  createBrowserSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase";

/**
 * Milestone 6: gross inflow / verified revenue / trend for a merchant.
 *
 * "Verified revenue" == "gross inflow" for now: both sum transactions.amount
 * (Monnify's gross amountPaid, not the fee-adjusted settlementAmount buried
 * in raw_payload). The fraud rule engine (milestone 8) doesn't exist yet, so
 * there's nothing in fraud_flags to exclude — see handoff.md milestone 6
 * entry for the full reasoning and what milestone 8 should revisit.
 */

interface TransactionRow {
  amount: number;
  created_at: string;
}

function bucketKey(createdAt: string, granularity: "daily" | "monthly"): string {
  // created_at is a Postgres timestamptz ISO string; slice gives a stable
  // UTC-based bucket key without pulling in a date library.
  return granularity === "monthly" ? createdAt.slice(0, 7) : createdAt.slice(0, 10);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const anonClient = createBrowserSupabaseClient();
  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const supabase = createServiceRoleSupabaseClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id, auth_user_id")
    .eq("id", id)
    .maybeSingle();

  if (merchantError) {
    return NextResponse.json({ error: merchantError.message }, { status: 500 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  const isOwningMerchant = merchant.auth_user_id === userData.user.id;
  let isLender = false;
  if (!isOwningMerchant) {
    const { data: lender, error: lenderError } = await supabase
      .from("lenders")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (lenderError) {
      return NextResponse.json({ error: lenderError.message }, { status: 500 });
    }
    isLender = !!lender;
  }

  if (!isOwningMerchant && !isLender) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const granularity = url.searchParams.get("granularity") === "monthly" ? "monthly" : "daily";

  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select("amount, created_at")
    .eq("merchant_id", id)
    .order("created_at", { ascending: true });

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  const rows = (transactions ?? []) as TransactionRow[];

  let grossInflow = 0;
  const trendMap = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.amount);
    grossInflow += amount;
    const key = bucketKey(row.created_at, granularity);
    trendMap.set(key, (trendMap.get(key) ?? 0) + amount);
  }

  // No fraud screening exists yet (milestone 8) — verified revenue is
  // identical to gross inflow until fraud_flags has real data to exclude.
  const verifiedRevenue = grossInflow;

  const trend = Array.from(trendMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([period, amount]) => ({ period, amount }));

  return NextResponse.json({ grossInflow, verifiedRevenue, trend });
}
