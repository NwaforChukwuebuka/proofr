"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import { TrendChart } from "./trend-chart";
import { FraudFlagsCard, type FraudFlag } from "./fraud-flags";
import { TransactionsCard, type Transaction } from "./transactions-list";
import { LoansCard, type Loan } from "./loans-card";
import { Naira } from "@/lib/fraud-labels";

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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [justUpdated, setJustUpdated] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedMerchantId, setCopiedMerchantId] = useState(false);
  const [publicApiConsent, setPublicApiConsent] = useState<{ consentGranted: boolean; consentedAt: string | null } | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [creditScore, setCreditScore] = useState<number | null>(null);

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

  const fetchTransactions = useCallback(async (merchantId: string) => {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from("transactions")
      .select("id, amount, payer_name, payer_account, created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to load transactions", error);
      return;
    }
    setTransactions((data ?? []) as Transaction[]);
  }, []);

  const fetchLoans = useCallback(async (merchantId: string, accessToken: string) => {
    const res = await fetch(`/api/merchants/${merchantId}/loans`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    setLoans(await res.json());
  }, []);

  const fetchConsent = useCallback(async (merchantId: string, accessToken: string) => {
    const res = await fetch(`/api/merchants/${merchantId}/public-api-consent`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    setPublicApiConsent(await res.json());
  }, []);

  const fetchCreditScore = useCallback(async (merchantId: string, accessToken: string) => {
    const res = await fetch(`/api/merchants/${merchantId}/report`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404) {
      setCreditScore(null);
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as { creditScore: number | null };
    setCreditScore(data.creditScore ?? null);
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
          fetchTransactions((merchantRow as Merchant).id),
          fetchLoans((merchantRow as Merchant).id, currentSession.access_token),
          fetchCreditScore((merchantRow as Merchant).id, currentSession.access_token),
        ]);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, fetchRevenue, fetchFlags, fetchConsent, fetchTransactions, fetchLoans, fetchCreditScore]);

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
          fetchTransactions(merchant.id);
          fetchLoans(merchant.id, session.access_token);
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

  function copyMerchantId() {
    if (!merchant) return;
    navigator.clipboard.writeText(merchant.id);
    setCopiedMerchantId(true);
    setTimeout(() => setCopiedMerchantId(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-6">
        <p className="text-sm font-medium text-zinc-500">Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-6 text-center">
        <p className="text-sm font-medium text-zinc-600">{error}</p>
        <Link
          href="/login"
          className="cursor-pointer text-sm font-semibold text-brand underline decoration-brand/35 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Back to login
        </Link>
      </div>
    );
  }

  if (!merchant) return null;

  const flaggedTransactionIds = new Set(
    flags.filter((f) => f.status === "open").map((f) => f.transactions.id)
  );

  return (
    <main className="flex flex-1 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto w-full max-w-7xl">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-extrabold text-white">
              P
            </span>
            <span className="font-display tracking-tight text-zinc-900">PROOFR</span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Sign out
          </button>
        </header>

        <h1 className="font-display mt-6 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
          {merchant.business_name}
        </h1>

        {merchant.approval_status !== "approved" ? (
          <section className="mt-5 max-w-xl border-l-2 border-brand bg-white p-6 text-center shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-brand/20 bg-brand-tint text-brand">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="h-7 w-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h2 className="font-display mt-4 text-lg font-bold text-zinc-900">
              Application pending approval
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Your account is still under review. Once approved, your dedicated
              virtual account and revenue dashboard will show up here.
            </p>
          </section>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)] lg:items-start lg:gap-6">
            <div className="space-y-5">
              <section className="border-l-2 border-brand bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 lg:p-7">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Verified revenue
                  </p>
                  {justUpdated && (
                    <span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-semibold text-green-700">
                      New payment
                    </span>
                  )}
                </div>
                <p className="mt-1 font-mono text-4xl font-bold tracking-tight text-zinc-950 lg:text-5xl">
                  {revenue ? <Naira amount={revenue.verifiedRevenue} /> : "—"}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    {revenue && revenue.grossInflow > revenue.verifiedRevenue && (
                      <>
                        <p className="text-sm text-zinc-500">
                          Gross inflow: {formatNaira(revenue.grossInflow)}
                        </p>
                        <p className="mt-1 text-sm font-medium text-red-600">
                          {formatNaira(revenue.grossInflow - revenue.verifiedRevenue)} excluded
                          due to flagged activity
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Credit score
                    </p>
                    <span
                      aria-label={
                        creditScore === null
                          ? "Credit score unavailable"
                          : creditScore >= 70
                            ? "Good credit score"
                            : "Weak credit score"
                      }
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ${
                        creditScore === null
                          ? "bg-zinc-300"
                          : creditScore >= 70
                            ? "bg-emerald-500"
                            : "bg-red-500"
                      }`}
                    >
                      {creditScore !== null ? creditScore : "—"}
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    Trend
                  </p>
                  <div className="flex rounded-full bg-brand-tint p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setGranularity("daily")}
                      className={`cursor-pointer rounded-full px-3 py-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                        granularity === "daily" ? "bg-brand text-white" : "text-brand"
                      }`}
                    >
                      Daily
                    </button>
                    <button
                      type="button"
                      onClick={() => setGranularity("monthly")}
                      className={`cursor-pointer rounded-full px-3 py-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                        granularity === "monthly" ? "bg-brand text-white" : "text-brand"
                      }`}
                    >
                      Monthly
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <TrendChart trend={revenue?.trend ?? []} />
                </div>
              </section>

              <LoansCard loans={loans} />

              <TransactionsCard
                transactions={transactions}
                flaggedTransactionIds={flaggedTransactionIds}
              />

              <FraudFlagsCard flags={flags} />
            </div>

            <aside className="space-y-5 lg:sticky lg:top-6">
              <section className="border-l-2 border-zinc-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Merchant ID
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-mono text-sm font-semibold text-zinc-900">
                    {merchant.id}
                  </p>
                  <button
                    type="button"
                    onClick={copyMerchantId}
                    className="cursor-pointer shrink-0 rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {copiedMerchantId ? "Copied" : "Copy ID"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Share this ID with a lender so they can find your profile quickly.
                </p>

                <div className="my-5 border-t border-zinc-100" />

                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Dedicated account
                </p>
                {merchant.monnify_account_number ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="font-mono text-2xl font-bold tracking-tight text-zinc-900">
                      {merchant.monnify_account_number}
                    </p>
                    <button
                      type="button"
                      onClick={copyAccountNumber}
                      className="cursor-pointer shrink-0 rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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

              <section className="border-l-2 border-zinc-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
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
                  className="mt-4 min-h-11 w-full cursor-pointer rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
                >
                  {generatingReport ? "Generating…" : "Generate report"}
                </button>
                <Link
                  href={`/report/${merchant.id}`}
                  className="mt-3 block text-center text-xs font-semibold text-brand underline decoration-brand/35 underline-offset-4 transition hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  View my latest report
                </Link>
              </section>

              <section className="border-l-2 border-zinc-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Third-party credit lookups
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Lets external platforms you haven&apos;t directly shared a report with
                  look up your credit score and recommended loan amount by your phone
                  number, never your revenue details or transaction history. Off by
                  default; you can turn this off again at any time.
                </p>
                <div className="mt-4 flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
                  <span className="text-sm font-semibold text-zinc-700">
                    {publicApiConsent?.consentGranted ? "Enabled" : "Disabled"}
                  </span>
                  <button
                    type="button"
                    disabled={savingConsent || publicApiConsent === null}
                    onClick={() =>
                      togglePublicApiConsent(!publicApiConsent?.consentGranted)
                    }
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 ${
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
                </div>
                {publicApiConsent?.consentGranted && publicApiConsent.consentedAt && (
                  <p className="mt-2 text-xs text-zinc-500">
                    Enabled since{" "}
                    {new Date(publicApiConsent.consentedAt).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
              </section>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
