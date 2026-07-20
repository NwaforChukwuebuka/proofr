import { NextResponse } from "next/server";
import { authenticateAsLender } from "@/lib/lender-auth";
import { generateRawApiKey, hashApiKey } from "@/lib/public-api-auth";

/**
 * Milestone 24: lets a lender self-serve provision their own api_clients row
 * for GET /api/public/score, rather than needing scripts/provision-api-client.ts
 * run on their behalf. Same underlying table and auth check as milestone
 * 22's third-party clients — a lender-generated key authenticates against
 * GET /api/public/score exactly like a manually-provisioned one.
 */

interface ApiKeyRow {
  id: string;
  name: string;
  key_preview: string | null;
  created_at: string;
  revoked_at: string | null;
}

export async function GET(request: Request) {
  const auth = await authenticateAsLender(request);
  if ("error" in auth) return auth.error;
  const { supabase, lender } = auth;

  const { data, error } = await supabase
    .from("api_clients")
    .select("id, name, key_preview, created_at, revoked_at")
    .eq("lender_id", lender.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const keys = (data as ApiKeyRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    keyPreview: row.key_preview,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }));

  return NextResponse.json(keys);
}

export async function POST(request: Request) {
  const auth = await authenticateAsLender(request);
  if ("error" in auth) return auth.error;
  const { supabase, lender } = auth;

  let name = `${lender.org_name} key`;
  try {
    const body = await request.json();
    if (body && typeof body.name === "string" && body.name.trim()) {
      name = body.name.trim();
    }
  } catch {
    // no body / non-JSON body — fall back to the default name above
  }

  const { rawKey, preview } = generateRawApiKey();

  const { data, error } = await supabase
    .from("api_clients")
    .insert({
      name,
      lender_id: lender.id,
      api_key_hash: hashApiKey(rawKey),
      key_preview: preview,
    })
    .select("id, name, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    name: data.name,
    keyPreview: preview,
    createdAt: data.created_at,
    apiKey: rawKey,
  });
}
