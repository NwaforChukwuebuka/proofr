"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import {
  LoanPortfolioCard,
  computePortfolioStats,
  type PortfolioLoan,
} from "./loan-portfolio";

interface Lender {
  id: string;
  org_name: string;
}

interface SearchResult {
  merchantId: string;
  businessName: string;
  confidenceScore: number | null;
  creditScore: number | null;
  recommendedLoanAmount: number | null;
}

interface EligibleMerchant {
  merchantId: string;
  businessName: string;
  creditScore: number | null;
  confidenceScore: number | null;
  recommendedLoanAmount: number | null;
}

function scoreBadge(score: number | null) {
  if (score === null) {
    return { label: "—", className: "bg-zinc-100 text-zinc-500" };
  }
  if (score >= 80) return { label: `${score}`, className: "bg-green-50 text-green-700" };
  if (score >= 50) return { label: `${score}`, className: "bg-amber-50 text-amber-700" };
  return { label: `${score}`, className: "bg-red-50 text-red-700" };
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function formatNairaShort(amount: number): string {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `₦${(amount / 1_000).toFixed(0)}k`;
  return `₦${amount}`;
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function LenderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [lender, setLender] = useState<Lender | null>(null);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [portfolioLoans, setPortfolioLoans] = useState<PortfolioLoan[]>([]);
  const [eligible, setEligible] = useState<EligibleMerchant[]>([]);

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

      const { data: lenderRow } = await supabase
        .from("lenders")
        .select("id, org_name")
        .eq("auth_user_id", currentSession.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (!lenderRow) {
        router.replace("/dashboard");
        return;
      }

      setSession(currentSession);
      setLender(lenderRow as Lender);

      const { data: loanRows, error: loansError } = await supabase
        .from("loans")
        .select(
          "id, merchant_id, amount, status, interest_rate, term_months, mock_repayment_schedule, created_at, credit_score_at_approval, merchants(business_name)"
        )
        .eq("lender_id", (lenderRow as Lender).id)
        .order("created_at", { ascending: false });

      if (!cancelled && !loansError && loanRows) {
        setPortfolioLoans(
          loanRows.map((row) => {
            const merchant = Array.isArray(row.merchants) ? row.merchants[0] : row.merchants;
            return {
              loanId: row.id,
              merchantId: row.merchant_id,
              businessName: merchant?.business_name ?? "Unknown merchant",
              amount: Number(row.amount),
              status: row.status,
              interestRate: row.interest_rate,
              termMonths: row.term_months,
              mockRepaymentSchedule: row.mock_repayment_schedule,
              creditScoreAtApproval: row.credit_score_at_approval ?? null,
              createdAt: row.created_at,
            } as PortfolioLoan;
          })
        );
      }

      // Discover recently scored merchants with a recommended offer (opportunity feed).
      const portfolioMerchantIds = new Set(
        (loanRows ?? []).map((r) => r.merchant_id as string)
      );
      const { data: reportRows } = await supabase
        .from("reports")
        .select(
          "merchant_id, credit_score, confidence_score, recommended_loan_amount, generated_at, merchants(business_name)"
        )
        .not("recommended_loan_amount", "is", null)
        .order("generated_at", { ascending: false })
        .limit(40);

      if (!cancelled && reportRows) {
        const seen = new Set<string>();
        const picks: EligibleMerchant[] = [];
        for (const r of reportRows) {
          if (seen.has(r.merchant_id) || portfolioMerchantIds.has(r.merchant_id)) continue;
          if (!r.recommended_loan_amount || Number(r.recommended_loan_amount) <= 0) continue;
          seen.add(r.merchant_id);
          const merchant = Array.isArray(r.merchants) ? r.merchants[0] : r.merchants;
          picks.push({
            merchantId: r.merchant_id,
            businessName: merchant?.business_name ?? "Merchant",
            creditScore: r.credit_score ?? null,
            confidenceScore: r.confidence_score ?? null,
            recommendedLoanAmount: Number(r.recommended_loan_amount),
          });
          if (picks.length >= 5) break;
        }
        setEligible(picks);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const stats = useMemo(() => computePortfolioStats(portfolioLoans), [portfolioLoans]);

  const runSearch = useCallback(async () => {
    if (!session || !query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `/api/lenders/search?query=${encodeURIComponent(query.trim())}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!res.ok) {
        setSearchError("Couldn't search merchants.");
        setResults(null);
        return;
      }
      setResults((await res.json()) as SearchResult[]);
    } finally {
      setSearching(false);
    }
  }, [session, query]);

  async function signOut() {
    const supabase = getBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-6 text-center">
        <p className="text-sm font-medium text-zinc-600">Loading portfolio…</p>
      </div>
    );
  }

  const hour = new Date().getHours();

  return (
    <main className="flex flex-1 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-3 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto w-full max-w-5xl">
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
              href="/lender/settings"
              className="min-h-11 cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Settings
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

        <div className="mt-5 sm:mt-6">
          <p className="text-sm font-medium text-zinc-500">
            {greetingForHour(hour)}
          </p>
          <h1 className="font-display mt-0.5 break-words text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">
            {lender?.org_name}
          </h1>
        </div>

        {/* Attention */}
        {(stats.overdueCount > 0 || stats.dueSoonCount > 0) && (
          <div className="mt-4 space-y-2">
            {stats.overdueCount > 0 && (
              <a
                href="#attention"
                className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900 transition hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <span className="mt-0.5 font-bold" aria-hidden>
                  !
                </span>
                <span>
                  {stats.overdueCount} repayment{stats.overdueCount === 1 ? "" : "s"} overdue
                  {stats.overdueAmount > 0
                    ? ` · ${formatNaira(stats.overdueAmount)}`
                    : ""}
                </span>
              </a>
            )}
            {stats.dueSoonCount > 0 && (
              <a
                href="#attention"
                className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 transition hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <span className="mt-0.5 font-bold" aria-hidden>
                  !
                </span>
                <span>
                  {stats.dueSoonCount} payment{stats.dueSoonCount === 1 ? "" : "s"} due within 7
                  days
                </span>
              </a>
            )}
          </div>
        )}

        {/* Portfolio hero */}
        <section className="mt-5 border-l-2 border-brand bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Capital deployed
          </p>
          <p className="mt-1 font-mono text-[clamp(2rem,9vw,3rem)] font-bold tracking-tight text-zinc-950">
            {formatNaira(stats.deployed)}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {stats.activeCount} active loan{stats.activeCount === 1 ? "" : "s"}
            {stats.repaidCount > 0 ? ` · ${stats.repaidCount} repaid` : ""}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                Repayment rate
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-zinc-900">
                {stats.repaymentRate !== null ? `${stats.repaymentRate}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                Avg credit score
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-zinc-900">
                {stats.avgCreditScore !== null ? stats.avgCreditScore : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                Due soon
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-zinc-900">
                {stats.dueSoonCount}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                Overdue
              </p>
              <p
                className={`mt-0.5 font-mono text-lg font-bold ${
                  stats.overdueCount > 0 ? "text-red-600" : "text-zinc-900"
                }`}
              >
                {stats.overdueCount}
              </p>
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <nav aria-label="Quick actions" className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
          {[
            {
              key: "search",
              label: "Search",
              onClick: () => setSearchOpen((v) => !v),
              href: null as string | null,
            },
            {
              key: "eligible",
              label: "Eligible",
              onClick: null,
              href: "#eligible",
            },
            {
              key: "loans",
              label: "Portfolio",
              onClick: null,
              href: "#portfolio",
            },
            {
              key: "settings",
              label: "API",
              onClick: null,
              href: "/lender/settings",
            },
          ].map((action) => {
            const className =
              "flex min-h-17 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl bg-white px-1 py-3 text-center text-xs font-semibold text-zinc-800 shadow-[0_4px_16px_rgba(15,23,42,0.06)] ring-1 ring-zinc-100 transition hover:ring-brand/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
            const icon = (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-tint text-brand">
                {action.key === "search" && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3-3" />
                  </svg>
                )}
                {action.key === "eligible" && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
                  </svg>
                )}
                {action.key === "loans" && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <rect x="3" y="6" width="18" height="12" rx="2" />
                    <path d="M3 10h18" />
                  </svg>
                )}
                {action.key === "settings" && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M4 7h16M4 12h10M4 17h7" />
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
              <button key={action.key} type="button" onClick={action.onClick ?? undefined} className={className}>
                {icon}
                {action.label}
              </button>
            );
          })}
        </nav>

        {/* Collapsible search */}
        {searchOpen && (
          <section id="search" className="mt-4 border-l-2 border-zinc-200 bg-white p-4 ring-1 ring-zinc-100 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Search merchants
              </p>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Close
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={query}
                placeholder="Business name or merchant ID"
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim() && !searching) runSearch();
                }}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
              <button
                type="button"
                onClick={runSearch}
                disabled={searching || !query.trim()}
                className="min-h-11 shrink-0 cursor-pointer rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
            {searchError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {searchError}
              </p>
            )}
            {results !== null && (
              <div className="mt-4">
                {results.length === 0 ? (
                  <p className="text-sm text-zinc-500">No merchants matched.</p>
                ) : (
                  <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200">
                    {results.map((r) => {
                      const creditBadge = scoreBadge(r.creditScore);
                      return (
                        <Link
                          key={r.merchantId}
                          href={`/lender/merchants/${r.merchantId}`}
                          className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-zinc-900">
                              {r.businessName}
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {r.recommendedLoanAmount !== null
                                ? `Eligible ${formatNairaShort(r.recommendedLoanAmount)}`
                                : "No offer yet"}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${creditBadge.className}`}
                          >
                            {creditBadge.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <div className="mt-4 grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
          {/* Risk distribution */}
          <section className="border-l-2 border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Risk distribution
            </p>
            {stats.activeCount === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                Approve a loan to start tracking portfolio risk.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {(
                  [
                    { key: "low", label: "Low risk", count: stats.risk.low, tone: "bg-emerald-500", text: "text-emerald-700" },
                    { key: "medium", label: "Medium", count: stats.risk.medium, tone: "bg-amber-400", text: "text-amber-700" },
                    { key: "high", label: "High risk", count: stats.risk.high, tone: "bg-red-500", text: "text-red-700" },
                  ] as const
                ).map((bucket) => {
                  const pct =
                    stats.activeCount > 0
                      ? Math.round((bucket.count / stats.activeCount) * 100)
                      : 0;
                  return (
                    <div key={bucket.key}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className={`font-semibold ${bucket.text}`}>{bucket.label}</span>
                        <span className="font-mono text-zinc-600">
                          {bucket.count} · {pct}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={`h-full rounded-full ${bucket.tone} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Eligible opportunities */}
          <section
            id="eligible"
            className="border-l-2 border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              New eligible merchants
            </p>
            {eligible.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                No new scored merchants outside your portfolio right now. Use Search to find
                someone specific.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-zinc-100">
                {eligible.map((m) => (
                  <li key={m.merchantId} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900">
                        {m.businessName}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Score {m.creditScore ?? "—"}
                        {m.recommendedLoanAmount != null
                          ? ` · Eligible ${formatNairaShort(m.recommendedLoanAmount)}`
                          : ""}
                      </p>
                    </div>
                    <Link
                      href={`/lender/merchants/${m.merchantId}`}
                      className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      Review
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Activity */}
        {stats.activity.length > 0 && (
          <section className="mt-4 border-l-2 border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Recent activity
            </p>
            <ul className="mt-3 space-y-2.5">
              {stats.activity.map((item) => (
                <li key={item.id} className="flex items-start gap-2.5 text-sm text-zinc-700">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.tone === "warn"
                        ? "bg-amber-500"
                        : item.tone === "bad"
                          ? "bg-red-500"
                          : "bg-emerald-500"
                    }`}
                  />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div id="attention" className="mt-4">
          <LoanPortfolioCard loans={portfolioLoans} attentionFirst />
        </div>

        <div id="portfolio" className="sr-only" aria-hidden />
      </div>
    </main>
  );
}
