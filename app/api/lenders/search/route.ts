import { NextResponse } from "next/server";
import { authenticateAsLender } from "@/lib/lender-auth";

/**
 * Milestone 12. `query` matches business_name (case-insensitive, partial)
 * or an exact merchant id (when `query` is a valid UUID) — covers
 * api-contracts.md's "by name/ID" in one endpoint.
 *
 * `confidenceScore`/`creditScore`: not merchants columns — they only exist
 * on a generated `reports` row. A merchant with no report yet has no score
 * to report. Decision: include the merchant with both scores `null` rather
 * than omitting them or defaulting to a number (100 would misrepresent
 * "never scored" as "scored perfectly clean") — the lender UI (milestone
 * 13, extended milestone 17) can render null as "not yet scored." Uses
 * each merchant's most recently generated report (`order by generated_at
 * desc`, first row per merchant id kept in JS) rather than a
 * live-recomputed score, matching how GET /api/merchants/:id/report also
 * serves the last-generated snapshot. `creditScore` (milestone 17) is the
 * repayment-likelihood signal — see credit-intelligence-engine.md —
 * distinct from `confidenceScore`'s fraud-only signal; both are surfaced
 * so a lender isn't shown just the narrower figure.
 *
 * Merchant lookup is two separate parameterized queries (ilike + eq)
 * merged in JS, not a single .or() filter string, so a query containing
 * commas/parens can't be interpreted as extra PostgREST filter syntax.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await authenticateAsLender(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const merchantsById = new Map<string, { id: string; business_name: string }>();

    const { data: byName, error: byNameError } = await supabase
      .from("merchants")
      .select("id, business_name")
      .ilike("business_name", `%${query}%`)
      .limit(25);
    if (byNameError) throw byNameError;
    for (const m of byName ?? []) merchantsById.set(m.id, m);

    if (UUID_RE.test(query)) {
      const { data: byId, error: byIdError } = await supabase
        .from("merchants")
        .select("id, business_name")
        .eq("id", query)
        .maybeSingle();
      if (byIdError) throw byIdError;
      if (byId) merchantsById.set(byId.id, byId);
    }

    const merchantIds = [...merchantsById.keys()];
    const latestScoresByMerchant = new Map<
      string,
      { confidenceScore: number; creditScore: number | null }
    >();

    if (merchantIds.length > 0) {
      const { data: reports, error: reportsError } = await supabase
        .from("reports")
        .select("merchant_id, confidence_score, credit_score, generated_at")
        .in("merchant_id", merchantIds)
        .order("generated_at", { ascending: false });
      if (reportsError) throw reportsError;
      for (const r of reports ?? []) {
        if (!latestScoresByMerchant.has(r.merchant_id)) {
          latestScoresByMerchant.set(r.merchant_id, {
            confidenceScore: r.confidence_score,
            creditScore: r.credit_score,
          });
        }
      }
    }

    const results = [...merchantsById.values()].map((m) => {
      const scores = latestScoresByMerchant.get(m.id);
      return {
        merchantId: m.id,
        businessName: m.business_name,
        confidenceScore: scores?.confidenceScore ?? null,
        creditScore: scores?.creditScore ?? null,
      };
    });

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
