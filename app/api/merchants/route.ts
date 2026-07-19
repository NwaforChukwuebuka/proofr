import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase";
import { mockVerifyBvnNin } from "@/lib/kyc";

interface SignupBody {
  phone?: unknown;
  email?: unknown;
  password?: unknown;
  businessName?: unknown;
  bvnOrNin?: unknown;
}

export async function POST(request: Request) {
  let body: SignupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const { phone, email, password, businessName, bvnOrNin } = body;

  if (
    typeof phone !== "string" ||
    !phone.trim() ||
    typeof email !== "string" ||
    !email.trim() ||
    typeof password !== "string" ||
    !password ||
    typeof businessName !== "string" ||
    !businessName.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "phone, email, password, and businessName are all required and must be non-empty strings",
      },
      { status: 400 }
    );
  }

  if (bvnOrNin !== undefined && typeof bvnOrNin !== "string") {
    return NextResponse.json(
      { error: "bvnOrNin must be a string if provided" },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleSupabaseClient();

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      phone,
      email_confirm: true,
    });

  if (authError || !authData.user) {
    const status = authError?.status && authError.status >= 400 && authError.status < 500
      ? authError.status
      : 400;
    return NextResponse.json(
      { error: authError?.message ?? "Failed to create auth user" },
      { status }
    );
  }

  const kyc = bvnOrNin ? mockVerifyBvnNin(bvnOrNin as string) : null;

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .insert({
      auth_user_id: authData.user.id,
      business_name: businessName,
      phone,
      email,
      approval_status: "pending",
      bvn_nin_verified: kyc?.verified ?? false,
      kyc_reference: kyc?.reference ?? null,
    })
    .select("id, approval_status")
    .single();

  if (merchantError || !merchant) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json(
      { error: merchantError?.message ?? "Failed to create merchant record" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { merchantId: merchant.id, approvalStatus: merchant.approval_status },
    { status: 201 }
  );
}
