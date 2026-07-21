"use client";

import Link from "next/link";

interface RepaymentPeriod {
  period: number;
  amount: number;
  dueDate: string;
  status: "pending" | "paid";
  paidAmount: number;
  paidAt: string | null;
}

export interface PortfolioLoan {
  loanId: string;
  merchantId: string;
  businessName: string;
  amount: number;
  status: string;
  interestRate: number | null;
  termMonths: number | null;
  mockRepaymentSchedule: RepaymentPeriod[] | null;
  creditScoreAtApproval?: number | null;
  createdAt?: string;
}

type RiskLevel = "low" | "medium" | "high";

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function nextDue(loan: PortfolioLoan): RepaymentPeriod | null {
  return (loan.mockRepaymentSchedule ?? []).find((p) => p.status !== "paid") ?? null;
}

function loanRisk(loan: PortfolioLoan): RiskLevel {
  if (loan.status === "repaid") return "low";
  const due = nextDue(loan);
  if (due) {
    const days = daysUntil(due.dueDate);
    if (days < 0) return "high";
    if (days <= 7) return "medium";
  }
  const score = loan.creditScoreAtApproval;
  if (score !== null && score !== undefined) {
    if (score < 50) return "high";
    if (score < 70) return "medium";
    return "low";
  }
  if (loan.status === "approved") return "medium";
  return "low";
}

function riskLabel(risk: RiskLevel) {
  if (risk === "high") return { label: "High risk", className: "bg-red-50 text-red-700" };
  if (risk === "medium") return { label: "Watch", className: "bg-amber-50 text-amber-700" };
  return { label: "Low risk", className: "bg-emerald-50 text-emerald-700" };
}

function statusTone(status: string) {
  if (status === "repaid") return { bg: "bg-green-50", text: "text-green-700", label: "Repaid" };
  if (status === "repaying") return { bg: "bg-brand-tint", text: "text-brand", label: "Repaying" };
  if (status === "approved") return { bg: "bg-amber-50", text: "text-amber-700", label: "Approved" };
  return { bg: "bg-zinc-100", text: "text-zinc-600", label: "Pending" };
}

function attentionRank(loan: PortfolioLoan): number {
  const due = nextDue(loan);
  if (!due) return 1000;
  const days = daysUntil(due.dueDate);
  if (days < 0) return days; // most overdue first
  return days;
}

export function computePortfolioStats(loans: PortfolioLoan[]) {
  const active = loans.filter((l) => l.status !== "repaid" && l.status !== "pending");
  const repaid = loans.filter((l) => l.status === "repaid");
  const deployed = active.reduce((sum, l) => sum + l.amount, 0);

  let paidPeriods = 0;
  let totalPeriods = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let dueSoonCount = 0;
  const scoreSum: number[] = [];
  const risk = { low: 0, medium: 0, high: 0 };

  for (const loan of active) {
    const schedule = loan.mockRepaymentSchedule ?? [];
    paidPeriods += schedule.filter((p) => p.status === "paid").length;
    totalPeriods += schedule.length;

    const due = nextDue(loan);
    if (due) {
      const days = daysUntil(due.dueDate);
      const remaining = due.amount - due.paidAmount;
      if (days < 0) {
        overdueCount += 1;
        overdueAmount += remaining;
      } else if (days <= 7) {
        dueSoonCount += 1;
      }
    }

    if (loan.creditScoreAtApproval != null) {
      scoreSum.push(loan.creditScoreAtApproval);
    }

    risk[loanRisk(loan)] += 1;
  }

  const repaymentRate =
    totalPeriods > 0 ? Math.round((paidPeriods / totalPeriods) * 1000) / 10 : null;
  const avgCreditScore =
    scoreSum.length > 0
      ? Math.round(scoreSum.reduce((a, b) => a + b, 0) / scoreSum.length)
      : null;

  type Activity = { id: string; text: string; tone: "ok" | "warn" | "bad" };
  const activity: Activity[] = [];

  for (const loan of [...loans].sort((a, b) => attentionRank(a) - attentionRank(b)).slice(0, 8)) {
    const due = nextDue(loan);
    if (due) {
      const days = daysUntil(due.dueDate);
      const amt = formatNaira(due.amount - due.paidAmount);
      if (days < 0) {
        activity.push({
          id: `${loan.loanId}-od`,
          text: `${loan.businessName} · ${amt} overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`,
          tone: "bad",
        });
      } else if (days <= 7) {
        activity.push({
          id: `${loan.loanId}-soon`,
          text: `${loan.businessName} · ${amt} due in ${days} day${days === 1 ? "" : "s"}`,
          tone: "warn",
        });
      }
    }
    if (loan.status === "approved") {
      activity.push({
        id: `${loan.loanId}-ap`,
        text: `Approved ${formatNaira(loan.amount)} for ${loan.businessName}`,
        tone: "ok",
      });
    } else if (loan.status === "repaying") {
      const schedule = loan.mockRepaymentSchedule ?? [];
      const paid = schedule.filter((p) => p.status === "paid").length;
      if (paid > 0) {
        activity.push({
          id: `${loan.loanId}-pay`,
          text: `${loan.businessName} · ${paid} of ${schedule.length} periods paid`,
          tone: "ok",
        });
      }
    }
  }

  // Dedupe by id, keep first 6
  const seen = new Set<string>();
  const uniqueActivity = activity.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  }).slice(0, 6);

  return {
    deployed,
    activeCount: active.length,
    repaidCount: repaid.length,
    repaymentRate,
    avgCreditScore,
    overdueCount,
    overdueAmount,
    dueSoonCount,
    risk,
    activity: uniqueActivity,
  };
}

