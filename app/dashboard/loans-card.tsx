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
  return { bg: "bg-zinc-100", text: "text-zinc-600", label: "Pending approval" };
}

function LoanRow({ loan }: { loan: Loan }) {
  const tone = statusTone(loan.status);
  const schedule = loan.mockRepaymentSchedule ?? [];
  const paidCount = schedule.filter((p) => p.status === "paid").length;
  const nextDue = schedule.find((p) => p.status !== "paid");

  return (
    <div className="border-t border-zinc-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900">
            <Naira amount={loan.amount} />
            {loan.lenderOrgName ? ` from ${loan.lenderOrgName}` : ""}
          </p>
          {loan.interestRate !== null && loan.termMonths !== null && (
            <p className="mt-0.5 text-xs text-zinc-400">
              {loan.termMonths} months &middot; {Math.round(loan.interestRate * 100)}% flat interest
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone.bg} ${tone.text}`}>
          {tone.label}
        </span>
      </div>

      {schedule.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {paidCount} of {schedule.length} periods paid
            </span>
            {nextDue && (
              <span>
                Next: <Naira amount={nextDue.amount - nextDue.paidAmount} /> due{" "}
                {new Date(nextDue.dueDate).toLocaleDateString("en-NG", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
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

  return (
    <section className="border-l-2 border-zinc-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Loans
      </p>
      <div className="mt-3 space-y-4">
        {loans.map((loan) => (
          <LoanRow key={loan.loanId} loan={loan} />
        ))}
      </div>
    </section>
  );
}
