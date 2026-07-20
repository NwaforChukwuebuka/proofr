import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Grading/docs helper: exchange email + password for a Supabase access token.
 * Uses the public anon key already configured on the server — graders never
 * need NEXT_PUBLIC_SUPABASE_URL / ANON_KEY.
 *
 * POST /api/auth/login
 * Body: { "email": "...", "password": "..." }
 * 200: { accessToken, tokenType, expiresIn, role, merchantId?, lenderId? }
 */
export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: "Auth is not configured on this server" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    return NextResponse.json(
      { error: error?.message ?? "Invalid email or password" },
      { status: 401 }
    );
  }

  const userId = data.session.user.id;

  const [{ data: merchant }, { data: lender }] = await Promise.all([
    supabase
      .from("merchants")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle(),
    supabase
      .from("lenders")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle(),
  ]);

  let role: "merchant" | "lender" | "unknown" = "unknown";
  if (merchant) role = "merchant";
  else if (lender) role = "lender";

  return NextResponse.json({
    accessToken: data.session.access_token,
    tokenType: "bearer",
    expiresIn: data.session.expires_in,
    role,
    ...(merchant ? { merchantId: merchant.id } : {}),
    ...(lender ? { lenderId: lender.id } : {}),
  });
}
