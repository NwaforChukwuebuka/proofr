import { NextResponse } from "next/server";
import {
  createBrowserSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase";

/**
 * Milestone 6: gross inflow / trend for a merchant. Milestone 8: verified
 * revenue now actually excludes fraud-flagged transactions.
 *
 * "Gross inflow" is the unfiltered sum of transactions.amount (Monnify's
 * gross amountPaid). "Verified revenue" excludes any transaction with an
 * open fraud_flags row, regardless of severity — per fraud-rules.md, all
 * four rules are high or medium severity, so "open, high or medium" and
 * "any open flag" are the same filter today; this route implements it as
 * "any open flag" (rather than hardcoding a severity list) so it stays
 * correct without a code change if a future rule is ever added at "low"
 * severity and deliberately excluded. Overridden flags (status:
 * "overridden", set by milestone 14's admin override — not built yet) do
 * not exclude a transaction.
 */

interface TransactionRow {
  id: string;
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
    .select("id, amount, created_at")
    .eq("merchant_id", id)
    .order("created_at", { ascending: true });

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  const rows = (transactions ?? []) as TransactionRow[];

  const flaggedTransactionIds = new Set<string>();
  if (rows.length > 0) {
    const { data: openFlags, error: flagsError } = await supabase
      .from("fraud_flags")
      .select("transaction_id")
      .eq("status", "open")
      .in("transaction_id", rows.map((r) => r.id));

    if (flagsError) {
      return NextResponse.json({ error: flagsError.message }, { status: 500 });
    }

    for (const f of openFlags ?? []) {
      flaggedTransactionIds.add(f.transaction_id as string);
    }
  }

  let grossInflow = 0;
  let verifiedRevenue = 0;
  const trendMap = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.amount);
    grossInflow += amount;
    if (!flaggedTransactionIds.has(row.id)) {
      verifiedRevenue += amount;
    }
    const key = bucketKey(row.created_at, granularity);
    trendMap.set(key, (trendMap.get(key) ?? 0) + amount);
  }

  const trend = Array.from(trendMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([period, amount]) => ({ period, amount }));

  return NextResponse.json({ grossInflow, verifiedRevenue, trend });
}
