import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase";

type OverrideAction = "clear" | "confirm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  let action: OverrideAction | undefined;
  try {
    const body = (await request.json()) as { action?: string };
    if (body.action === "clear" || body.action === "confirm") {
      action = body.action;
    }
  } catch {
    // no body / invalid JSON — falls through to the 400 below
  }

  if (!action) {
    return NextResponse.json(
      { error: "action must be \"clear\" or \"confirm\"" },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleSupabaseClient();

  const { data: flag, error: fetchError } = await supabase
    .from("fraud_flags")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!flag) {
    return NextResponse.json({ error: "Fraud flag not found" }, { status: 404 });
  }

  // fraud_flags.status only supports open/overridden (data-model.md) but the
  // contract's action is a two-way choice — "clear" means the flag was a
  // false positive/resolved (status -> overridden, which is what actually
  // changes verifiedRevenue/confidence score); "confirm" means the admin
  // agrees it's real fraud, so status stays "open" but reviewed_at is set so
  // it no longer looks unreviewed in the queue. reviewed_by stays null: there
  // is no real admin Supabase Auth user to attribute this to under the
  // ADMIN_API_SECRET shared-secret scheme (see handoff.md's milestone 14 entry).
  const newStatus = action === "clear" ? "overridden" : "open";

  const { data: updated, error: updateError } = await supabase
    .from("fraud_flags")
    .update({ status: newStatus, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, status")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Failed to update fraud flag" },
      { status: 500 }
    );
  }

  return NextResponse.json({ flagId: updated.id, status: updated.status });
}
