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

  return NextResponse.json({
    ok: true,
    merchants_count: count,
    // Render sets this automatically per deploy — lets us confirm exactly
    // which commit is actually running instead of trusting the dashboard's
    // "Deployed" label, which can lag or mislead when diagnosing a
    // suspected stale-build issue (see handoff.md milestone 19 entry).
    gitCommit: process.env.RENDER_GIT_COMMIT ?? null,
  });
}
