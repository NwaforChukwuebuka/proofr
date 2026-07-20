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
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function statusTone(status: string) {
  if (status === "repaid") return { bg: "bg-green-50", text: "text-green-700", label: "Repaid" };
  if (status === "repaying") return { bg: "bg-brand-tint", text: "text-brand", label: "Repaying" };
  if (status === "approved") return { bg: "bg-amber-50", text: "text-amber-700", label: "Approved" };
  return { bg: "bg-zinc-100", text: "text-zinc-600", label: "Pending" };
}

function PortfolioRow({ loan }: { loan: PortfolioLoan }) {
  const tone = statusTone(loan.status);
  const schedule = loan.mockRepaymentSchedule ?? [];
  const paidCount = schedule.filter((p) => p.status === "paid").length;
  const nextDue = schedule.find((p) => p.status !== "paid");

  return (
    <Link
      href={`/lender/merchants/${loan.merchantId}`}
      className="block border-t border-zinc-100 px-4 py-3.5 transition hover:bg-zinc-50 first:border-t-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900">{loan.businessName}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {formatNaira(loan.amount)}
            {loan.termMonths !== null && loan.interestRate !== null
              ? ` · ${loan.termMonths}mo · ${Math.round(loan.interestRate * 100)}% interest`
              : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone.bg} ${tone.text}`}>
          {tone.label}
        </span>
      </div>

      {schedule.length > 0 && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {paidCount} of {schedule.length} periods paid
            </span>
            {nextDue && (
              <span>
                Next: {formatNaira(nextDue.amount - nextDue.paidAmount)} due{" "}
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
    </Link>
  );
}

export function LoanPortfolioCard({ loans }: { loans: PortfolioLoan[] }) {
  return (
    <section className="border-l-2 border-brand bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Your loan portfolio
      </p>
      {loans.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">
          You haven&apos;t approved any loans yet — search for a merchant below
          to get started.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
          {loans.map((loan) => (
            <PortfolioRow key={loan.loanId} loan={loan} />
          ))}
        </div>
      )}
    </section>
  );
}
