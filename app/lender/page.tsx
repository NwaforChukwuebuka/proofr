"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase";

interface Lender {
  id: string;
  org_name: string;
}

interface SearchResult {
  merchantId: string;
  businessName: string;
  confidenceScore: number | null;
}

function scoreBadge(score: number | null) {
  if (score === null) {
    return { label: "Not yet scored", className: "bg-zinc-100 text-zinc-500" };
  }
  if (score >= 80) return { label: `${score}`, className: "bg-green-50 text-green-700" };
  if (score >= 50) return { label: `${score}`, className: "bg-amber-50 text-amber-700" };
  return { label: `${score}`, className: "bg-red-50 text-red-700" };
}

export default function LenderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [lender, setLender] = useState<Lender | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

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

  if (loading || error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-brand px-6 text-center">
        <p className="text-sm font-medium text-blue-100">
          {error ?? "Loading…"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-brand px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-blue-100 hover:text-white">
            PROOFR
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="text-sm font-medium text-blue-100 hover:text-white"
          >
            Sign out
          </button>
        </div>

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">
          {lender?.org_name}
        </h1>
        <p className="mt-1 text-sm text-blue-100">Lender portal</p>

        <div className="mt-4 rounded-3xl bg-white p-6 shadow-2xl">
          <p className="text-xs font-medium text-zinc-400">
            Search merchants
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Search by business name or exact merchant id.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={query}
              placeholder="e.g. Suya Spot"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim() && !searching) runSearch();
              }}
              className="min-w-0 flex-1 rounded-xl border-2 border-brand-tint bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searching || !query.trim()}
              className="shrink-0 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>

          {searchError && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {searchError}
            </p>
          )}

          {results !== null && (
            <div className="mt-4 space-y-2">
              {results.length === 0 ? (
                <p className="text-sm text-zinc-400">No merchants matched.</p>
              ) : (
                results.map((r) => {
                  const badge = scoreBadge(r.confidenceScore);
                  return (
                    <Link
                      key={r.merchantId}
                      href={`/lender/merchants/${r.merchantId}`}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-brand-tint/60 p-3.5 hover:bg-brand-tint"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900">
                          {r.businessName}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-400">
                          Revenue confidence score
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
