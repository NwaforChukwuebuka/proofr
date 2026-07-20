import { NextResponse } from "next/server";
import { authenticateApiClient } from "@/lib/public-api-auth";

/**
 * Milestone 22: GET /api/public/score?phone=<E.164> — the Phase 4 "portable,
 * cross-platform identity" surface from the roadmap. Lets a third-party
 * platform (not a provisioned PROOFR lender) look up a merchant's score by
 * phone number, without that merchant needing an existing relationship with
 * PROOFR's own lender portal.
 *
 * Deliberately narrower than what an authenticated lender sees via
 * GET /api/lenders/search or GET /api/lenders/merchants/:id: only the three
 * summary numbers (confidenceScore, creditScore, recommendedLoanAmount),
 * never revenue figures, score breakdowns, fraud flag detail, or anything
 * else from the full report. A third party with no vetted relationship to
 * this specific merchant gets less than a lender the merchant's own report
 * was shared with.
 *
 * Only `approval_status: "approved"` merchants are queryable — an
 * unapproved/rejected merchant's existence isn't exposed externally.
 *
 * **Known, unresolved product/privacy gap, stated plainly**: this endpoint
 * does not implement per-merchant consent or an opt-out. Any provisioned
 * api_client can query any approved merchant's phone number without that
 * merchant being notified or able to block it. This mirrors how lender
 * search already works internally (any lender can already look up any
 * merchant), extended to external platforms — but the difference in kind
 * (a merchant has no relationship at all with an unknown third-party
 * platform) makes this worth flagging before any real external integration,
 * not something to treat as already resolved. See
 * credit-intelligence-engine.md's "Phase 4" section.
 */

const PHONE_RE = /^\+\d{8,15}$/;

export async function GET(request: Request) {
  const auth = await authenticateApiClient(request);
  if ("error" in auth) return auth.error;
  const { supabase, client } = auth;

  const url = new URL(request.url);
  const phone = url.searchParams.get("phone")?.trim();

  if (!phone || !PHONE_RE.test(phone)) {
    return NextResponse.json(
      { error: "phone is required and must be E.164 format (e.g. +2348012345678)" },
      { status: 400 }
    );
  }

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id, business_name, approval_status")
    .eq("phone", phone)
    .eq("approval_status", "approved")
    .maybeSingle();

  if (merchantError) {
    return NextResponse.json({ error: merchantError.message }, { status: 500 });
  }

  if (!merchant) {
    await supabase.from("api_access_log").insert({
      api_client_id: client.id,
      queried_phone: phone,
      merchant_id: null,
      response_status: 404,
    });
    return NextResponse.json({ error: "No approved merchant found for this phone number" }, { status: 404 });
  }

  const { data: latestReport } = await supabase
    .from("reports")
    .select("confidence_score, credit_score, recommended_loan_amount, generated_at")
    .eq("merchant_id", merchant.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("api_access_log").insert({
    api_client_id: client.id,
    queried_phone: phone,
    merchant_id: merchant.id,
    response_status: 200,
  });

  return NextResponse.json({
    merchantId: merchant.id,
    businessName: merchant.business_name,
    confidenceScore: latestReport?.confidence_score ?? null,
    creditScore: latestReport?.credit_score ?? null,
    recommendedLoanAmount: latestReport?.recommended_loan_amount ?? null,
    scoredAt: latestReport?.generated_at ?? null,
  });
}
