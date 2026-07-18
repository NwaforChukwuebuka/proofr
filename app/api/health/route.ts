import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase";

export async function GET() {
  const supabase = createServiceRoleSupabaseClient();
  const { error, count } = await supabase
    .from("merchants")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, merchants_count: count });
}
