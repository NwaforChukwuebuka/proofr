import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared revenue aggregation, factored out of the milestone 6 revenue route
 * so milestone 10's report generation reuses the exact same grossInflow /
 * verifiedRevenue / trend computation rather than duplicating it. See
 * handoff.md milestone 6/8 for why "verified" means "sum excluding
 * transactions with any open fraud_flags row" and why amount is the
 * first-class gross column, not the settlementAmount buried in raw_payload.
 */

export interface TrendPoint {
  period: string;
  amount: number;
}

export interface RevenueSummary {
  grossInflow: number;
  verifiedRevenue: number;
  trend: TrendPoint[];
}

interface TransactionRow {
  id: string;
  amount: number;
  created_at: string;
}

function bucketKey(createdAt: string, granularity: "daily" | "monthly"): string {
  return granularity === "monthly" ? createdAt.slice(0, 7) : createdAt.slice(0, 10);
}

export async function computeRevenueSummary(
  supabase: SupabaseClient,
  merchantId: string,
  granularity: "daily" | "monthly" = "daily"
): Promise<RevenueSummary> {
  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select("id, amount, created_at")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: true });

  if (txError) throw txError;

  const rows = (transactions ?? []) as TransactionRow[];

  const flaggedTransactionIds = new Set<string>();
  if (rows.length > 0) {
    const { data: openFlags, error: flagsError } = await supabase
      .from("fraud_flags")
      .select("transaction_id")
      .eq("status", "open")
      .in("transaction_id", rows.map((r) => r.id));

    if (flagsError) throw flagsError;

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

  return { grossInflow, verifiedRevenue, trend };
}
