/**
 * Milestone 22: provisions a new api_clients row for GET /api/public/score.
 * No public self-serve signup exists (same posture milestone 12 established
 * for lenders) — this is the only way to grant a third-party platform
 * access. Run manually, not from a route.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/provision-api-client.ts "Some Platform Name"
 *
 * The raw API key is printed exactly once, here, and is never stored
 * anywhere (only its SHA-256 hash lives in the database) — copy it out
 * immediately and hand it to the platform out-of-band (matching how the
 * milestone 12 test lender's password was handled). If it's lost, revoke
 * this row (set `revoked_at`) and provision a fresh one; there is no
 * recovery mechanism by design.
 */
import { createClient } from "@supabase/supabase-js";
import { generateRawApiKey, hashApiKey } from "../lib/public-api-auth";

async function main() {
  const name = process.argv[2];
  if (!name || !name.trim()) {
    console.error('Usage: provision-api-client.ts "Platform Name"');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set");
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { rawKey, preview } = generateRawApiKey();

  const { data, error } = await admin
    .from("api_clients")
    .insert({ name: name.trim(), api_key_hash: hashApiKey(rawKey), key_preview: preview })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Failed to provision API client:", error?.message);
    process.exit(1);
  }

  console.log(`Provisioned api_clients row ${data.id} for "${name.trim()}"`);
  console.log(`\nRaw API key (shown once, not stored anywhere else):\n${rawKey}\n`);
  console.log('Use as header: x-api-key: <the key above>');
}

main();
