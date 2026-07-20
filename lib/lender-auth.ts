import { NextResponse } from "next/server";
import {
  createBrowserSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase";

/**
 * Milestone 12: lender-only auth (as opposed to lib/reports.ts's
 * merchant-or-lender check). Same bearer-token-then-row-lookup pattern used
 * throughout, scoped to `lenders` instead of `merchants` — used by the
 * search and loan routes, where the contract calls for "Auth: lender"
 * specifically, not "merchant or lender."
 */

interface LenderRow {
  id: string;
  auth_user_id: string;
  org_name: string;
}

export async function authenticateAsLender(
  request: Request
): Promise<
  | { error: NextResponse }
  | { supabase: ReturnType<typeof createServiceRoleSupabaseClient>; lender: LenderRow }
> {
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
  const { data: lender, error: lenderError } = await supabase
    .from("lenders")
    .select("id, auth_user_id, org_name")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (lenderError) {
    return { error: NextResponse.json({ error: lenderError.message }, { status: 500 }) };
  }
  if (!lender) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, lender: lender as LenderRow };
}
