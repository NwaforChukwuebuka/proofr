"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import { TrendChart } from "./trend-chart";
import { FraudFlagsCard, type FraudFlag } from "./fraud-flags";

interface Merchant {
  id: string;
  business_name: string;
  approval_status: string;
  monnify_account_number: string | null;
}

interface Revenue {
  grossInflow: number;
  verifiedRevenue: number;
  trend: { period: string; amount: number }[];
}

type Granularity = "daily" | "monthly";

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [flags, setFlags] = useState<FraudFlag[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [justUpdated, setJustUpdated] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);
  const [publicApiConsent, setPublicApiConsent] = useState<{ consentGranted: boolean; consentedAt: string | null } | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);

  const fetchRevenue = useCallback(
    async (merchantId: string, accessToken: string, gran: Granularity) => {
      const res = await fetch(
        `/api/merchants/${merchantId}/revenue?granularity=${gran}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        setError("Couldn't load revenue data.");
        return;
      }
      const data = (await res.json()) as Revenue;
      setRevenue(data);
    },
    []
  );

  const fetchFlags = useCallback(async (merchantId: string) => {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from("fraud_flags")
      .select(
        "id, rule_type, severity, status, created_at, transactions!inner(id, amount, payer_name, payer_account, created_at)"
      )
      .eq("transactions.merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Failed to load fraud flags", error);
      return;
    }
    setFlags((data ?? []) as unknown as FraudFlag[]);
  }, []);

  const fetchConsent = useCallback(async (merchantId: string, accessToken: string) => {
    const res = await fetch(`/api/merchants/${merchantId}/public-api-consent`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    setPublicApiConsent(await res.json());
  }, []);

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

  // Initial load: session -> merchant profile -> revenue.
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
        await Promise.all([
          fetchRevenue(
            (merchantRow as Merchant).id,
            currentSession.access_token,
            "daily"
          ),
          fetchFlags((merchantRow as Merchant).id),
          fetchConsent((merchantRow as Merchant).id, currentSession.access_token),
        ]);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, fetchRevenue, fetchFlags, fetchConsent]);

  // Granularity toggle re-fetch.
  useEffect(() => {
    if (!merchant || merchant.approval_status !== "approved" || !session) return;
    async function reload() {
      await fetchRevenue(merchant!.id, session!.access_token, granularity);
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granularity]);

  // Realtime subscription: new transactions for this merchant refresh totals live.
  useEffect(() => {
    if (!merchant || merchant.approval_status !== "approved" || !session) return;

    const supabase = getBrowserSupabaseClient();
    const channel = supabase
      .channel(`transactions-merchant-${merchant.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `merchant_id=eq.${merchant.id}`,
        },
        () => {
          fetchRevenue(merchant.id, session.access_token, granularity);
          fetchFlags(merchant.id);
          setJustUpdated(true);
          setTimeout(() => setJustUpdated(false), 3000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant?.id]);

  // Second realtime subscription: fraud_flags is written by runFraudChecks
  // *after* the transaction insert, in the same webhook request but as a
  // separate write moments later — the transactions subscription above can
  // fire before the flag row exists. Subscribing to fraud_flags directly
  // (RLS-scoped, no merchant_id column to filter on client-side) catches
  // that case and re-fetches both flags and revenue (verifiedRevenue changes
  // once a flag opens).
  useEffect(() => {
    if (!merchant || merchant.approval_status !== "approved" || !session) return;

    const supabase = getBrowserSupabaseClient();
    const channel = supabase
      .channel(`fraud-flags-merchant-${merchant.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fraud_flags" },
        () => {
          fetchFlags(merchant.id);
          fetchRevenue(merchant.id, session.access_token, granularity);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant?.id]);

  const [generatingReport, setGeneratingReport] = useState(false);

  async function generateReport() {
    if (!merchant || !session) return;
    setGeneratingReport(true);
    try {
      const res = await fetch(`/api/merchants/${merchant.id}/report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setError("Couldn't generate a report.");
        return;
      }
      const { reportId } = (await res.json()) as { reportId: string };
      router.push(`/report/${merchant.id}?reportId=${reportId}`);
    } finally {
      setGeneratingReport(false);
    }
  }

  async function signOut() {
    const supabase = getBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function copyAccountNumber() {
    if (!merchant?.monnify_account_number) return;
    navigator.clipboard.writeText(merchant.monnify_account_number);
    setCopied(true);
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-brand">
        <p className="text-sm font-medium text-blue-100">Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-brand px-6 text-center">
        <p className="text-sm font-medium text-blue-100">{error}</p>
        <Link href="/login" className="text-sm font-semibold text-white underline">
          Back to login
        </Link>
      </div>
    );
  }

  if (!merchant) return null;

  return (
    <div className="flex flex-1 flex-col items-center bg-brand px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-blue-100 hover:text-white">
            PROOFR
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="text-sm font-medium text-blue-100 hover:text-white"
          >
            Sign out
          </button>
        </div>

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">
          {merchant.business_name}
        </h1>

        {merchant.approval_status !== "approved" ? (
          <div className="mt-4 rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-2xl text-brand">
              &#9203;
            </div>
            <h2 className="mt-4 text-lg font-bold text-zinc-900">
              Application pending approval
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Your account is still under review. Once approved, your
              dedicated virtual account and revenue dashboard will show up
              here.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Virtual account card */}
            <div className="rounded-3xl bg-white p-6 shadow-2xl">
              <p className="text-xs font-medium text-zinc-400">
                Your dedicated account
              </p>
              {merchant.monnify_account_number ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-2xl font-extrabold tracking-tight text-zinc-900">
                    {merchant.monnify_account_number}
                  </p>
                  <button
                    type="button"
                    onClick={copyAccountNumber}
                    className="shrink-0 rounded-full bg-brand-tint px-3 py-1.5 text-xs font-semibold text-brand hover:bg-blue-100"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">
                  Your virtual account is still being issued.
                </p>
              )}
              <p className="mt-2 text-xs text-zinc-400">
                Share this account number with customers to get paid directly.
              </p>
            </div>

            {/* Revenue totals card */}
            <div className="rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-400">
                  Verified revenue
                </p>
                {justUpdated && (
                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-semibold text-green-700">
                    New payment
                  </span>
                )}
              </div>
              <p className="mt-1 text-3xl font-extrabold text-zinc-900">
                {revenue ? formatNaira(revenue.verifiedRevenue) : "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Gross inflow: {revenue ? formatNaira(revenue.grossInflow) : "—"}
              </p>
              {revenue && revenue.grossInflow > revenue.verifiedRevenue && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  {formatNaira(revenue.grossInflow - revenue.verifiedRevenue)}{" "}
                  excluded due to flagged activity
                </p>
              )}

              <div className="mt-5 flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-500">Trend</p>
                <div className="flex rounded-full bg-brand-tint p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setGranularity("daily")}
                    className={`rounded-full px-3 py-1 transition ${
                      granularity === "daily"
                        ? "bg-brand text-white"
                        : "text-brand"
                    }`}
                  >
                    Daily
                  </button>
                  <button
                    type="button"
                    onClick={() => setGranularity("monthly")}
                    className={`rounded-full px-3 py-1 transition ${
                      granularity === "monthly"
                        ? "bg-brand text-white"
                        : "text-brand"
                    }`}
                  >
                    Monthly
                  </button>
                </div>
              </div>

              <div className="mt-3">
                <TrendChart trend={revenue?.trend ?? []} />
              </div>
            </div>

            <FraudFlagsCard flags={flags} />

            {/* Proof-of-Revenue report entry point */}
            <div className="rounded-3xl bg-white p-6 shadow-2xl">
              <p className="text-xs font-medium text-zinc-400">
                Proof-of-Revenue report
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Generate a shareable revenue report for a lender, showing your
                confidence score, verified revenue, and any fraud flags.
              </p>
              <button
                type="button"
                onClick={generateReport}
                disabled={generatingReport}
                className="mt-4 w-full rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {generatingReport ? "Generating…" : "Generate report"}
              </button>
              <Link
                href={`/report/${merchant.id}`}
                className="mt-2 block text-center text-xs font-semibold text-brand underline"
              >
                View my latest report
              </Link>
            </div>

            {/* Third-party credit lookup consent */}
            <div className="rounded-3xl bg-white p-6 shadow-2xl">
              <p className="text-xs font-medium text-zinc-400">
                Third-party credit lookups
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Lets external platforms you haven&apos;t directly shared a
                report with look up your credit score and recommended loan
                amount by your phone number — never your revenue details or
                transaction history. Off by default; you can turn this off
                again at any time.
              </p>
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-brand-tint/60 px-4 py-3">
                <span className="text-sm font-semibold text-zinc-700">
                  {publicApiConsent?.consentGranted
                    ? "Enabled"
                    : "Disabled"}
                </span>
                <button
                  type="button"
                  disabled={savingConsent || publicApiConsent === null}
                  onClick={() =>
                    togglePublicApiConsent(!publicApiConsent?.consentGranted)
                  }
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                    publicApiConsent?.consentGranted
                      ? "bg-white text-red-600 hover:bg-red-50"
                      : "bg-brand text-white hover:bg-brand-dark"
                  }`}
                >
                  {savingConsent
                    ? "Saving…"
                    : publicApiConsent?.consentGranted
                    ? "Turn off"
                    : "Turn on"}
                </button>
              </div>
              {publicApiConsent?.consentGranted && publicApiConsent.consentedAt && (
                <p className="mt-2 text-xs text-zinc-400">
                  Enabled since{" "}
                  {new Date(publicApiConsent.consentedAt).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
