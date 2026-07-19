import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase";
import { createReservedAccount } from "@/lib/monnify";

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
    .select(
      "id, approval_status, business_name, email, monnify_account_number, monnify_account_reference"
    )
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  // Idempotency: an already-approved merchant with an issued account should
  // not get a second Monnify reserved account on re-approval.
  if (merchant.approval_status === "approved" && merchant.monnify_account_number) {
    return NextResponse.json({
      merchantId: merchant.id,
      approvalStatus: merchant.approval_status,
      monnifyAccountNumber: merchant.monnify_account_number,
    });
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
  let monnifyAccountNumber: string | null = null;
  let monnifyError: string | undefined;

  try {
    const account = await createReservedAccount({
      accountReference: `PROOFR-${merchant.id}`,
      accountName: merchant.business_name,
      customerEmail: merchant.email,
      customerName: merchant.business_name,
    });

    monnifyAccountNumber = account.accountNumber;

    const { error: monnifyUpdateError } = await supabase
      .from("merchants")
      .update({
        monnify_account_number: account.accountNumber,
        monnify_account_reference: account.reservationReference,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (monnifyUpdateError) {
      monnifyError = `Account created but failed to persist: ${monnifyUpdateError.message}`;
      monnifyAccountNumber = null;
    }
  } catch (err) {
    // Approval itself already succeeded above — surface the Monnify
    // failure explicitly rather than hiding it behind a generic 500.
    monnifyError = err instanceof Error ? err.message : "Monnify account issuance failed";
  }

  return NextResponse.json({
    merchantId: updated.id,
    approvalStatus: updated.approval_status,
    monnifyAccountNumber,
    ...(monnifyError ? { monnifyError } : {}),
  });
}
