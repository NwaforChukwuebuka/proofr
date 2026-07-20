"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  RULE_LABELS,
  SeverityBadge,
  formatDate,
  formatNaira,
  type RuleType,
  type Severity,
} from "@/lib/fraud-labels";

const SECRET_STORAGE_KEY = "proofr_admin_secret";

interface QueueItem {
  flagId: string;
  transactionId: string;
  merchantId: string;
  ruleType: RuleType;
  severity: Severity;
  createdAt: string;
  amount: number;
  payerName: string | null;
  businessName: string;
}

export default function AdminPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  const loadQueue = useCallback(async (adminSecret: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/fraud-queue", {
        headers: { "x-admin-secret": adminSecret },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SECRET_STORAGE_KEY);
        setSecret(null);
        setAuthError("Wrong admin secret.");
        return;
      }
      if (!res.ok) {
        setLoadError("Couldn't load the fraud queue.");
        return;
      }
      setQueue((await res.json()) as QueueItem[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function load() {
      const stored = sessionStorage.getItem(SECRET_STORAGE_KEY);
      if (stored) {
        setSecret(stored);
        await loadQueue(stored);
      }
    }
    load();
  }, [loadQueue]);

  function submitSecret() {
    if (!secretInput.trim()) return;
    const value = secretInput.trim();
    sessionStorage.setItem(SECRET_STORAGE_KEY, value);
    setAuthError(null);
    setSecret(value);
    loadQueue(value);
  }

  async function override(flagId: string, action: "clear" | "confirm") {
    if (!secret) return;
    setActingOnId(flagId);
    try {
      const res = await fetch(`/api/admin/fraud-flags/${flagId}/override`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret,
        },
        body: JSON.stringify({ action }),
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SECRET_STORAGE_KEY);
        setSecret(null);
        setAuthError("Wrong admin secret.");
        return;
      }
      if (!res.ok) {
        setLoadError("Couldn't update that flag.");
        return;
      }
      if (action === "clear") {
        setQueue((prev) => (prev ?? []).filter((f) => f.flagId !== flagId));
      } else {
        setConfirmedIds((prev) => new Set(prev).add(flagId));
      }
    } finally {
      setActingOnId(null);
    }
  }

  if (!secret) {
    return (
      <div className="flex flex-1 flex-col items-center bg-brand px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-100 hover:text-white"
          >
            &larr; PROOFR
          </Link>

          <div className="mt-4 rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">
              Admin
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Enter the admin secret to view the fraud queue.
            </p>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-zinc-700">
                  Admin secret
                </span>
                <input
                  type="password"
                  value={secretInput}
                  onChange={(e) => setSecretInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && secretInput.trim()) submitSecret();
                  }}
                  className="mt-1 w-full rounded-xl border-2 border-brand-tint bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-brand"
                />
              </label>

              {authError && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                  {authError}
                </p>
              )}

              <button
                type="button"
                onClick={submitSecret}
                disabled={!secretInput.trim()}
                className="w-full rounded-full bg-brand px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
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
            onClick={() => {
              sessionStorage.removeItem(SECRET_STORAGE_KEY);
              setSecret(null);
              setQueue(null);
            }}
            className="text-sm font-medium text-blue-100 hover:text-white"
          >
            Sign out
          </button>
        </div>

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">
          Fraud queue
        </h1>
        <p className="mt-1 text-sm text-blue-100">
          Open flags awaiting review.
        </p>

        <div className="mt-4 rounded-3xl bg-white p-6 shadow-2xl">
          {loading && <p className="text-sm text-zinc-400">Loading…</p>}

          {loadError && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </p>
          )}

          {!loading && queue && queue.length === 0 && (
            <p className="text-sm text-zinc-400">No open flags — all clear.</p>
          )}

          {!loading && queue && queue.length > 0 && (
            <div className="space-y-3">
              {queue.map((item) => {
                const isConfirmed = confirmedIds.has(item.flagId);
                const isActing = actingOnId === item.flagId;
                return (
                  <div
                    key={item.flagId}
                    className="rounded-2xl bg-red-50/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900">
                          {RULE_LABELS[item.ruleType]}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {item.businessName}
                        </p>
                      </div>
                      <SeverityBadge severity={item.severity} />
                    </div>

                    <p className="mt-2 text-xs text-zinc-500">
                      {formatNaira(item.amount)}
                      {item.payerName ? ` · ${item.payerName}` : ""}
                      {" · "}
                      {formatDate(item.createdAt)}
                    </p>

                    {isConfirmed && (
                      <span className="mt-2 inline-block rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                        Confirmed — still open
                      </span>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => override(item.flagId, "clear")}
                        disabled={isActing}
                        className="flex-1 rounded-full bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-50"
                      >
                        {isActing ? "…" : "Clear"}
                      </button>
                      <button
                        type="button"
                        onClick={() => override(item.flagId, "confirm")}
                        disabled={isActing || isConfirmed}
                        className="flex-1 rounded-full bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                      >
                        {isActing ? "…" : isConfirmed ? "Confirmed" : "Confirm"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
