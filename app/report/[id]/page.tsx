"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import { TrendChart } from "@/app/dashboard/trend-chart";
import {
  RULE_LABELS,
  SeverityBadge,
  formatDate,
  formatNaira,
  type RuleType,
  type Severity,
  type FlagStatus,
} from "@/lib/fraud-labels";
import type { CreditScoreBreakdown } from "@/lib/creditScore";

interface ReportFlag {
  id: string;
  rule_type: RuleType;
  severity: Severity;
  status: FlagStatus;
  transaction_id: string;
  payer_account: string | null;
  amount: number | null;
  created_at: string;
}

interface Report {
  reportId: string;
  profile: {
    businessName: string;
    approvalStatus: string;
    hasVirtualAccount: boolean;
  };
  verificationStatus: {
    bvnNinVerified: boolean;
  };
  revenueSummary: { grossInflow: number; verifiedRevenue: number };
  trendData: { period: string; amount: number }[];
  confidenceScore: number;
  creditScore: number | null;
  creditScoreBreakdown: CreditScoreBreakdown | null;
  fraudFlags: ReportFlag[];
  generatedAt: string;
}

function confidenceTone(score: number) {
  if (score >= 80) return { ring: "text-green-600", bg: "bg-green-50", label: "Strong" };
  if (score >= 50) return { ring: "text-amber-600", bg: "bg-amber-50", label: "Fair" };
  return { ring: "text-red-600", bg: "bg-red-50", label: "Weak" };
}

const TREND_DIRECTION_LABELS: Record<CreditScoreBreakdown["revenueTrend"]["direction"], string> = {
  growing: "Growing",
  stable: "Stable",
  declining: "Declining",
  insufficient_data: "Not enough history yet",
};

