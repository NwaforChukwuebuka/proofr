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
      <div className="flex flex-1 items-center justify-center bg-brand">
        <p className="text-sm font-medium text-blue-100">Loading merchant…</p>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-brand px-6 text-center">
        <p className="text-sm font-medium text-blue-100">Merchant not found.</p>
        <Link href="/lender" className="text-sm font-semibold text-white underline">
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
    <div className="flex flex-1 flex-col items-center bg-brand px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between">
          <Link href="/lender" className="text-sm font-medium text-blue-100 hover:text-white">
            &larr; Search
          </Link>
        </div>

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">
          {merchant.business_name}
        </h1>

        <div className="mt-4 space-y-4">
          {!reportChecked ? (
            <div className="rounded-3xl bg-white p-6 text-center shadow-2xl">
              <p className="text-sm text-zinc-500">Loading report…</p>
            </div>
          ) : !report ? (
            <div className="rounded-3xl bg-white p-6 shadow-2xl">
              <p className="text-xs font-medium text-zinc-400">Credit score</p>
              <p className="mt-2 text-sm text-zinc-500">
                This merchant hasn&apos;t generated a Proof-of-Revenue report yet
                — no score or revenue summary is available.
              </p>
            </div>
          ) : (
            <>
              {report.creditScore !== null && report.creditScoreBreakdown ? (
                <div className="rounded-3xl bg-white p-6 text-center shadow-2xl">
                  <p className="text-xs font-medium text-zinc-400">Credit score</p>
                  <p className={`mt-2 text-6xl font-extrabold ${confidenceTone(report.creditScore).ring}`}>
                    {report.creditScore}
                  </p>
                  <span
                    className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                      confidenceTone(report.creditScore).bg
                    } ${confidenceTone(report.creditScore).ring}`}
                  >
                    {confidenceTone(report.creditScore).label}
                  </span>
                  <p className="mt-3 text-xs text-zinc-400">
                    Repayment-likelihood signal — how likely this merchant is to repay a loan, not just how much revenue they report.
                  </p>
                  <div className="mt-4 space-y-2 text-left">
                    {creditScoreComponents(report.creditScoreBreakdown).map((c) => (
                      <div key={c.label} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-700">{c.label}</p>
                          <p className="truncate text-[11px] text-zinc-400">{c.detail}</p>
                        </div>
                        <p className="shrink-0 text-xs font-semibold text-zinc-500">
                          {Math.round(c.score * 10) / 10}/{c.max}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl bg-white p-6 text-center shadow-2xl">
                  <p className="text-xs font-medium text-zinc-400">Credit score</p>
                  <p className="mt-2 text-sm text-zinc-500">Not available for this report.</p>
                </div>
              )}

              {report.recommendedLoanAmount !== null && report.loanRecommendationBreakdown ? (
                <div className="rounded-3xl bg-white p-6 shadow-2xl">
                  <p className="text-xs font-medium text-zinc-400">Recommended loan amount</p>
                  <p className="mt-1 text-3xl font-extrabold text-zinc-900">
                    {formatNaira(report.recommendedLoanAmount)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Over {report.loanRecommendationBreakdown.termMonths} months, no interest modeled — pre-filled below
                  </p>
                  <ul className="mt-3 space-y-1">
                    {report.loanRecommendationBreakdown.rationale.map((line) => (
                      <li key={line} className="text-[11px] text-zinc-400">
                        · {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-3xl bg-white p-6 text-center shadow-2xl">
                  <p className="text-xs font-medium text-zinc-400">Recommended loan amount</p>
                  <p className="mt-2 text-sm text-zinc-500">Not available for this report.</p>
                </div>
              )}

              <div className="rounded-3xl bg-white p-6 text-center shadow-2xl">
                <p className="text-xs font-medium text-zinc-400">
                  Fraud confidence score
                </p>
                <p className={`mt-2 text-4xl font-extrabold ${tone!.ring}`}>
                  {report.confidenceScore}
                </p>
                <span
                  className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${tone!.bg} ${tone!.ring}`}
                >
                  {tone!.label}
                </span>
                <p className="mt-3 text-xs text-zinc-400">
                  Measures only whether this transaction history looks suspicious.
                </p>
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-2xl">
                <p className="text-xs font-medium text-zinc-400">Verified revenue</p>
                <p className="mt-1 text-3xl font-extrabold text-zinc-900">
                  {formatNaira(report.revenueSummary.verifiedRevenue)}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Gross inflow: {formatNaira(report.revenueSummary.grossInflow)}
                </p>
                {excluded > 0 && (
                  <p className="mt-1 text-xs font-medium text-red-600">
                    {formatNaira(excluded)} excluded due to flagged activity
                  </p>
                )}

                {report.fraudFlags.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    {report.fraudFlags.map((flag) => (
                      <div
                        key={flag.id}
                        className="flex items-center justify-between rounded-xl bg-red-50/60 px-3 py-2"
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
                  className="mt-4 block rounded-full bg-brand px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  View / download full report
                </Link>
              </div>
            </>
          )}

          {/* Loan approval */}
          <div className="rounded-3xl bg-white p-6 shadow-2xl">
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
                    className="mt-1 w-full rounded-xl border-2 border-brand-tint bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-brand"
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
                  className="mt-4 w-full rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
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
                      className="flex items-center justify-between rounded-xl bg-brand-tint/60 px-3 py-2 text-sm"
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
          </div>
        </div>
      </div>
    </div>
  );
}
