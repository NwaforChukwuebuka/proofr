import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

let browserClientSingleton: SupabaseClient | null = null;

/**
 * Shared browser client for client components (login, dashboard). A single
 * instance avoids each component spinning up its own auth-refresh timer
 * while still persisting the session via the SDK's default localStorage
 * storage, so a signed-in session survives a page refresh.
 */
export function getBrowserSupabaseClient() {
  if (!browserClientSingleton) {
    browserClientSingleton = createBrowserSupabaseClient();
  }
  return browserClientSingleton;
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
