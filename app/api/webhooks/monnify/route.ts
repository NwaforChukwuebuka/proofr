import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase";
import { verifyWebhookSignature } from "@/lib/monnify";

/**
 * Monnify transaction webhook. Public route — no session, auth is the
 * `monnify-signature` header verified against MONNIFY_WEBHOOK_SECRET.
 * See api-contracts.md / api.md for the contract, handoff.md milestone 5
 * entry for what's actually been observed live vs. taken from docs.
 */

interface MonnifyPaymentSource {
  accountName?: string;
  accountNumber?: string;
}

interface MonnifyWebhookPayload {
  eventType?: string;
  eventData?: {
    product?: { reference?: string; type?: string };
    transactionReference?: string;
    paymentReference?: string;
    amountPaid?: number;
    destinationAccountInformation?: { accountNumber?: string };
    paymentSourceInformation?: MonnifyPaymentSource[];
    customer?: { name?: string; email?: string };
  };
}

export async function POST(request: Request) {
  // Verify against the raw body — must happen before any JSON.parse or DB
  // access, and unverified requests must never touch the database.
  const rawBody = await request.text();
  const signature = request.headers.get("monnify-signature");

  // Signature verification is keyed on MONNIFY_SECRET_KEY, not
  // MONNIFY_WEBHOOK_SECRET — see lib/monnify.ts verifyWebhookSignature.
  if (!process.env.MONNIFY_SECRET_KEY) {
    return NextResponse.json(
      { error: "Webhook is not configured on this server" },
      { status: 500 }
    );
  }
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: MonnifyWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only transaction-success events produce a stored transaction; other
  // event types (e.g. failed/reversed) are acked but not persisted here —
  // out of scope for milestone 5.
  if (payload.eventType !== "SUCCESSFUL_TRANSACTION") {
    return NextResponse.json({ ok: true, ignored: payload.eventType ?? null });
  }

  const eventData = payload.eventData;
  const transactionReference = eventData?.transactionReference;
  const accountNumber = eventData?.destinationAccountInformation?.accountNumber;
  const amountPaid = eventData?.amountPaid;

  if (!transactionReference || !accountNumber || amountPaid === undefined) {
    console.error(
      "Monnify webhook: missing required field(s) in eventData",
      JSON.stringify(eventData)
    );
    return NextResponse.json(
      { error: "Missing required eventData fields" },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleSupabaseClient();

  const { data: merchant, error: merchantLookupError } = await supabase
    .from("merchants")
    .select("id")
    .eq("monnify_account_number", accountNumber)
    .maybeSingle();

  if (merchantLookupError) {
    return NextResponse.json({ error: merchantLookupError.message }, { status: 500 });
  }

  if (!merchant) {
    // No merchant owns this reserved account number. This is a data
    // mismatch, not a transient failure a Monnify retry would fix, so we
    // ack 200 (stop retries) but log loudly for investigation rather than
    // silently dropping the event.
    console.error(
      `Monnify webhook: no merchant found for account number ${accountNumber} (transactionReference=${transactionReference})`
    );
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const source = eventData?.paymentSourceInformation?.[0];
  const payerName = source?.accountName ?? eventData?.customer?.name ?? null;
  const payerAccount = source?.accountNumber ?? null;

  const { error: insertError } = await supabase.from("transactions").insert({
    merchant_id: merchant.id,
    monnify_reference: transactionReference,
    amount: amountPaid,
    payer_name: payerName,
    payer_account: payerAccount,
    raw_payload: payload,
  });

  if (insertError) {
    // Unique violation on monnify_reference means this is a Monnify retry
    // of an already-processed webhook — not an error from their side.
    if (insertError.code === "23505") {
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
