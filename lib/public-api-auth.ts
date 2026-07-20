import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase";

/**
 * Milestone 22: API-key auth for third-party platforms, distinct from
 * lib/lender-auth.ts's Supabase-session-based lender auth. Third parties
 * calling GET /api/public/score are not PROOFR lenders (no Supabase Auth
 * user, no `lenders` row) — they're external platforms provisioned via
 * scripts/provision-api-client.ts. A raw key is never stored; only its
 * SHA-256 hash is compared against `api_clients.api_key_hash`.
 */

interface ApiClientRow {
  id: string;
  name: string;
}

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

function generateRawApiKey(): { rawKey: string; preview: string } {
  const rawKey = `proofr_pk_${randomBytes(24).toString("hex")}`;
  const preview = `${rawKey.slice(0, 14)}…${rawKey.slice(-4)}`;
  return { rawKey, preview };
}

export async function authenticateApiClient(
  request: Request
): Promise<
  | { error: NextResponse }
  | { supabase: ReturnType<typeof createServiceRoleSupabaseClient>; client: ApiClientRow }
> {
  const rawKey = request.headers.get("x-api-key");
  if (!rawKey) {
    return { error: NextResponse.json({ error: "Missing x-api-key header" }, { status: 401 }) };
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data: client, error } = await supabase
    .from("api_clients")
    .select("id, name")
    .eq("api_key_hash", hashApiKey(rawKey))
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!client) {
    return { error: NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 }) };
  }

  return { supabase, client: client as ApiClientRow };
}

export { hashApiKey, generateRawApiKey };
