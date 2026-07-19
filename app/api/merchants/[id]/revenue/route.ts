import { NextResponse } from "next/server";
import {
  createBrowserSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase";
import { computeRevenueSummary } from "@/lib/revenue";

/**
 * Milestone 6: gross inflow / trend for a merchant. Milestone 8: verified
 * revenue now actually excludes fraud-flagged transactions. Milestone 10:
 * the actual aggregation moved to lib/revenue.ts (computeRevenueSummary) so
 * report generation reuses the identical logic instead of duplicating it —
 * this route is now just auth + the granularity param + the call.
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

  try {
    const summary = await computeRevenueSummary(supabase, id, granularity);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
