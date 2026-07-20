import { NextResponse } from "next/server";
import { authenticateAsLender } from "@/lib/lender-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAsLender(request);
  if ("error" in auth) return auth.error;
  const { supabase, lender } = auth;

  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("api_clients")
    .select("id, lender_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing || existing.lender_id !== lender.id) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("api_clients")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, revoked_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ id: updated.id, revokedAt: updated.revoked_at });
}
