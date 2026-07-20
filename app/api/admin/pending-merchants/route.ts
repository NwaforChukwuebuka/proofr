import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase";

function checkAdminSecret(request: Request): NextResponse | null {
  const adminSecret = process.env.ADMIN_API_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "Admin access is not configured on this server" },
      { status: 500 }
    );
  }
  if (request.headers.get("x-admin-secret") !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const authError = checkAdminSecret(request);
  if (authError) return authError;

  const supabase = createServiceRoleSupabaseClient();

  const { data, error } = await supabase
    .from("merchants")
    .select(
      "id, business_name, email, phone, bvn_nin_verified, kyc_reference, business_started_at, created_at"
    )
    .eq("approval_status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const merchants = (data ?? []).map((row) => ({
    merchantId: row.id,
    businessName: row.business_name,
    email: row.email,
    phone: row.phone,
    kycVerified: row.bvn_nin_verified,
    kycReference: row.kyc_reference,
    businessStartedAt: row.business_started_at,
    createdAt: row.created_at,
  }));

  return NextResponse.json(merchants);
}
