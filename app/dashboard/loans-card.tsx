"use client";

import { Naira } from "@/lib/fraud-labels";

interface RepaymentPeriod {
  period: number;
  amount: number;
  dueDate: string;
  status: "pending" | "paid";
  paidAmount: number;
  paidAt: string | null;
}

export interface Loan {
  loanId: string;
  lenderOrgName: string | null;
  amount: number;
  status: string;
  interestRate: number | null;
  termMonths: number | null;
  mockRepaymentSchedule: RepaymentPeriod[] | null;
  createdAt: string;
  approvedAt: string | null;
}

function statusTone(status: string) {
  if (status === "repaid") return { bg: "bg-green-50", text: "text-green-700", label: "Repaid" };
  if (status === "repaying") return { bg: "bg-brand-tint", text: "text-brand", label: "Repaying" };
  if (status === "approved") return { bg: "bg-amber-50", text: "text-amber-700", label: "Approved" };
  return { bg: "bg-zinc-100", text: "text-zinc-600", label: "Pending" };
}

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function LoanRow({ loan }: { loan: Loan }) {
  const tone = statusTone(loan.status);
  const schedule = loan.mockRepaymentSchedule ?? [];
  const paidCount = schedule.filter((p) => p.status === "paid").length;
  const nextDue = schedule.find((p) => p.status !== "paid");
  const days = nextDue ? daysUntil(nextDue.dueDate) : null;

  return (
    <div className="border-t border-zinc-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
            Active loan
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold tracking-tight text-zinc-900">
            <Naira amount={loan.amount} />
          </p>
          {loan.lenderOrgName && (
            <p className="mt-0.5 truncate text-xs text-zinc-500">{loan.lenderOrgName}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone.bg} ${tone.text}`}>
          {tone.label}
        </span>
      </div>

      {nextDue && days !== null && (
        <p className="mt-2 text-sm text-zinc-600">
          {days < 0
            ? `Payment overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`
            : days === 0
              ? "Payment due today"
              : `Next payment in ${days} day${days === 1 ? "" : "s"}`}
          {" · "}
          <span className="font-medium text-zinc-900">
            <Naira amount={nextDue.amount - nextDue.paidAmount} />
          </span>
        </p>
      )}

      {schedule.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex justify-between text-[10px] font-medium text-zinc-400">
            <span>
              {paidCount} of {schedule.length} paid
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
    </div>
  );
}

export function LoansCard({ loans }: { loans: Loan[] }) {
  if (loans.length === 0) return null;

  const active = loans.filter((l) => l.status !== "repaid");
  const shown = active.length > 0 ? active : loans.slice(0, 1);

  return (
    <section
      id="loans"
      className="min-w-0 border-l-2 border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-6"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Loans
      </p>
      <div className="mt-3 space-y-4">
        {shown.map((loan) => (
          <LoanRow key={loan.loanId} loan={loan} />
        ))}
      </div>
    </section>
  );
}

/** Returns the soonest upcoming loan payment across active loans, if any. */
export function getNextLoanAttention(loans: Loan[]): {
  days: number;
  amount: number;
} | null {
  let best: { days: number; amount: number } | null = null;
  for (const loan of loans) {
    if (loan.status === "repaid" || loan.status === "pending") continue;
    const nextDue = (loan.mockRepaymentSchedule ?? []).find((p) => p.status !== "paid");
    if (!nextDue) continue;
    const days = daysUntil(nextDue.dueDate);
    const amount = nextDue.amount - nextDue.paidAmount;
    if (!best || days < best.days) {
      best = { days, amount };
    }
  }
  return best;
}
