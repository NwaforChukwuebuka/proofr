import { createClient } from "@supabase/supabase-js";

/**
 * Browser/RLS-scoped client — safe to use in client components and
 * anywhere the anon key's row-level security policies should apply.
 */
export function createBrowserSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Server-only client using the service role key — bypasses RLS.
 * Never import this from client components; it must only run in
 * API routes / Route Handlers / server components.
 */
export function createServiceRoleSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