function PortfolioRow({ loan }: { loan: PortfolioLoan }) {
  const tone = statusTone(loan.status);
  const risk = riskLabel(loanRisk(loan));
  const schedule = loan.mockRepaymentSchedule ?? [];
  const paidCount = schedule.filter((p) => p.status === "paid").length;
  const due = nextDue(loan);
  const days = due ? daysUntil(due.dueDate) : null;

  return (
    <Link
      href={`/lender/merchants/${loan.merchantId}`}
      className="block border-t border-zinc-100 px-4 py-3.5 transition hover:bg-zinc-50 first:border-t-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-900">{loan.businessName}</p>
          <p className="mt-0.5 font-mono text-base font-bold tracking-tight text-zinc-950">
            {formatNaira(loan.amount)}
          </p>
          {loan.creditScoreAtApproval != null && (
            <p className="mt-0.5 text-xs text-zinc-500">
              Credit {loan.creditScoreAtApproval} at approval
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${risk.className}`}>
            {risk.label}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone.bg} ${tone.text}`}>
            {tone.label}
          </span>
        </div>
      </div>

      {due && days !== null && (
        <p className="mt-2 text-sm text-zinc-600">
          {days < 0
            ? `Overdue · ${formatNaira(due.amount - due.paidAmount)}`
            : days === 0
              ? `Due today · ${formatNaira(due.amount - due.paidAmount)}`
              : `Next payment in ${days} days · ${formatNaira(due.amount - due.paidAmount)}`}
        </p>
      )}

      {schedule.length > 0 && (
        <div className="mt-2.5">
          <div className="mb-1 flex justify-between text-[10px] font-medium text-zinc-400">
            <span>
              {paidCount}/{schedule.length} paid
            </span>
            <span>{Math.round((paidCount / schedule.length) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${(paidCount / schedule.length) * 100}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}

export function LoanPortfolioCard({
  loans,
  attentionFirst = false,
}: {
  loans: PortfolioLoan[];
  attentionFirst?: boolean;
}) {
  const active = loans.filter((l) => l.status !== "repaid");
  const sorted = attentionFirst
    ? [...active].sort((a, b) => attentionRank(a) - attentionRank(b))
    : active;

  const needsAttention = sorted.filter((l) => {
    const due = nextDue(l);
    if (!due) return false;
    return daysUntil(due.dueDate) <= 7;
  });

  const rest = sorted.filter((l) => !needsAttention.includes(l));

  return (
    <section className="border-l-2 border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-6">
      {needsAttention.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Needs attention
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-amber-200/80">
            {needsAttention.map((loan) => (
              <PortfolioRow key={loan.loanId} loan={loan} />
            ))}
          </div>
        </>
      )}

      <div className={needsAttention.length > 0 ? "mt-5" : ""}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Active portfolio
          </p>
          {loans.length > 0 && (
            <p className="font-mono text-xs font-semibold text-zinc-500">
              {active.length} loan{active.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        {active.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            No loans yet — review an eligible merchant or search to underwrite.
          </p>
        ) : rest.length === 0 && needsAttention.length > 0 ? (
          <p className="mt-3 text-sm text-zinc-500">All active loans are listed above.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
            {(needsAttention.length > 0 ? rest : sorted).map((loan) => (
              <PortfolioRow key={loan.loanId} loan={loan} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
