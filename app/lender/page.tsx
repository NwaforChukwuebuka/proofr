"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import { LoanPortfolioCard, type PortfolioLoan } from "./loan-portfolio";

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

function scoreBadge(score: number | null) {
  if (score === null) {
    return { label: "Not yet scored", className: "bg-zinc-100 text-zinc-500" };
  }
  if (score >= 80) return { label: `${score}`, className: "bg-green-50 text-green-700" };
  if (score >= 50) return { label: `${score}`, className: "bg-amber-50 text-amber-700" };
  return { label: `${score}`, className: "bg-red-50 text-red-700" };
}

function formatNairaShort(amount: number): string {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `₦${(amount / 1_000).toFixed(0)}k`;
  return `₦${amount}`;
}

export default function LenderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [lender, setLender] = useState<Lender | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [portfolioLoans, setPortfolioLoans] = useState<PortfolioLoan[]>([]);

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

      // Direct RLS-scoped query, not a new API route — `loans_select_by_lender`
      // and `merchants_select_by_lenders` (data-model.md) already permit
      // exactly this read: a lender's own loans, joined to any merchant's
      // business_name. No service-role client needed here, unlike
      // GET /api/merchants/:id/loans, which needed one only because a
      // *merchant* has no RLS access to an arbitrary *lender's* org_name —
      // the reverse direction (lender reading merchant names) is already
      // open by design, since merchant search is core to this product.
      const { data: loanRows, error: loansError } = await supabase
        .from("loans")
        .select(
          "id, merchant_id, amount, status, interest_rate, term_months, mock_repayment_schedule, created_at, merchants(business_name)"
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
              amount: row.amount,
              status: row.status,
              interestRate: row.interest_rate,
              termMonths: row.term_months,
              mockRepaymentSchedule: row.mock_repayment_schedule,
            } as PortfolioLoan;
          })
        );
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
        <p className="text-sm font-medium text-zinc-600">Loading…</p>
      </div>
    );
  }

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
          {lender?.org_name}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">Lender portal</p>

        <section className="mt-6 border-l-2 border-brand bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Search merchants
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Search by business name or exact merchant ID.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={query}
              placeholder="e.g. Suya Spot or merchant id"
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
              className="min-h-11 shrink-0 cursor-pointer rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
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
            <div className="mt-5">
              {results.length === 0 ? (
                <p className="text-sm text-zinc-500">No merchants matched.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-200">
                  <div className="grid grid-cols-[minmax(0,1.7fr)_auto_auto] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    <span>Merchant</span>
                    <span>Credit</span>
                    <span>Recommended</span>
                  </div>
                  {results.map((r, index) => {
                    const creditBadge = scoreBadge(r.creditScore);
                    return (
                      <Link
                        key={r.merchantId}
                        href={`/lender/merchants/${r.merchantId}`}
                        className={`grid grid-cols-[minmax(0,1.7fr)_auto_auto] items-center gap-3 px-4 py-3 transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                          index !== results.length - 1 ? "border-b border-zinc-100" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-900">
                            {r.businessName}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
                            ID: {r.merchantId}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${creditBadge.className}`}
                        >
                          {creditBadge.label}
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-zinc-700">
                          {r.recommendedLoanAmount !== null
                            ? formatNairaShort(r.recommendedLoanAmount)
                            : "—"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="mt-5">
          <LoanPortfolioCard loans={portfolioLoans} />
        </div>
      </div>
    </main>
  );
}
