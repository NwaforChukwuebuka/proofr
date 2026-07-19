import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminSecret = process.env.ADMIN_API_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "Admin approval is not configured on this server" },
      { status: 500 }
    );
  }
  if (request.headers.get("x-admin-secret") !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceRoleSupabaseClient();

  const { data: merchant, error: fetchError } = await supabase
    .from("merchants")
    .select("id, approval_status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("merchants")
    .update({ approval_status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, approval_status")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Failed to approve merchant" },
      { status: 500 }
    );
  }

  // Milestone 4 hook: issue the Monnify reserved virtual account here and
  // persist monnify_account_number / monnify_account_reference on the row.
  const monnifyAccountNumber: string | null = null;

  return NextResponse.json({
    merchantId: updated.id,
    approvalStatus: updated.approval_status,
    monnifyAccountNumber,
  });
}
