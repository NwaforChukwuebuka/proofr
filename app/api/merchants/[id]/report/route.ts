import { NextResponse } from "next/server";
import {
  createBrowserSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase";
import { computeRevenueSummary } from "@/lib/revenue";
import { computeConfidenceScore, type FlagForScoring } from "@/lib/confidence";
import type { RuleType } from "@/lib/fraud";

/**
 * Milestone 10: Proof-of-Revenue report generation. Assembles the milestone
 * 6 revenue summary, the milestone 8 fraud flags, and a confidence score
 * (lib/confidence.ts — see that file for the flag-grouping decision) into a
 * `reports` snapshot row.
 */

interface OpenFlagRow {
  id: string;
  transaction_id: string;
  rule_type: RuleType;
  severity: string;
  status: string;
  created_at: string;
  transactions: {
    payer_account: string | null;
    amount: number;
  } | null;
}

async function authenticateAsOwningMerchant(
  request: Request,
  merchantId: string
) {
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
    .select("id, auth_user_id, business_name, bvn_nin_verified, approval_status, monnify_account_number")
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

  return { supabase, merchant };
}

async function fetchOpenFlagsForMerchant(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  merchantId: string
) {
  const { data, error } = await supabase
    .from("fraud_flags")
    .select(
      "id, transaction_id, rule_type, severity, status, created_at, transactions!inner(payer_account, amount, merchant_id)"
    )
    .eq("status", "open")
    .eq("transactions.merchant_id", merchantId);

  if (error) throw error;
  return (data ?? []) as unknown as OpenFlagRow[];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await authenticateAsOwningMerchant(request, id);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  try {
    const [revenueSummary, openFlags] = await Promise.all([
      computeRevenueSummary(supabase, id, "daily"),
      fetchOpenFlagsForMerchant(supabase, id),
    ]);

    const scoringInput: FlagForScoring[] = openFlags.map((f) => ({
      rule_type: f.rule_type,
      payer_account: f.transactions?.payer_account ?? null,
      amount: Number(f.transactions?.amount ?? 0),
    }));
    const confidenceScore = computeConfidenceScore(scoringInput);

    const fraudFlagsSnapshot = openFlags.map((f) => ({
      id: f.id,
      transaction_id: f.transaction_id,
      rule_type: f.rule_type,
      severity: f.severity,
      status: f.status,
      created_at: f.created_at,
      payer_account: f.transactions?.payer_account ?? null,
      amount: f.transactions?.amount ?? null,
    }));

    const { grossInflow, verifiedRevenue, trend } = revenueSummary;

    const { data: report, error: insertError } = await supabase
      .from("reports")
      .insert({
        merchant_id: id,
        revenue_summary: { grossInflow, verifiedRevenue },
        trend_data: trend,
        confidence_score: confidenceScore,
        fraud_flags_snapshot: fraudFlagsSnapshot,
      })
      .select("id, generated_at")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ reportId: report.id, generatedAt: report.generated_at });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Auth for the merchant path is the same bearer-token-owns-the-record check
 * used everywhere else. There is no lender auth system yet (milestone 12),
 * so per api-contracts.md's "lender with a valid share link/report ID": a
 * request that supplies ?reportId=<uuid> is treated as authenticated by
 * knowledge of that unguessable UUID alone, with no merchant bearer token
 * required. This is a deliberate placeholder, not a real share-link
 * mechanism — see handoff.md for what a real implementation would need
 * (a signed/expiring token, not a bare row id).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const reportId = url.searchParams.get("reportId");

  const supabase = createServiceRoleSupabaseClient();

  if (!reportId) {
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

    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id, auth_user_id, business_name, bvn_nin_verified, approval_status, monnify_account_number")
      .eq("id", id)
      .maybeSingle();

    if (merchantError) {
      return NextResponse.json({ error: merchantError.message }, { status: 500 });
    }
    if (!merchant) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
    }

    let isAuthorized = merchant.auth_user_id === userData.user.id;
    if (!isAuthorized) {
      const { data: lender } = await supabase
        .from("lenders")
        .select("id")
        .eq("auth_user_id", userData.user.id)
        .maybeSingle();
      isAuthorized = !!lender;
    }
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: latestReport, error: reportError } = await supabase
      .from("reports")
      .select("id, revenue_summary, trend_data, confidence_score, fraud_flags_snapshot, generated_at")
      .eq("merchant_id", id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reportError) {
      return NextResponse.json({ error: reportError.message }, { status: 500 });
    }
    if (!latestReport) {
      return NextResponse.json({ error: "No report generated yet" }, { status: 404 });
    }

    return buildReportResponse(merchant, latestReport);
  }

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, merchant_id, revenue_summary, trend_data, confidence_score, fraud_flags_snapshot, generated_at")
    .eq("id", reportId)
    .maybeSingle();

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 });
  }
  if (!report || report.merchant_id !== id) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id, business_name, bvn_nin_verified, approval_status, monnify_account_number")
    .eq("id", id)
    .maybeSingle();

  if (merchantError) {
    return NextResponse.json({ error: merchantError.message }, { status: 500 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  return buildReportResponse(merchant, report);
}

function buildReportResponse(
  merchant: {
    business_name: string;
    bvn_nin_verified: boolean;
    approval_status: string;
    monnify_account_number: string | null;
  },
  report: {
    revenue_summary: { grossInflow: number; verifiedRevenue: number };
    trend_data: unknown;
    confidence_score: number;
    fraud_flags_snapshot: unknown;
    generated_at: string;
  }
) {
  return NextResponse.json({
    profile: {
      businessName: merchant.business_name,
      approvalStatus: merchant.approval_status,
      hasVirtualAccount: !!merchant.monnify_account_number,
    },
    verificationStatus: {
      bvnNinVerified: merchant.bvn_nin_verified,
    },
    revenueSummary: report.revenue_summary,
    trendData: report.trend_data,
    confidenceScore: report.confidence_score,
    fraudFlags: report.fraud_flags_snapshot,
    generatedAt: report.generated_at,
  });
}
