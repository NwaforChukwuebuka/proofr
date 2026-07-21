"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import { TrendChart } from "./trend-chart";
import { FraudFlagsCard, type FraudFlag } from "./fraud-flags";
import { TransactionsCard, type Transaction } from "./transactions-list";
import { LoansCard, getNextLoanAttention, type Loan } from "./loans-card";
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

interface ReportSnapshot {
  creditScore: number | null;
  confidenceScore: number | null;
  recommendedLoanAmount: number | null;
  hasReport: boolean;
}

type Granularity = "daily" | "monthly";

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstNameFromBusiness(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.replace(/[,.]$/, "");
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function deriveInsights(
  trend: { period: string; amount: number }[],
  creditScore: number | null,
  recommendedLoanAmount: number | null
): string[] {
  const insights: string[] = [];
  if (trend.length >= 7) {
    const last7 = trend.slice(-7);
    const prev7 = trend.slice(-14, -7);
    const sum = (pts: { amount: number }[]) =>
      pts.reduce((acc, p) => acc + p.amount, 0);
    const thisWeek = sum(last7);
    const lastWeek = sum(prev7);
    const change = pctChange(thisWeek, lastWeek);
    if (change !== null && lastWeek > 0) {
      insights.push(
        change >= 0
          ? `Revenue up ${change}% vs last week.`
          : `Revenue down ${Math.abs(change)}% vs last week.`
      );
    }
  }

  if (trend.length >= 3) {
    const peak = trend.reduce((best, p) => (p.amount > best.amount ? p : best), trend[0]);
    if (peak.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(peak.period)) {
      const weekday = new Date(`${peak.period}T12:00:00`).toLocaleDateString("en-NG", {
        weekday: "long",
      });
      insights.push(`${weekday}s look like your strongest recent day.`);
    }
  }

  if (recommendedLoanAmount && recommendedLoanAmount > 0) {
    insights.push(`You're eligible for about ${formatNaira(recommendedLoanAmount)} in financing.`);
  } else if (creditScore !== null && creditScore >= 70) {
    insights.push("Credit score looks strong — generate a report to share with lenders.");
  }

  return insights.slice(0, 3);
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
  const [showReceive, setShowReceive] = useState(false);
  const [report, setReport] = useState<ReportSnapshot>({
    creditScore: null,
    confidenceScore: null,
    recommendedLoanAmount: null,
    hasReport: false,
  });
  const [generatingReport, setGeneratingReport] = useState(false);

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
    const { data, error: flagsError } = await supabase
      .from("fraud_flags")
      .select(
        "id, rule_type, severity, status, created_at, transactions!inner(id, amount, payer_name, payer_account, created_at)"
      )
      .eq("transactions.merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (flagsError) {
      console.error("Failed to load fraud flags", flagsError);
      return;
    }
    setFlags((data ?? []) as unknown as FraudFlag[]);
  }, []);

  const fetchTransactions = useCallback(async (merchantId: string) => {
    const supabase = getBrowserSupabaseClient();
    const { data, error: txError } = await supabase
      .from("transactions")
      .select("id, amount, payer_name, payer_account, created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (txError) {
      console.error("Failed to load transactions", txError);
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

  const fetchReportSnapshot = useCallback(async (merchantId: string, accessToken: string) => {
    const res = await fetch(`/api/merchants/${merchantId}/report`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404) {
      setReport({
        creditScore: null,
        confidenceScore: null,
        recommendedLoanAmount: null,
        hasReport: false,
      });
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as {
      creditScore: number | null;
      confidenceScore: number;
      recommendedLoanAmount: number | null;
    };
    setReport({
      creditScore: data.creditScore ?? null,
      confidenceScore: data.confidenceScore ?? null,
      recommendedLoanAmount: data.recommendedLoanAmount ?? null,
      hasReport: true,
    });
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
        await Promise.all([
          fetchRevenue(
            (merchantRow as Merchant).id,
            currentSession.access_token,
            "daily"
          ),
          fetchFlags((merchantRow as Merchant).id),
          fetchTransactions((merchantRow as Merchant).id),
          fetchLoans((merchantRow as Merchant).id, currentSession.access_token),
          fetchReportSnapshot((merchantRow as Merchant).id, currentSession.access_token),
        ]);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, fetchRevenue, fetchFlags, fetchTransactions, fetchLoans, fetchReportSnapshot]);

  useEffect(() => {
    if (!merchant || merchant.approval_status !== "approved" || !session) return;
    async function reload() {
      await fetchRevenue(merchant!.id, session!.access_token, granularity);
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granularity]);

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

  const hour = new Date().getHours();
  const greeting = greetingForHour(hour);

  const todayStats = useMemo(() => {
    const trend = revenue?.trend ?? [];
    const today = todayIsoDate();
    const yesterday = addDaysIso(today, -1);
    const todayPoint = trend.find((p) => p.period === today);
    const yesterdayPoint = trend.find((p) => p.period === yesterday);
    // If today isn't in the series yet, use the latest period as "latest day"
    const latest = todayPoint ?? (trend.length > 0 ? trend[trend.length - 1] : null);
    const prior =
      todayPoint && yesterdayPoint
        ? yesterdayPoint
        : trend.length >= 2
          ? trend[trend.length - 2]
          : null;
    const todayAmount = latest?.amount ?? 0;
    const priorAmount = prior?.amount ?? 0;
    const change = prior ? pctChange(todayAmount, priorAmount) : null;
    const isToday = latest?.period === today;
    return { todayAmount, change, isToday, label: isToday ? "Today's revenue" : "Latest day" };
  }, [revenue?.trend]);

  const insights = useMemo(
    () =>
      deriveInsights(
        revenue?.trend ?? [],
        report.creditScore,
        report.recommendedLoanAmount
      ),
    [revenue?.trend, report.creditScore, report.recommendedLoanAmount]
  );

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
  const openFlags = flags.filter((f) => f.status === "open");
  const loanAttention = getNextLoanAttention(loans);
  const creditScore = report.creditScore;
  const healthLabel =
    openFlags.length > 0
      ? "Needs attention"
      : creditScore !== null && creditScore >= 70
        ? "Excellent"
        : creditScore !== null
          ? "Building"
          : "Getting started";
  const healthTone =
    openFlags.length > 0
      ? "text-amber-700"
      : creditScore !== null && creditScore >= 70
        ? "text-emerald-700"
        : "text-zinc-700";

  return (
    <main className="flex min-w-0 flex-1 overflow-x-clip bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-3 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="mx-auto w-full min-w-0 max-w-3xl lg:max-w-5xl">
        <header className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-extrabold text-white">
              P
            </span>
            <span className="font-display tracking-tight text-zinc-900">PROOFR</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/dashboard/settings"
              className="min-h-11 cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Profile
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="min-h-11 cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Sign out
            </button>
          </div>
        </header>

        {merchant.approval_status !== "approved" ? (
          <>
            <h1 className="font-display mt-5 break-words text-2xl font-extrabold tracking-tight text-zinc-900 sm:mt-6 sm:text-3xl">
              {merchant.business_name}
            </h1>
            <section className="mt-5 max-w-xl border-l-2 border-brand bg-white p-4 text-center shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-8">
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
          </>
        ) : (
          <div className="mt-5 space-y-4 sm:mt-6 sm:space-y-5">
            {/* Greeting */}
            <div className="hero-copy-in">
              <p className="text-sm font-medium text-zinc-500">
                {greeting}, {firstNameFromBusiness(merchant.business_name)}
              </p>
              <h1 className="font-display mt-0.5 break-words text-xl font-extrabold tracking-tight text-zinc-900 sm:text-2xl">
                {merchant.business_name}
              </h1>
            </div>

            {/* Attention center */}
            {(openFlags.length > 0 ||
              (loanAttention && loanAttention.days <= 7) ||
              !report.hasReport) && (
              <div className="hero-copy-in-delay space-y-2">
                {openFlags.length > 0 && (
                  <a
                    href="#fraud-flags"
                    className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 transition hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <span className="mt-0.5 shrink-0 font-bold" aria-hidden>
                      !
                    </span>
                    <span>
                      {openFlags.length} payment{openFlags.length === 1 ? "" : "s"} flagged — review
                      before sharing a report.
                    </span>
                  </a>
                )}
                {loanAttention && loanAttention.days <= 7 && (
                  <a
                    href="#loans"
                    className="flex items-start gap-3 rounded-lg border border-brand/25 bg-brand-tint px-3 py-2.5 text-sm text-brand-dark transition hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <span className="mt-0.5 shrink-0 font-bold" aria-hidden>
                      !
                    </span>
                    <span>
                      {loanAttention.days < 0
                        ? `Loan payment overdue — ${formatNaira(loanAttention.amount)}`
                        : loanAttention.days === 0
                          ? `Loan payment due today — ${formatNaira(loanAttention.amount)}`
                          : `Loan payment in ${loanAttention.days} days — ${formatNaira(loanAttention.amount)}`}
                    </span>
                  </a>
                )}
                {!report.hasReport && (
                  <button
                    type="button"
                    onClick={generateReport}
                    disabled={generatingReport}
                    className="flex w-full items-start gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm text-zinc-700 transition hover:border-brand/30 hover:bg-brand-tint/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
                  >
                    <span className="mt-0.5 shrink-0 font-bold text-brand" aria-hidden>
                      i
                    </span>
                    <span>
                      {generatingReport
                        ? "Generating your first proof-of-revenue report…"
                        : "No proof report yet — tap to generate one for lenders."}
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Hero: today's money */}
            <section className="hero-copy-in-late border-l-2 border-brand bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-6 lg:p-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  {todayStats.label}
                </p>
                {justUpdated && (
                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-semibold text-green-700">
                    New payment
                  </span>
                )}
              </div>
              <p className="mt-1 font-mono text-[clamp(2rem,10vw,3.25rem)] font-bold tracking-tight text-zinc-950">
                <Naira amount={todayStats.todayAmount} />
              </p>
              {todayStats.change !== null && (
                <p
                  className={`mt-1 text-sm font-semibold ${
                    todayStats.change >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {todayStats.change >= 0 ? "+" : ""}
                  {todayStats.change}% vs prior day
                </p>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    Verified total
                  </p>
                  <p className="mt-0.5 font-mono text-base font-bold text-zinc-900 sm:text-lg">
                    {revenue ? <Naira amount={revenue.verifiedRevenue} /> : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    Credit score
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 font-mono text-base font-bold text-zinc-900 sm:text-lg">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                        creditScore === null
                          ? "bg-zinc-300"
                          : creditScore >= 70
                            ? "bg-emerald-500"
                            : "bg-red-500"
                      }`}
                    >
                      {creditScore !== null ? creditScore : "—"}
                    </span>
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    Eligible loan
                  </p>
                  <p className="mt-0.5 font-mono text-base font-bold text-zinc-900 sm:text-lg">
                    {report.recommendedLoanAmount != null ? (
                      <Naira amount={report.recommendedLoanAmount} />
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
              </div>

              {revenue && revenue.grossInflow > revenue.verifiedRevenue && (
                <p className="mt-3 text-xs font-medium text-red-600">
                  {formatNaira(revenue.grossInflow - revenue.verifiedRevenue)} excluded due to
                  flagged activity
                </p>
              )}

              <button
                type="button"
                onClick={generateReport}
                disabled={generatingReport}
                className="mt-5 min-h-11 w-full cursor-pointer rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 sm:w-auto sm:min-w-[12rem]"
              >
                {generatingReport ? "Generating…" : "Generate proof report"}
              </button>
              {report.hasReport && (
                <Link
                  href={`/report/${merchant.id}`}
                  className="mt-2 block min-h-10 py-2 text-center text-xs font-semibold text-brand underline decoration-brand/35 underline-offset-4 transition hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:inline-block sm:text-left sm:pl-1"
                >
                  View latest report
                </Link>
              )}
            </section>

            {/* Quick actions */}
            <nav
              aria-label="Quick actions"
              className="grid grid-cols-4 gap-2 sm:gap-3"
            >
              {[
                {
                  key: "receive",
                  label: "Receive",
                  onClick: () => setShowReceive((v) => !v),
                  href: null as string | null,
                },
                {
                  key: "report",
                  label: "Report",
                  onClick: generateReport,
                  href: null,
                },
                {
                  key: "loans",
                  label: "Loans",
                  onClick: null,
                  href: "#loans",
                },
                {
                  key: "profile",
                  label: "Profile",
                  onClick: null,
                  href: "/dashboard/settings",
                },
              ].map((action) => {
                const className =
                  "flex min-h-[4.25rem] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl bg-white px-1 py-3 text-center text-xs font-semibold text-zinc-800 shadow-[0_4px_16px_rgba(15,23,42,0.06)] ring-1 ring-zinc-100 transition hover:ring-brand/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
                const icon = (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-tint text-brand">
                    {action.key === "receive" && (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                      </svg>
                    )}
                    {action.key === "report" && (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
                        <path d="M14 3v6h6M8 13h8M8 17h5" />
                      </svg>
                    )}
                    {action.key === "loans" && (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <rect x="3" y="6" width="18" height="12" rx="2" />
                        <path d="M3 10h18" />
                      </svg>
                    )}
                    {action.key === "profile" && (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <circle cx="12" cy="8" r="3" />
                        <path d="M5 20a7 7 0 0 1 14 0" />
                      </svg>
                    )}
                  </span>
                );
                if (action.href) {
                  return (
                    <Link key={action.key} href={action.href} className={className}>
                      {icon}
                      {action.label}
                    </Link>
                  );
                }
                return (
                  <button
                    key={action.key}
                    type="button"
                    onClick={action.onClick ?? undefined}
                    disabled={action.key === "report" && generatingReport}
                    className={className}
                  >
                    {icon}
                    {action.key === "report" && generatingReport ? "…" : action.label}
                  </button>
                );
              })}
            </nav>

            {/* Collapsible receive / account */}
            {showReceive && (
              <section className="border-l-2 border-zinc-200 bg-white p-4 ring-1 ring-zinc-100 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Receive payments
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowReceive(false)}
                    className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    Close
                  </button>
                </div>
                {merchant.monnify_account_number ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 break-all font-mono text-xl font-bold tracking-tight text-zinc-900">
                      {merchant.monnify_account_number}
                    </p>
                    <button
                      type="button"
                      onClick={copyAccountNumber}
                      className="min-h-10 shrink-0 cursor-pointer rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-zinc-500">
                    Your virtual account is still being issued.
                  </p>
                )}
              </section>
            )}

            {/* Business health */}
            <section className="border-l-2 border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Business health
                </p>
                <p className={`text-sm font-bold ${healthTone}`}>{healthLabel}</p>
              </div>
              <ul className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-3">
                <li className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      openFlags.length === 0 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  {openFlags.length === 0 ? "Revenue verified" : "Flags open"}
                </li>
                <li className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      creditScore !== null && creditScore >= 70
                        ? "bg-emerald-500"
                        : creditScore !== null
                          ? "bg-amber-500"
                          : "bg-zinc-300"
                    }`}
                  />
                  Score {creditScore !== null ? creditScore : "—"}
                  {report.confidenceScore != null ? ` · conf. ${report.confidenceScore}` : ""}
                </li>
                <li className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      report.recommendedLoanAmount
                        ? "bg-emerald-500"
                        : "bg-zinc-300"
                    }`}
                  />
                  {report.recommendedLoanAmount
                    ? `Eligible ${formatNaira(report.recommendedLoanAmount)}`
                    : "Generate report for offers"}
                </li>
              </ul>
            </section>

            <div className="grid min-w-0 gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
              <div className="min-w-0 space-y-4 sm:space-y-5">
                <TransactionsCard
                  transactions={transactions}
                  flaggedTransactionIds={flaggedTransactionIds}
                />
                <LoansCard loans={loans} />
              </div>

              <div className="min-w-0 space-y-4 sm:space-y-5">
                {/* Trend */}
                <section className="min-w-0 border-l-2 border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Revenue trend
                    </p>
                    <div className="flex rounded-full bg-brand-tint p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setGranularity("daily")}
                        className={`min-h-9 cursor-pointer rounded-full px-3 py-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                          granularity === "daily" ? "bg-brand text-white" : "text-brand"
                        }`}
                      >
                        Daily
                      </button>
                      <button
                        type="button"
                        onClick={() => setGranularity("monthly")}
                        className={`min-h-9 cursor-pointer rounded-full px-3 py-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                          granularity === "monthly" ? "bg-brand text-white" : "text-brand"
                        }`}
                      >
                        Monthly
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 min-w-0">
                    <TrendChart trend={revenue?.trend ?? []} />
                  </div>
                </section>

                {insights.length > 0 && (
                  <section className="border-l-2 border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Insights
                    </p>
                    <ul className="mt-3 space-y-2.5">
                      {insights.map((line) => (
                        <li key={line} className="text-sm leading-snug text-zinc-700">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <div id="fraud-flags">
                  <FraudFlagsCard flags={flags} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
