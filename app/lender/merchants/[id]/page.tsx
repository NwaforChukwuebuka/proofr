"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import {
  RULE_LABELS,
  SeverityBadge,
  formatNaira,
  type RuleType,
  type Severity,
  type FlagStatus,
} from "@/lib/fraud-labels";
import type { CreditScoreBreakdown } from "@/lib/creditScore";
import type { LoanRecommendationResult } from "@/lib/loanRecommendation";

interface MerchantRow {
  id: string;
  business_name: string;
  approval_status: string;
}

interface ReportFlag {
  id: string;
  rule_type: RuleType;
  severity: Severity;
  status: FlagStatus;
}

interface Report {
  reportId: string;
  profile: { businessName: string; approvalStatus: string; hasVirtualAccount: boolean };
  revenueSummary: { grossInflow: number; verifiedRevenue: number };
  confidenceScore: number;
  creditScore: number | null;
  creditScoreBreakdown: CreditScoreBreakdown | null;
  recommendedLoanAmount: number | null;
  loanRecommendationBreakdown: (LoanRecommendationResult["breakdown"] & { rationale: string[] }) | null;
  fraudFlags: ReportFlag[];
  generatedAt: string;
}

const TREND_DIRECTION_LABELS: Record<CreditScoreBreakdown["revenueTrend"]["direction"], string> = {
  growing: "Growing",
  stable: "Stable",
  declining: "Declining",
  insufficient_data: "Not enough history yet",
};

function creditScoreComponents(breakdown: CreditScoreBreakdown) {
  return [
    { label: "Revenue trend", max: 25, score: breakdown.revenueTrend.score, detail: TREND_DIRECTION_LABELS[breakdown.revenueTrend.direction] },
    {
      label: "Revenue consistency",
      max: 25,
      score: breakdown.revenueConsistency.score,
      detail: breakdown.revenueConsistency.coefficientOfVariation === null ? "Not enough history yet" : "Day-to-day steadiness of inflow",
    },
    {
      label: "Account tenure",
      max: 20,
      score: breakdown.tenure.score,
      detail: `${breakdown.tenure.platformDays} day${breakdown.tenure.platformDays === 1 ? "" : "s"} on PROOFR${
        breakdown.tenure.selfReportedDays !== null ? `, ${breakdown.tenure.selfReportedDays} self-reported` : ""
      }`,
    },
    {
      label: "Customer behavior",
      max: 20,
      score: breakdown.customerBehavior.score,
      detail: `${breakdown.customerBehavior.uniqueCustomers} unique customer${breakdown.customerBehavior.uniqueCustomers === 1 ? "" : "s"}${
        breakdown.customerBehavior.repeatCustomerRate !== null
          ? `, ${Math.round(breakdown.customerBehavior.repeatCustomerRate * 100)}% repeat`
          : ""
      }`,
    },
    {
      label: "Fraud confidence",
      max: 10,
      score: breakdown.fraudConfidence.score,
      detail: `From the ${breakdown.fraudConfidence.confidenceScore}/100 fraud confidence score below`,
    },
  ];
}

interface RepaymentPeriod {
  period: number;
  amount: number;
  dueDate: string;
}

function confidenceTone(score: number) {
  if (score >= 80) return { ring: "text-green-600", bg: "bg-green-50", label: "Strong" };
  if (score >= 50) return { ring: "text-amber-600", bg: "bg-amber-50", label: "Fair" };
  return { ring: "text-red-600", bg: "bg-red-50", label: "Weak" };
}