function creditScoreComponents(breakdown: CreditScoreBreakdown) {
  return [
    {
      label: "Revenue trend",
      max: 25,
      score: breakdown.revenueTrend.score,
      detail: TREND_DIRECTION_LABELS[breakdown.revenueTrend.direction],
    },
    {
      label: "Revenue consistency",
      max: 25,
      score: breakdown.revenueConsistency.score,
      detail:
        breakdown.revenueConsistency.coefficientOfVariation === null
          ? "Not enough history yet"
          : "Day-to-day steadiness of inflow",
    },
    {
      label: "Account tenure",
      max: 20,
      score: breakdown.tenure.score,
      detail: `${breakdown.tenure.platformDays} day${breakdown.tenure.platformDays === 1 ? "" : "s"} on PROOFR${
        breakdown.tenure.selfReportedDays !== null
          ? `, ${breakdown.tenure.selfReportedDays} self-reported`
          : ""
      }`,
    },
    {
      label: "Customer behavior",
      max: 20,
      score: breakdown.customerBehavior.score,
      detail: `${breakdown.customerBehavior.uniqueCustomers} unique customer${
        breakdown.customerBehavior.uniqueCustomers === 1 ? "" : "s"
      }${
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

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const merchantId = params.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const reportIdParam = searchParams.get("reportId");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const loadViaShareLink = useCallback(async (rid: string) => {
    const res = await fetch(
      `/api/merchants/${merchantId}/report?reportId=${rid}`
    );
    if (!res.ok) {
      setError(
        res.status === 404
          ? "This report link is no longer valid."
          : "Couldn't load this report."
      );
      return;
    }
    setReport((await res.json()) as Report);
  }, [merchantId]);

  const loadLatestAsOwner = useCallback(async (token: string) => {
    const res = await fetch(`/api/merchants/${merchantId}/report`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      setReport(null);
      return;
    }
    if (!res.ok) {
      setError("Couldn't load your report.");
      return;
    }
    setReport((await res.json()) as Report);
  }, [merchantId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        if (cancelled) return;
        setAccessToken(session.access_token);
        const { data: ownedMerchant } = await supabase
          .from("merchants")
          .select("id")
          .eq("id", merchantId)
          .eq("auth_user_id", session.user.id)
          .maybeSingle();
        if (cancelled) return;
        setIsOwner(!!ownedMerchant);
      }

      if (reportIdParam) {
        await loadViaShareLink(reportIdParam);
      } else if (session) {
        await loadLatestAsOwner(session.access_token);
      } else {
        router.replace("/login");
        return;
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [merchantId, reportIdParam, loadViaShareLink, loadLatestAsOwner, router]);

  async function generateReport() {
    if (!accessToken) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchants/${merchantId}/report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        setError("Couldn't generate a new report.");
        return;
      }
      const { reportId: newReportId } = (await res.json()) as { reportId: string };
      router.replace(`/report/${merchantId}?reportId=${newReportId}`);
      await loadViaShareLink(newReportId);
    } finally {
      setRegenerating(false);
    }
  }

  function copyShareLink() {
    if (!report) return;
    const url = `${window.location.origin}/report/${merchantId}?reportId=${report.reportId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-brand">
        <p className="text-sm font-medium text-blue-100">Loading report…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-brand px-6 text-center">
        <p className="text-sm font-medium text-blue-100">{error}</p>
        <Link href="/" className="text-sm font-semibold text-white underline">
          Back home
        </Link>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-brand px-6 text-center">
        <p className="text-sm font-medium text-blue-100">
          No report has been generated yet.
        </p>
        {isOwner && (
          <button
            type="button"
            onClick={generateReport}
            disabled={regenerating}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand shadow-lg disabled:opacity-60"
          >
            {regenerating ? "Generating…" : "Generate report"}
          </button>
        )}
      </div>
    );
  }

  const tone = confidenceTone(report.confidenceScore);
  const excluded = report.revenueSummary.grossInflow - report.revenueSummary.verifiedRevenue;

  return (
    <div className="flex flex-1 flex-col items-center bg-brand px-4 py-10 print:bg-white print:px-0 print:py-0 sm:px-6">
      <div className="w-full max-w-md print:max-w-full">
        <div className="flex items-center justify-between print:hidden">
          <Link href="/" className="text-sm font-medium text-blue-100 hover:text-white">
            PROOFR
          </Link>
          {isOwner && (
            <Link
              href="/dashboard"
              className="text-sm font-medium text-blue-100 hover:text-white"
            >
              Back to dashboard
            </Link>
          )}
        </div>

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white print:mt-0 print:text-black">
          Proof-of-Revenue report
        </h1>
        <p className="mt-1 text-sm text-blue-100 print:text-zinc-500">
          {report.profile.businessName} · generated{" "}
          {formatDate(report.generatedAt)}
        </p>

        <div className="mt-4 space-y-4 print:space-y-3">
          {/* Credit score — headline number, the repayment-likelihood signal */}
          {report.creditScore !== null && report.creditScoreBreakdown ? (
            <div className="rounded-3xl bg-white p-6 text-center shadow-2xl print:shadow-none print:border print:border-zinc-200 sm:p-8">
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
            <div className="rounded-3xl bg-white p-6 text-center shadow-2xl print:shadow-none print:border print:border-zinc-200">
              <p className="text-xs font-medium text-zinc-400">Credit score</p>
              <p className="mt-2 text-sm text-zinc-500">
                Not available for this report — generate a fresh snapshot to compute it.
              </p>
            </div>
          )}

          {/* Fraud confidence score — narrower, fraud-only signal */}
          <div className="rounded-3xl bg-white p-6 text-center shadow-2xl print:shadow-none print:border print:border-zinc-200 sm:p-8">
            <p className="text-xs font-medium text-zinc-400">
              Fraud confidence score
            </p>
            <p className={`mt-2 text-4xl font-extrabold ${tone.ring}`}>
              {report.confidenceScore}
            </p>
            <span
              className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${tone.bg} ${tone.ring}`}
            >
              {tone.label}
            </span>
            <p className="mt-3 text-xs text-zinc-400">
              Measures only whether this transaction history looks suspicious — see the credit score above for the broader repayment signal.
            </p>
          </div>

          {/* Profile + verification */}
          <div className="rounded-3xl bg-white p-6 shadow-2xl print:shadow-none print:border print:border-zinc-200">
            <p className="text-xs font-medium text-zinc-400">Merchant profile</p>
            <p className="mt-1 text-lg font-bold text-zinc-900">
              {report.profile.businessName}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  report.profile.approvalStatus === "approved"
                    ? "bg-green-50 text-green-700"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {report.profile.approvalStatus === "approved"
                  ? "Approved merchant"
                  : report.profile.approvalStatus}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  report.verificationStatus.bvnNinVerified
                    ? "bg-green-50 text-green-700"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {report.verificationStatus.bvnNinVerified
                  ? "BVN/NIN verified"
                  : "BVN/NIN unverified"}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  report.profile.hasVirtualAccount
                    ? "bg-green-50 text-green-700"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {report.profile.hasVirtualAccount
                  ? "Dedicated account issued"
                  : "No virtual account"}
              </span>
            </div>
          </div>

          {/* Revenue summary + trend */}
          <div className="rounded-3xl bg-white p-6 shadow-2xl print:shadow-none print:border print:border-zinc-200">
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

            <p className="mt-5 text-xs font-semibold text-zinc-500">Trend</p>
            <div className="mt-3">
              <TrendChart trend={report.trendData} />
            </div>
          </div>

          {/* Fraud flags */}
          {report.fraudFlags.length > 0 && (
            <div className="rounded-3xl bg-white p-6 shadow-2xl print:shadow-none print:border print:border-zinc-200">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-400">Fraud flags</p>
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-700 print:border print:border-red-200">
                  {report.fraudFlags.length} open
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {report.fraudFlags.map((flag) => (
                  <div
                    key={flag.id}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-red-50/60 p-3 print:border print:border-red-100 print:bg-white"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900">
                        {RULE_LABELS[flag.rule_type]}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {flag.amount != null ? formatNaira(flag.amount) : "—"}
                        {" · "}
                        {formatDate(flag.created_at)}
                      </p>
                    </div>
                    <SeverityBadge severity={flag.severity} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Share + download */}
          <div className="rounded-3xl bg-white p-6 shadow-2xl print:hidden">
            <p className="text-xs font-medium text-zinc-400">Share with a lender</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={copyShareLink}
                className="flex-1 rounded-full bg-brand-tint px-4 py-2.5 text-sm font-semibold text-brand hover:bg-blue-100"
              >
                {copied ? "Link copied" : "Copy share link"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Download / Print
              </button>
            </div>
            <p className="mt-3 text-xs text-zinc-400">
              Anyone with this link can view this report — links don&apos;t
              expire yet, so only share it with people you trust.
            </p>
            {isOwner && (
              <button
                type="button"
                onClick={generateReport}
                disabled={regenerating}
                className="mt-3 text-xs font-semibold text-brand underline disabled:opacity-60"
              >
                {regenerating ? "Generating…" : "Generate a fresh snapshot"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
