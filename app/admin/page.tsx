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

interface PendingMerchant {
  merchantId: string;
  businessName: string;
  email: string | null;
  phone: string | null;
  kycVerified: boolean;
  kycReference: string | null;
  businessStartedAt: string | null;
  createdAt: string;
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

  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingMerchants, setPendingMerchants] = useState<
    PendingMerchant[] | null
  >(null);
  const [actingOnMerchantId, setActingOnMerchantId] = useState<string | null>(
    null
  );

  const loadPendingMerchants = useCallback(async (adminSecret: string) => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const res = await fetch("/api/admin/pending-merchants", {
        headers: { "x-admin-secret": adminSecret },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SECRET_STORAGE_KEY);
        setSecret(null);
        setAuthError("Wrong admin secret.");
        return;
      }
      if (!res.ok) {
        setPendingError("Couldn't load pending merchants.");
        return;
      }
      setPendingMerchants((await res.json()) as PendingMerchant[]);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  async function merchantDecision(
    merchantId: string,
    action: "approve" | "reject"
  ) {
    if (!secret) return;
    setActingOnMerchantId(merchantId);
    try {
      const res = await fetch(`/api/merchants/${merchantId}/${action}`, {
        method: "POST",
        headers: { "x-admin-secret": secret },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SECRET_STORAGE_KEY);
        setSecret(null);
        setAuthError("Wrong admin secret.");
        return;
      }
      if (!res.ok) {
        setPendingError(`Couldn't ${action} that merchant.`);
        return;
      }
      setPendingMerchants((prev) =>
        (prev ?? []).filter((m) => m.merchantId !== merchantId)
      );
    } finally {
      setActingOnMerchantId(null);
    }
  }

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
        await Promise.all([loadQueue(stored), loadPendingMerchants(stored)]);
      }
    }
    load();
  }, [loadQueue, loadPendingMerchants]);

  function submitSecret() {
    if (!secretInput.trim()) return;
    const value = secretInput.trim();
    sessionStorage.setItem(SECRET_STORAGE_KEY, value);
    setAuthError(null);
    setSecret(value);
    loadQueue(value);
    loadPendingMerchants(value);
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
      <main className="flex flex-1 items-center justify-center bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span aria-hidden>&larr;</span>
            <span className="inline-flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-extrabold text-white">
                P
              </span>
              <span className="font-display tracking-tight text-zinc-900">
                PROOFR
              </span>
            </span>
          </Link>

          <section className="mt-4 border-l-2 border-brand bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Operations
            </p>
            <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight text-zinc-900">
              Admin
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Enter the admin secret to review open fraud flags.
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
                  className="mt-1.5 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                />
              </label>

              {authError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {authError}
                </p>
              )}

              <button
                type="button"
                onClick={submitSecret}
                disabled={!secretInput.trim()}
                className="min-h-11 w-full cursor-pointer rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const openCount = queue?.length ?? 0;
  const pendingCount = pendingMerchants?.length ?? 0;

  return (
    <main className="flex flex-1 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto w-full max-w-7xl">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-extrabold text-white">
              P
            </span>
            <span className="font-display tracking-tight text-zinc-900">
              PROOFR
            </span>
          </Link>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(SECRET_STORAGE_KEY);
              setSecret(null);
              setQueue(null);
              setPendingMerchants(null);
            }}
            className="cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Sign out
          </button>
        </header>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Operations
        </p>

        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
              Merchant approvals
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              New signups waiting to be approved before they can accept
              payments.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="border-l-2 border-brand bg-white px-4 py-2.5 ring-1 ring-zinc-100">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Pending
              </p>
              <p className="font-mono text-2xl font-bold tracking-tight text-zinc-900">
                {pendingLoading ? "…" : pendingCount}
              </p>
            </div>
            <button
              type="button"
              onClick={() => secret && loadPendingMerchants(secret)}
              disabled={pendingLoading}
              className="min-h-11 cursor-pointer rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>

        <section className="mt-6 border-l-2 border-brand bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-6">
          {pendingLoading && (
            <p className="text-sm font-medium text-zinc-500">
              Loading pending merchants…
            </p>
          )}

          {pendingError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {pendingError}
            </p>
          )}

          {!pendingLoading && pendingMerchants && pendingMerchants.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold text-zinc-900">All caught up</p>
              <p className="mt-1 text-sm text-zinc-500">
                No merchants waiting on approval.
              </p>
            </div>
          )}

          {!pendingLoading &&
            pendingMerchants &&
            pendingMerchants.length > 0 && (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-hidden rounded-xl border border-zinc-200 md:block">
                  <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_minmax(11rem,auto)] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    <span>Business</span>
                    <span>Contact</span>
                    <span>KYC</span>
                    <span className="text-right">Actions</span>
                  </div>
                  {pendingMerchants.map((item, index) => {
                    const isActing = actingOnMerchantId === item.merchantId;
                    return (
                      <div
                        key={item.merchantId}
                        className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_minmax(11rem,auto)] items-center gap-3 px-4 py-3.5 ${
                          index !== pendingMerchants.length - 1
                            ? "border-b border-zinc-100"
                            : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-900">
                            {item.businessName}
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            Applied {formatDate(item.createdAt)}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900">
                            {item.email ?? "No email"}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            {item.phone ?? "No phone"}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                            item.kycVerified
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {item.kycVerified ? "Verified" : "Unverified"}
                        </span>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              merchantDecision(item.merchantId, "approve")
                            }
                            disabled={isActing}
                            className="min-h-9 cursor-pointer rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                          >
                            {isActing ? "…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              merchantDecision(item.merchantId, "reject")
                            }
                            disabled={isActing}
                            className="min-h-9 cursor-pointer rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                          >
                            {isActing ? "…" : "Reject"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Mobile stacked rows */}
                <div className="space-y-3 md:hidden">
                  {pendingMerchants.map((item) => {
                    const isActing = actingOnMerchantId === item.merchantId;
                    return (
                      <div
                        key={item.merchantId}
                        className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zinc-900">
                              {item.businessName}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-zinc-500">
                              {item.email ?? "No email"}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                              item.kycVerified
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {item.kycVerified ? "Verified" : "Unverified"}
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-zinc-500">
                          {item.phone ?? "No phone"}
                          {" · "}
                          Applied {formatDate(item.createdAt)}
                        </p>

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              merchantDecision(item.merchantId, "approve")
                            }
                            disabled={isActing}
                            className="min-h-10 flex-1 cursor-pointer rounded-full bg-brand px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                          >
                            {isActing ? "…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              merchantDecision(item.merchantId, "reject")
                            }
                            disabled={isActing}
                            className="min-h-10 flex-1 cursor-pointer rounded-full border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                          >
                            {isActing ? "…" : "Reject"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
        </section>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">
              Fraud queue
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Open flags awaiting review. Clear false positives; confirm real risk.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="border-l-2 border-brand bg-white px-4 py-2.5 ring-1 ring-zinc-100">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Open
              </p>
              <p className="font-mono text-2xl font-bold tracking-tight text-zinc-900">
                {loading ? "…" : openCount}
              </p>
            </div>
            <button
              type="button"
              onClick={() => secret && loadQueue(secret)}
              disabled={loading}
              className="min-h-11 cursor-pointer rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>

        <section className="mt-6 border-l-2 border-brand bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-6">
          {loading && (
            <p className="text-sm font-medium text-zinc-500">Loading queue…</p>
          )}

          {loadError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </p>
          )}

          {!loading && queue && queue.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold text-zinc-900">All clear</p>
              <p className="mt-1 text-sm text-zinc-500">
                No open fraud flags in the queue.
              </p>
            </div>
          )}

          {!loading && queue && queue.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-xl border border-zinc-200 md:block">
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_minmax(11rem,auto)] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  <span>Flag</span>
                  <span>Merchant</span>
                  <span>Amount</span>
                  <span>Severity</span>
                  <span className="text-right">Actions</span>
                </div>
                {queue.map((item, index) => {
                  const isConfirmed = confirmedIds.has(item.flagId);
                  const isActing = actingOnId === item.flagId;
                  return (
                    <div
                      key={item.flagId}
                      className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_minmax(11rem,auto)] items-center gap-3 px-4 py-3.5 ${
                        index !== queue.length - 1 ? "border-b border-zinc-100" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900">
                          {RULE_LABELS[item.ruleType]}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {item.payerName ? item.payerName : "Unknown payer"}
                          {" · "}
                          {formatDate(item.createdAt)}
                        </p>
                        {isConfirmed && (
                          <p className="mt-1 text-[11px] font-semibold text-amber-700">
                            Confirmed — still open
                          </p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900">
                          {item.businessName}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
                          {item.merchantId}
                        </p>
                      </div>
                      <p className="shrink-0 font-mono text-sm font-semibold text-zinc-900">
                        {formatNaira(item.amount)}
                      </p>
                      <SeverityBadge severity={item.severity} />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => override(item.flagId, "clear")}
                          disabled={isActing}
                          className="min-h-9 cursor-pointer rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                        >
                          {isActing ? "…" : "Clear"}
                        </button>
                        <button
                          type="button"
                          onClick={() => override(item.flagId, "confirm")}
                          disabled={isActing || isConfirmed}
                          className="min-h-9 cursor-pointer rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                        >
                          {isActing ? "…" : isConfirmed ? "Confirmed" : "Confirm"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Mobile stacked rows */}
              <div className="space-y-3 md:hidden">
                {queue.map((item) => {
                  const isConfirmed = confirmedIds.has(item.flagId);
                  const isActing = actingOnId === item.flagId;
                  return (
                    <div
                      key={item.flagId}
                      className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4"
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

                      <p className="mt-2 font-mono text-sm font-semibold text-zinc-900">
                        {formatNaira(item.amount)}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {item.payerName ? item.payerName : "Unknown payer"}
                        {" · "}
                        {formatDate(item.createdAt)}
                      </p>

                      {isConfirmed && (
                        <p className="mt-2 text-[11px] font-semibold text-amber-700">
                          Confirmed — still open
                        </p>
                      )}

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => override(item.flagId, "clear")}
                          disabled={isActing}
                          className="min-h-10 flex-1 cursor-pointer rounded-full bg-brand px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                        >
                          {isActing ? "…" : "Clear"}
                        </button>
                        <button
                          type="button"
                          onClick={() => override(item.flagId, "confirm")}
                          disabled={isActing || isConfirmed}
                          className="min-h-10 flex-1 cursor-pointer rounded-full border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                        >
                          {isActing ? "…" : isConfirmed ? "Confirmed" : "Confirm"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