export default function LenderMerchantPage() {
  const params = useParams<{ id: string }>();
  const merchantId = params.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [merchant, setMerchant] = useState<MerchantRow | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [reportChecked, setReportChecked] = useState(false);

  const [amount, setAmount] = useState("");
  const [approving, setApproving] = useState(false);
  const [loanError, setLoanError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<RepaymentPeriod[] | null>(null);
  const [loanTerms, setLoanTerms] = useState<{
    interestRate: number;
    termMonths: number;
    totalRepayment: number;
    rationale: string[];
  } | null>(null);

  const loadReport = useCallback(
    async (token: string) => {
      const res = await fetch(`/api/lenders/merchants/${merchantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const loadedReport = (await res.json()) as Report;
        setReport(loadedReport);
        if (loadedReport.recommendedLoanAmount) {
          setAmount(String(loadedReport.recommendedLoanAmount));
        }
      } else {
        setReport(null);
      }
      setReportChecked(true);
    },
    [merchantId]
  );

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
        .select("id")
        .eq("auth_user_id", currentSession.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (!lenderRow) {
        router.replace("/dashboard");
        return;
      }

      setSession(currentSession);

      const { data: merchantRow } = await supabase
        .from("merchants")
        .select("id, business_name, approval_status")
        .eq("id", merchantId)
        .maybeSingle();

      if (cancelled) return;

      if (!merchantRow) {
        setLoading(false);
        return;
      }

      setMerchant(merchantRow as MerchantRow);
      await loadReport(currentSession.access_token);
      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [merchantId, router, loadReport]);

  async function approveLoan() {
    if (!session) return;
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setLoanError("Enter a valid loan amount.");
      return;
    }
    setApproving(true);
    setLoanError(null);
    try {
      const createRes = await fetch("/api/loans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ merchantId, amount: numericAmount }),
      });
      if (!createRes.ok) {
        setLoanError("Couldn't create the loan.");
        return;
      }
      const { loanId } = (await createRes.json()) as { loanId: string };

      const approveRes = await fetch(`/api/loans/${loanId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!approveRes.ok) {
        setLoanError("Loan was created but approval failed.");
        return;
      }
      const approved = (await approveRes.json()) as {
        mockRepaymentSchedule: RepaymentPeriod[];
        interestRate: number;
        termMonths: number;
        totalRepayment: number;
        rationale: string[];
      };
      setSchedule(approved.mockRepaymentSchedule);
      setLoanTerms(approved);
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-6">
        <p className="text-sm font-medium text-zinc-500">Loading merchant…</p>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-6 text-center">
        <p className="text-sm font-medium text-zinc-600">Merchant not found.</p>
        <Link
          href="/lender"
          className="cursor-pointer text-sm font-semibold text-brand underline decoration-brand/35 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Back to search
        </Link>
      </div>
    );
  }

  const tone = report ? confidenceTone(report.confidenceScore) : null;
  const excluded = report
    ? report.revenueSummary.grossInflow - report.revenueSummary.verifiedRevenue
    : 0;

  return (
    <main className="flex flex-1 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center justify-between">
          <Link
            href="/lender"
            className="cursor-pointer text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            &larr; Search
          </Link>
        </div>

        <h1 className="font-display mt-4 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
          {merchant.business_name}
        </h1>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(22rem,1fr)] lg:items-start lg:gap-6">
          <div className="space-y-5">
            {!reportChecked ? (
              <section className="border-l-2 border-zinc-200 bg-white p-6 text-center shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
                <p className="text-sm text-zinc-500">Loading report…</p>
              </section>
            ) : !report ? (
              <section className="border-l-2 border-zinc-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Credit score
                </p>
                <p className="mt-2 text-sm text-zinc-500">
                  This merchant hasn&apos;t generated a Proof-of-Revenue report yet —
                  no score or revenue summary is available.
                </p>
              </section>
            ) : (
              <>
                {report.creditScore !== null && report.creditScoreBreakdown ? (
                  <section className="border-l-2 border-brand bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Credit score
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <p className={`font-mono text-6xl font-bold leading-none ${confidenceTone(report.creditScore).ring}`}>
                        {report.creditScore}
                      </p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          confidenceTone(report.creditScore).bg
                        } ${confidenceTone(report.creditScore).ring}`}
                      >
                        {confidenceTone(report.creditScore).label}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-zinc-500">
                      Repayment-likelihood signal — how likely this merchant is to repay a loan, not just how much revenue they report.
                    </p>
                    <div className="mt-4 space-y-2">
                      {creditScoreComponents(report.creditScoreBreakdown).map((c) => (
                        <div key={c.label} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-zinc-700">{c.label}</p>
                            <p className="truncate text-[11px] text-zinc-500">{c.detail}</p>
                          </div>
                          <p className="shrink-0 text-xs font-semibold text-zinc-500">
                            {Math.round(c.score * 10) / 10}/{c.max}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="border-l-2 border-zinc-200 bg-white p-6 text-center shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Credit score
                    </p>
                    <p className="mt-2 text-sm text-zinc-500">Not available for this report.</p>
                  </section>
                )}

                <section className="border-l-2 border-zinc-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Verified revenue
                  </p>
                  <p className="mt-1 font-mono text-4xl font-bold tracking-tight text-zinc-900">
                    {formatNaira(report.revenueSummary.verifiedRevenue)}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Gross inflow: {formatNaira(report.revenueSummary.grossInflow)}
                  </p>
                  {excluded > 0 && (
                    <p className="mt-1 text-sm font-medium text-red-600">
                      {formatNaira(excluded)} excluded due to flagged activity
                    </p>
                  )}

                  {report.fraudFlags.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      {report.fraudFlags.map((flag) => (
                        <div
                          key={flag.id}
                          className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50/70 px-3 py-2"
                        >
                          <span className="text-xs font-semibold text-zinc-700">
                            {RULE_LABELS[flag.rule_type]}
                          </span>
                          <SeverityBadge severity={flag.severity} />
                        </div>
                      ))}
                    </div>
                  )}

                  <Link
                    href={`/report/${merchantId}?reportId=${report.reportId}`}
                    className="mt-4 block min-h-11 cursor-pointer rounded-full bg-brand px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    View / download full report
                  </Link>
                </section>
              </>
            )}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-6">
            {report && (
              <>
                {report.recommendedLoanAmount !== null && report.loanRecommendationBreakdown ? (
                  <section className="border-l-2 border-brand bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Recommended loan amount
                    </p>
                    <p className="mt-1 font-mono text-3xl font-bold text-zinc-900">
                      {formatNaira(report.recommendedLoanAmount)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Over {report.loanRecommendationBreakdown.termMonths} months, no interest modeled — pre-filled below
                    </p>
                    <ul className="mt-3 space-y-1">
                      {report.loanRecommendationBreakdown.rationale.map((line) => (
                        <li key={line} className="text-[11px] text-zinc-500">
                          · {line}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <section className="border-l-2 border-zinc-200 bg-white p-6 text-center shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Recommended loan amount
                    </p>
                    <p className="mt-2 text-sm text-zinc-500">Not available for this report.</p>
                  </section>
                )}

                <section className="border-l-2 border-zinc-200 bg-white p-6 text-center shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Fraud confidence score
                  </p>
                  <p className={`mt-2 font-mono text-4xl font-bold ${tone!.ring}`}>
                    {report.confidenceScore}
                  </p>
                  <span
                    className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${tone!.bg} ${tone!.ring}`}
                  >
                    {tone!.label}
                  </span>
                  <p className="mt-3 text-xs text-zinc-500">
                    Measures only whether this transaction history looks suspicious.
                  </p>
                </section>
              </>
            )}

            <section className="border-l-2 border-zinc-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
            <p className="text-xs font-medium text-zinc-400">Mock loan</p>
            <p className="mt-1 text-sm text-zinc-500">
              Approve a loan for this merchant. This is a hackathon
              simulation — no funds move.
            </p>

            {!schedule ? (
              <>
                <label className="mt-3 block">
                  <span className="text-sm font-semibold text-zinc-700">
                    Amount (₦)
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={amount}
                    placeholder="e.g. 100000"
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 w-full rounded-xl border-2 border-brand-tint bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  />
                  {report?.recommendedLoanAmount != null &&
                    amount !== String(report.recommendedLoanAmount) && (
                      <button
                        type="button"
                        onClick={() => setAmount(String(report.recommendedLoanAmount))}
                        className="mt-1.5 text-xs font-semibold text-brand underline"
                      >
                        Use recommended amount ({formatNaira(report.recommendedLoanAmount)})
                      </button>
                    )}
                </label>
                {loanError && (
                  <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                    {loanError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={approveLoan}
                  disabled={approving || !amount}
                  className="mt-4 min-h-11 w-full cursor-pointer rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
                >
                  {approving ? "Approving…" : "Approve mock loan"}
                </button>
              </>
            ) : (
              <div className="mt-3">
                <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                  Loan approved.
                </p>
                <p className="mt-3 text-xs font-semibold text-zinc-500">
                  Repayment schedule — {loanTerms?.termMonths ?? schedule.length} months at{" "}
                  {loanTerms ? Math.round(loanTerms.interestRate * 100) : 0}% flat interest
                </p>
                {loanTerms ? (
                  <ul className="mt-1 space-y-0.5">
                    {loanTerms.rationale.map((line) => (
                      <li key={line} className="text-[11px] text-zinc-400">
                        · {line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-zinc-400">
                    Terms and interest are risk-based (credit score tiered), simulated — no real disbursement or amortization.
                  </p>
                )}
                <div className="mt-2 space-y-1.5">
                  {schedule.map((p) => (
                    <div
                      key={p.period}
                      className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-200"
                    >
                      <span className="font-medium text-zinc-600">
                        Period {p.period}
                      </span>
                      <span className="font-semibold text-zinc-900">
                        {formatNaira(p.amount)}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {new Date(p.dueDate).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
