import { NextResponse } from "next/server";
import {
  createBrowserSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase";

/**
 * Milestone 23: closes the consent gap milestone 22 shipped with — a merchant
 * grants or revokes their own visibility to GET /api/public/score. Merchant-
 * owner-only auth (same bearer-token-owns-the-record pattern as
 * app/api/merchants/[id]/report/route.ts) — no lender or third-party path,
 * since this is squarely the merchant's own decision.
 *
 * `public_api_consent_at` (see supabase/migrations/0011_public_api_consent.sql)
 * is `null` by default for every merchant, including everyone who signed up
 * before this milestone — nobody is retroactively opted in. Granting sets it
 * to the current timestamp (when consent was given, useful if this is ever
 * audited); revoking sets it back to `null`. GET /api/public/score filters
 * on this being non-null in addition to `approval_status: "approved"`.
 */

async function authenticateAsOwningMerchant(request: Request, merchantId: string) {
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
    .select("id, auth_user_id, public_api_consent_at")
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateAsOwningMerchant(request, id);
  if ("error" in auth) return auth.error;

  return NextResponse.json({
    consentGranted: auth.merchant.public_api_consent_at !== null,
    consentedAt: auth.merchant.public_api_consent_at,
  });
}

interface ConsentBody {
  consent?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateAsOwningMerchant(request, id);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: ConsentBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (typeof body.consent !== "boolean") {
    return NextResponse.json({ error: "consent must be a boolean" }, { status: 400 });
  }

  const consentedAt = body.consent ? new Date().toISOString() : null;

  const { data: updated, error: updateError } = await supabase
    .from("merchants")
    .update({ public_api_consent_at: consentedAt })
    .eq("id", id)
    .select("public_api_consent_at")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Failed to update consent" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    consentGranted: updated.public_api_consent_at !== null,
    consentedAt: updated.public_api_consent_at,
  });
}
