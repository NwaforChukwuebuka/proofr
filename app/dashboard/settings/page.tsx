"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase";

interface Merchant {
  id: string;
  business_name: string;
  approval_status: string;
  monnify_account_number: string | null;
}

export default function DashboardSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedMerchantId, setCopiedMerchantId] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [publicApiConsent, setPublicApiConsent] = useState<{
    consentGranted: boolean;
    consentedAt: string | null;
  } | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);

  const fetchConsent = useCallback(async (merchantId: string, accessToken: string) => {
    const res = await fetch(`/api/merchants/${merchantId}/public-api-consent`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    setPublicApiConsent(await res.json());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        router.replace("/login");
        return;
      }
      if (cancelled) return;
      setSession(currentSession);

      const { data: merchantRow, error: merchantError } = await supabase
        .from("merchants")
        .select("id, business_name, approval_status, monnify_account_number")
        .eq("auth_user_id", currentSession.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (merchantError || !merchantRow) {
        setError("Couldn't find a merchant profile for this account.");
        setLoading(false);
        return;
      }

      setMerchant(merchantRow as Merchant);
      if ((merchantRow as Merchant).approval_status === "approved") {
        await fetchConsent((merchantRow as Merchant).id, currentSession.access_token);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, fetchConsent]);

  async function togglePublicApiConsent(nextConsent: boolean) {
    if (!merchant || !session) return;
    setSavingConsent(true);
    try {
      const res = await fetch(`/api/merchants/${merchant.id}/public-api-consent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ consent: nextConsent }),
      });
      if (res.ok) {
        setPublicApiConsent(await res.json());
      }
    } finally {
      setSavingConsent(false);
    }
  }

  function copyAccountNumber() {
    if (!merchant?.monnify_account_number) return;
    navigator.clipboard.writeText(merchant.monnify_account_number);
    setCopied(true);
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopied(false), 2000);
  }

  function copyMerchantId() {
    if (!merchant) return;
    navigator.clipboard.writeText(merchant.id);
    setCopiedMerchantId(true);
    setTimeout(() => setCopiedMerchantId(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-6">
        <p className="text-sm font-medium text-zinc-500">Loading settings…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-6 text-center">
        <p className="text-sm font-medium text-zinc-600">{error}</p>
        <Link
          href="/dashboard"
          className="cursor-pointer text-sm font-semibold text-brand underline decoration-brand/35 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!merchant) return null;

  return (
    <main className="flex min-w-0 flex-1 overflow-x-clip bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-3 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="mx-auto w-full min-w-0 max-w-2xl">
        <header className="flex items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            ← Dashboard
          </Link>
        </header>

        <h1 className="font-display mt-5 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">
          Business profile
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{merchant.business_name}</p>

        <div className="mt-6 space-y-4">
          <section className="border-l-2 border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Dedicated account
            </p>
            {merchant.monnify_account_number ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3">
                <p className="min-w-0 flex-1 break-all font-mono text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
                  {merchant.monnify_account_number}
                </p>
                <button
                  type="button"
                  onClick={copyAccountNumber}
                  className="min-h-10 shrink-0 cursor-pointer rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-4"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">
                Your virtual account is still being issued.
              </p>
            )}
            <p className="mt-2 text-xs text-zinc-500">
              Share this account number with customers to get paid directly.
            </p>
          </section>

          <section className="border-l-2 border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Merchant ID
            </p>
            <div className="mt-2 flex items-center gap-2 sm:gap-3">
              <p className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-zinc-900 sm:text-sm">
                {merchant.id}
              </p>
              <button
                type="button"
                onClick={copyMerchantId}
                className="min-h-10 shrink-0 cursor-pointer rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-4"
              >
                {copiedMerchantId ? "Copied" : "Copy ID"}
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Share this ID with a lender so they can find your profile quickly.
            </p>
          </section>

          {merchant.approval_status === "approved" && (
            <section className="border-l-2 border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Credit sharing
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Lets lenders look up your credit score and loan offer by phone
                    number — never your revenue or transactions.
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    publicApiConsent?.consentGranted
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {publicApiConsent?.consentGranted ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={savingConsent || publicApiConsent === null}
                  onClick={() =>
                    togglePublicApiConsent(!publicApiConsent?.consentGranted)
                  }
                  className={`min-h-10 rounded-full px-4 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 ${
                    publicApiConsent?.consentGranted
                      ? "bg-white text-red-600 ring-1 ring-zinc-200 hover:bg-red-50"
                      : "bg-brand text-white hover:bg-brand-dark"
                  }`}
                >
                  {savingConsent
                    ? "Saving…"
                    : publicApiConsent?.consentGranted
                      ? "Turn off"
                      : "Turn on"}
                </button>
                {publicApiConsent?.consentGranted && publicApiConsent.consentedAt && (
                  <p className="text-xs text-zinc-500">
                    Since{" "}
                    {new Date(publicApiConsent.consentedAt).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
