"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import { formatDate, formatNaira } from "@/lib/fraud-labels";
import type { Transaction } from "../transactions-list";

interface Merchant {
  id: string;
  business_name: string;
}

const PAGE_SIZE = 20;

export default function AllTransactionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [flaggedTransactionIds, setFlaggedTransactionIds] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (merchantId: string, offset: number) => {
    const supabase = getBrowserSupabaseClient();
    const { data, error: fetchError } = await supabase
      .from("transactions")
      .select("id, amount, payer_name, payer_account, created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (fetchError) {
      console.error("Failed to load transactions", fetchError);
      return [];
    }
    return (data ?? []) as Transaction[];
  }, []);

  const fetchOpenFlags = useCallback(async (merchantId: string) => {
    const supabase = getBrowserSupabaseClient();
    const { data, error: fetchError } = await supabase
      .from("fraud_flags")
      .select("transaction_id, status, transactions!inner(merchant_id)")
      .eq("status", "open")
      .eq("transactions.merchant_id", merchantId);

    if (fetchError) {
      console.error("Failed to load fraud flags", fetchError);
      return new Set<string>();
    }
    return new Set((data ?? []).map((f) => f.transaction_id as string));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: merchantRow, error: merchantError } = await supabase
        .from("merchants")
        .select("id, business_name")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (merchantError || !merchantRow) {
        setError("Couldn't find a merchant profile for this account.");
        setLoading(false);
        return;
      }

      setMerchant(merchantRow as Merchant);

      const [firstPage, openFlagIds] = await Promise.all([
        fetchPage((merchantRow as Merchant).id, 0),
        fetchOpenFlags((merchantRow as Merchant).id),
      ]);

      if (cancelled) return;
      setTransactions(firstPage);
      setFlaggedTransactionIds(openFlagIds);
      setHasMore(firstPage.length === PAGE_SIZE);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, fetchPage, fetchOpenFlags]);

  async function loadMore() {
    if (!merchant) return;
    setLoadingMore(true);
    try {
      const nextPage = await fetchPage(merchant.id, transactions.length);
      setTransactions((prev) => [...prev, ...nextPage]);
      setHasMore(nextPage.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-6">
        <p className="text-sm font-medium text-zinc-500">Loading transactions…</p>
      </div>
    );
  }

  if (error || !merchant) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-6 text-center">
        <p className="text-sm font-medium text-zinc-600">{error ?? "Merchant not found."}</p>
        <Link
          href="/dashboard"
          className="cursor-pointer text-sm font-semibold text-brand underline decoration-brand/35 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <main className="flex flex-1 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href="/dashboard"
          className="cursor-pointer text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          &larr; Back to dashboard
        </Link>

        <h1 className="font-display mt-4 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">
          All transactions
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{merchant.business_name}</p>

        <section className="mt-6 border-l-2 border-zinc-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100">
          {transactions.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No payments yet — they&apos;ll show up here as customers pay into
              your dedicated account.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {transactions.map((tx) => {
                const flagged = flaggedTransactionIds.has(tx.id);
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
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

          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-5 min-h-11 w-full cursor-pointer rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
