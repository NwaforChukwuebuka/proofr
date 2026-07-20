import { NextResponse } from "next/server";
import { authenticateAsLender } from "@/lib/lender-auth";

/**
 * Milestone 12. `query` matches business_name (case-insensitive, partial)
 * or an exact merchant id (when `query` is a valid UUID) — covers
 * api-contracts.md's "by name/ID" in one endpoint.
 *
 * `confidenceScore`: not a merchants column — it only exists on a generated
 * `reports` row. A merchant with no report yet has no score to report.
 * Decision: include the merchant with `confidenceScore: null` rather than
 * omitting them or defaulting to a number (100 would misrepresent "never
 * scored" as "scored perfectly clean") — the lender UI (milestone 13) can
 * render null as "not yet scored." Uses each merchant's most recently
 * generated report (`order by generated_at desc`, first row per merchant
 * id kept in JS) rather than a live-recomputed score, matching how
 * GET /api/merchants/:id/report also serves the last-generated snapshot.
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
    const latestScoreByMerchant = new Map<string, number>();

    if (merchantIds.length > 0) {
      const { data: reports, error: reportsError } = await supabase
        .from("reports")
        .select("merchant_id, confidence_score, generated_at")
        .in("merchant_id", merchantIds)
        .order("generated_at", { ascending: false });
      if (reportsError) throw reportsError;
      for (const r of reports ?? []) {
        if (!latestScoreByMerchant.has(r.merchant_id)) {
          latestScoreByMerchant.set(r.merchant_id, r.confidence_score);
        }
      }
    }

    const results = [...merchantsById.values()].map((m) => ({
      merchantId: m.id,
      businessName: m.business_name,
      confidenceScore: latestScoreByMerchant.get(m.id) ?? null,
    }));

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
