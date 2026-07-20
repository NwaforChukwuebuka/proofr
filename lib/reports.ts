import { NextResponse } from "next/server";
import {
  createBrowserSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase";

/**
 * Milestone 12: pulled out of app/api/merchants/[id]/report/route.ts's GET
 * handler so GET /api/lenders/merchants/:id can call the exact same
 * bearer-token-owns-the-record-or-lender logic (per api-contracts.md: "same
 * shape as GET /api/merchants/:id/report") instead of reimplementing it, per
 * milestone 10's handoff seam note. Both routes now share this one code
 * path — auth here is not re-gated differently for the lender route.
 */

interface MerchantForReport {
  id: string;
  auth_user_id: string;
  business_name: string;
  bvn_nin_verified: boolean;
  approval_status: string;
  monnify_account_number: string | null;
}

interface ReportRow {
  id: string;
  revenue_summary: { grossInflow: number; verifiedRevenue: number };
  trend_data: unknown;
  confidence_score: number;
  fraud_flags_snapshot: unknown;
  generated_at: string;
}

export async function getLatestReportForBearerToken(
  request: Request,
  merchantId: string
): Promise<NextResponse> {
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
    .select("id, auth_user_id, business_name, bvn_nin_verified, approval_status, monnify_account_number")
    .eq("id", merchantId)
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
    .eq("merchant_id", merchantId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 });
  }
  if (!latestReport) {
    return NextResponse.json({ error: "No report generated yet" }, { status: 404 });
  }

  return buildReportResponse(merchant as MerchantForReport, latestReport as ReportRow);
}

export function buildReportResponse(
  merchant: {
    business_name: string;
    bvn_nin_verified: boolean;
    approval_status: string;
    monnify_account_number: string | null;
  },
  report: ReportRow
): NextResponse {
  return NextResponse.json({
    reportId: report.id,
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
