"use client";

import { formatDate, formatNaira } from "@/lib/fraud-labels";

export interface Transaction {
  id: string;
  amount: number;
  payer_name: string | null;
  payer_account: string | null;
  created_at: string;
}

export function TransactionsCard({
  transactions,
  flaggedTransactionIds,
}: {
  transactions: Transaction[];
  flaggedTransactionIds: Set<string>;
}) {
  return (
    <section className="border-l-2 border-zinc-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Recent transactions
        </p>
        {transactions.length > 0 && (
          <span className="text-xs text-zinc-400">
            Last {transactions.length}
          </span>
        )}
      </div>

      {transactions.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">
          No payments yet — they&apos;ll show up here as customers pay into
          your dedicated account.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-zinc-100">
          {transactions.map((tx) => {
            const flagged = flaggedTransactionIds.has(tx.id);
            return (
              <div
                key={tx.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {tx.payer_name ?? "Unknown payer"}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {formatDate(tx.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {flagged && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      Flagged
                    </span>
                  )}
                  <p className="font-mono text-sm font-semibold text-zinc-900">
                    {formatNaira(tx.amount)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
