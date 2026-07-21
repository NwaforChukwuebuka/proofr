"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
const AUTO_REFRESH_MS = 30_000;

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

type MerchantFilter = "all" | "today" | "unverified" | "verified";

type ActivityItem = {
  id: string;
  text: string;
  tone: "ok" | "warn" | "bad";
  at: number;
};

function businessAgeLabel(startedAt: string | null): string {
  if (!startedAt) return "Age unknown";
  const start = new Date(startedAt);
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  if (months < 1) return "New business";
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"}`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function approvalRisk(m: PendingMerchant): {
  level: "low" | "medium" | "high";
  label: string;
  className: string;
} {
  if (!m.kycVerified) {
    return {
      level: "high",
      label: "High — KYC incomplete",
      className: "bg-red-50 text-red-700",
    };
  }
  if (!m.businessStartedAt) {
    return {
      level: "medium",
      label: "Medium — age unknown",
      className: "bg-amber-50 text-amber-700",
    };
  }
  return {
    level: "low",
    label: "Low risk",
    className: "bg-emerald-50 text-emerald-700",
  };
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
  const [pendingMerchants, setPendingMerchants] = useState<PendingMerchant[] | null>(
    null
  );
  const [actingOnMerchantId, setActingOnMerchantId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MerchantFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [sessionApproved, setSessionApproved] = useState(0);
  const [sessionRejected, setSessionRejected] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [bulkActing, setBulkActing] = useState(false);

  const pushActivity = useCallback((text: string, tone: ActivityItem["tone"]) => {
    setActivity((prev) =>
      [{ id: `${Date.now()}-${Math.random()}`, text, tone, at: Date.now() }, ...prev].slice(
        0,
        12
      )
    );
  }, []);

  const loadPendingMerchants = useCallback(async (adminSecret: string, quiet = false) => {
    if (!quiet) setPendingLoading(true);
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
      setLastSyncedAt(Date.now());
    } finally {
      if (!quiet) setPendingLoading(false);
    }
  }, []);

  const loadQueue = useCallback(async (adminSecret: string, quiet = false) => {
    if (!quiet) setLoading(true);
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
      setLastSyncedAt(Date.now());
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const refreshAll = useCallback(
    async (adminSecret: string, quiet = false) => {
      await Promise.all([
        loadQueue(adminSecret, quiet),
        loadPendingMerchants(adminSecret, quiet),
      ]);
    },
    [loadQueue, loadPendingMerchants]
  );

  useEffect(() => {
    async function boot() {
      const stored = sessionStorage.getItem(SECRET_STORAGE_KEY);
      if (stored) {
        setSecret(stored);
        await refreshAll(stored);
      }
    }
    boot();
  }, [refreshAll]);

  const [tick, setTick] = useState(0);

  // Auto-refresh while signed in
  useEffect(() => {
    if (!secret) return;
    const id = setInterval(() => {
      refreshAll(secret, true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [secret, refreshAll]);

  // Keep "synced Xs ago" fresh
  useEffect(() => {
    if (!secret) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [secret]);

  // silence unused if tree-shaken — tick forces re-render for sync label
  void tick;

  function submitSecret() {
    if (!secretInput.trim()) return;
    const value = secretInput.trim();
    sessionStorage.setItem(SECRET_STORAGE_KEY, value);
    setAuthError(null);
    setSecret(value);
    refreshAll(value);
  }

  async function merchantDecision(
    merchantId: string,
    action: "approve" | "reject",
    businessName?: string
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
        return false;
      }
      if (!res.ok) {
        setPendingError(`Couldn't ${action} that merchant.`);
        return false;
      }
      const name =
        businessName ??
        pendingMerchants?.find((m) => m.merchantId === merchantId)?.businessName ??
        "Merchant";
      setPendingMerchants((prev) =>
        (prev ?? []).filter((m) => m.merchantId !== merchantId)
      );
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(merchantId);
        return next;
      });
      setRejectConfirmId(null);
      setExpandedId((id) => (id === merchantId ? null : id));
      if (action === "approve") {
        setSessionApproved((n) => n + 1);
        pushActivity(`Approved ${name}`, "ok");
      } else {
        setSessionRejected((n) => n + 1);
        pushActivity(`Rejected ${name}`, "bad");
      }
      return true;
    } finally {
      setActingOnMerchantId(null);
    }
  }

  async function bulkApprove() {
    if (!secret || selected.size === 0) return;
    setBulkActing(true);
    try {
      const ids = [...selected];
      for (const id of ids) {
        await merchantDecision(id, "approve");
      }
    } finally {
      setBulkActing(false);
    }
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
      const item = queue?.find((f) => f.flagId === flagId);
      if (action === "clear") {
        setQueue((prev) => (prev ?? []).filter((f) => f.flagId !== flagId));
        pushActivity(
          `Cleared flag on ${item?.businessName ?? "merchant"}`,
          "ok"
        );
      } else {
        setConfirmedIds((prev) => new Set(prev).add(flagId));
        pushActivity(
          `Confirmed risk on ${item?.businessName ?? "merchant"}`,
          "warn"
        );
      }
    } finally {
      setActingOnId(null);
    }
  }

  const filteredPending = useMemo(() => {
    const list = pendingMerchants ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((m) => {
      if (filter === "today" && !isToday(m.createdAt)) return false;
      if (filter === "unverified" && m.kycVerified) return false;
      if (filter === "verified" && !m.kycVerified) return false;
      if (!q) return true;
      return (
        m.businessName.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.phone ?? "").toLowerCase().includes(q) ||
        m.merchantId.toLowerCase().includes(q)
      );
    });
  }, [pendingMerchants, search, filter]);

  const pendingCount = pendingMerchants?.length ?? 0;
  const openCount = queue?.length ?? 0;
  const appliedToday = (pendingMerchants ?? []).filter((m) => isToday(m.createdAt)).length;
  const unverifiedCount = (pendingMerchants ?? []).filter((m) => !m.kycVerified).length;
  const attentionCount = pendingCount + openCount;

  if (!secret) {
    return (
      <main className="flex flex-1 items-center justify-center bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-extrabold text-white">
              P
            </span>
            <span className="font-display tracking-tight text-zinc-900">PROOFR</span>
          </Link>

          <section className="mt-4 border-l-2 border-brand bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Operations
            </p>
            <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight text-zinc-900">
              Ops console
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Enter the admin secret to review approvals and fraud flags.
            </p>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-zinc-700">Admin secret</span>
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
                className="min-h-11 w-full cursor-pointer rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
              >
                Open console
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-3 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-extrabold text-white">
              P
            </span>
            <span className="font-display tracking-tight text-zinc-900">PROOFR</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(SECRET_STORAGE_KEY);
              setSecret(null);
              setQueue(null);
              setPendingMerchants(null);
            }}
            className="min-h-11 cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Sign out
          </button>
        </header>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3 sm:mt-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Operations
            </p>
            <h1 className="font-display mt-0.5 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">
              What needs attention
            </h1>
          </div>
          <p className="text-xs text-zinc-400">
            {lastSyncedAt
              ? `Live · synced ${Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000))}s ago`
              : "Connecting…"}
          </p>
        </div>

        {/* Attention banner */}
        {attentionCount > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
            <span className="font-bold">{attentionCount} item{attentionCount === 1 ? "" : "s"}</span>
            {" need review — "}
            {pendingCount > 0 && (
              <a href="#approvals" className="font-semibold underline underline-offset-2">
                {pendingCount} approval{pendingCount === 1 ? "" : "s"}
              </a>
            )}
            {pendingCount > 0 && openCount > 0 && " · "}
            {openCount > 0 && (
              <a href="#fraud" className="font-semibold underline underline-offset-2">
                {openCount} fraud flag{openCount === 1 ? "" : "s"}
              </a>
            )}
          </div>
        )}

        {/* KPI strip */}
        <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {[
            {
              label: "Pending",
              value: pendingLoading ? "…" : pendingCount,
              href: "#approvals",
              hot: pendingCount > 0,
            },
            {
              label: "Fraud alerts",
              value: loading ? "…" : openCount,
              href: "#fraud",
              hot: openCount > 0,
            },
            {
              label: "Applied today",
              value: pendingLoading ? "…" : appliedToday,
              href: "#approvals",
              hot: false,
            },
            {
              label: "This session",
              value: `${sessionApproved}↑ ${sessionRejected}↓`,
              href: "#activity",
              hot: false,
            },
          ].map((kpi) => (
            <a
              key={kpi.label}
              href={kpi.href}
              className={`border-l-2 bg-white p-3 shadow-[0_4px_16px_rgba(15,23,42,0.06)] ring-1 ring-zinc-100 transition hover:ring-brand/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-4 ${
                kpi.hot ? "border-amber-500" : "border-zinc-200"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                {kpi.label}
              </p>
              <p className="mt-1 font-mono text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
                {kpi.value}
              </p>
            </a>
          ))}
        </section>

        {/* Search + filters */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merchant, email, phone…"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          />
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "all", label: "All" },
                { id: "today", label: "Today" },
                { id: "unverified", label: "Unverified" },
                { id: "verified", label: "Verified" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  filter === f.id
                    ? "bg-brand text-white"
                    : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-900"
                }`}
              >
                {f.label}
                {f.id === "unverified" && unverifiedCount > 0 ? ` (${unverifiedCount})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/25 bg-brand-tint px-3 py-2.5">
            <p className="text-sm font-semibold text-brand-dark">
              {selected.size} selected
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="min-h-9 rounded-full px-3 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={bulkApprove}
                disabled={bulkActing}
                className="min-h-9 rounded-full bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {bulkActing ? "Approving…" : "Approve selected"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_0.9fr] lg:items-start">
          {/* Approvals queue */}
          <section id="approvals">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-zinc-900">
                Needs review
              </h2>
              <p className="font-mono text-xs text-zinc-500">
                {filteredPending.length} shown
              </p>
            </div>

            {pendingError && (
              <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {pendingError}
              </p>
            )}

            {pendingLoading && !pendingMerchants && (
              <p className="text-sm text-zinc-500">Loading queue…</p>
            )}

            {!pendingLoading && pendingMerchants && pendingMerchants.length === 0 && (
              <div className="border-l-2 border-emerald-400 bg-white p-6 text-center ring-1 ring-zinc-100">
                <p className="text-sm font-semibold text-zinc-900">
                  Approval queue clear
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  No merchants waiting. Auto-refreshes every 30s.
                </p>
              </div>
            )}

            {filteredPending.length === 0 &&
              pendingMerchants &&
              pendingMerchants.length > 0 && (
                <p className="text-sm text-zinc-500">No merchants match this filter.</p>
              )}

            <div className="space-y-3">
              {filteredPending.map((item) => {
                const risk = approvalRisk(item);
                const isActing = actingOnMerchantId === item.merchantId;
                const expanded = expandedId === item.merchantId;
                const isSelected = selected.has(item.merchantId);
                const confirmingReject = rejectConfirmId === item.merchantId;

                return (
                  <article
                    key={item.merchantId}
                    className={`border-l-2 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.06)] ring-1 ring-zinc-100 sm:p-5 ${
                      risk.level === "high"
                        ? "border-red-400"
                        : risk.level === "medium"
                          ? "border-amber-400"
                          : "border-zinc-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.merchantId)) next.delete(item.merchantId);
                            else next.add(item.merchantId);
                            return next;
                          });
                        }}
                        className="mt-1 h-4 w-4 accent-[var(--brand)]"
                        aria-label={`Select ${item.businessName}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-bold text-zinc-900">
                              {item.businessName}
                            </h3>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              Applied {formatDate(item.createdAt)}
                              {isToday(item.createdAt) ? " · Today" : ""}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${risk.className}`}
                          >
                            {risk.label}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span
                            className={`rounded-full px-2.5 py-1 font-semibold ${
                              item.kycVerified
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {item.kycVerified ? "KYC verified" : "KYC unverified"}
                          </span>
                          <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-600">
                            {businessAgeLabel(item.businessStartedAt)}
                          </span>
                        </div>

                        {expanded && (
                          <dl className="mt-4 space-y-2 border-t border-zinc-100 pt-3 text-sm">
                            <div className="flex justify-between gap-3">
                              <dt className="text-zinc-500">Email</dt>
                              <dd className="truncate font-medium text-zinc-900">
                                {item.email ?? "—"}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-zinc-500">Phone</dt>
                              <dd className="font-medium text-zinc-900">{item.phone ?? "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-zinc-500">KYC ref</dt>
                              <dd className="truncate font-mono text-xs text-zinc-700">
                                {item.kycReference ?? "—"}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-zinc-500">Business started</dt>
                              <dd className="text-zinc-900">
                                {item.businessStartedAt
                                  ? formatDate(item.businessStartedAt)
                                  : "—"}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-zinc-500">Merchant ID</dt>
                              <dd className="truncate font-mono text-[11px] text-zinc-500">
                                {item.merchantId}
                              </dd>
                            </div>
                          </dl>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              merchantDecision(item.merchantId, "approve", item.businessName)
                            }
                            disabled={isActing || confirmingReject}
                            className="min-h-10 flex-1 cursor-pointer rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 sm:flex-none sm:min-w-[7rem]"
                          >
                            {isActing ? "…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(expanded ? null : item.merchantId)
                            }
                            className="min-h-10 cursor-pointer rounded-full border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                          >
                            {expanded ? "Hide" : "Review"}
                          </button>
                          {!confirmingReject ? (
                            <button
                              type="button"
                              onClick={() => setRejectConfirmId(item.merchantId)}
                              disabled={isActing}
                              className="min-h-10 cursor-pointer rounded-full px-3 py-2 text-xs font-semibold text-zinc-500 transition hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                            >
                              More
                            </button>
                          ) : (
                            <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 sm:w-auto">
                              <p className="text-xs font-medium text-red-800">Reject this merchant?</p>
                              <button
                                type="button"
                                onClick={() =>
                                  merchantDecision(
                                    item.merchantId,
                                    "reject",
                                    item.businessName
                                  )
                                }
                                disabled={isActing}
                                className="min-h-9 rounded-full bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                Confirm reject
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectConfirmId(null)}
                                className="min-h-9 rounded-full px-2 text-xs font-semibold text-zinc-600"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Side: activity + fraud */}
          <aside className="space-y-4">
            <section id="activity" className="border-l-2 border-zinc-200 bg-white p-4 ring-1 ring-zinc-100 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Activity
              </p>
              {activity.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">
                  Actions you take this session show up here.
                </p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-sm text-zinc-700">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          a.tone === "ok"
                            ? "bg-emerald-500"
                            : a.tone === "warn"
                              ? "bg-amber-500"
                              : "bg-red-500"
                        }`}
                      />
                      <span>{a.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section id="fraud" className="border-l-2 border-zinc-200 bg-white p-4 ring-1 ring-zinc-100 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Fraud queue
                </p>
                <p className="font-mono text-xs text-zinc-500">{openCount} open</p>
              </div>

              {loadError && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {loadError}
                </p>
              )}

              {loading && !queue && (
                <p className="mt-3 text-sm text-zinc-500">Loading flags…</p>
              )}

              {!loading && queue && queue.length === 0 && (
                <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-4 text-center">
                  <p className="text-sm font-semibold text-emerald-900">
                    All fraud reviews completed
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">
                    Queue is clear. Last sync{" "}
                    {lastSyncedAt
                      ? `${Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000))}s ago`
                      : "pending"}
                    .
                  </p>
                </div>
              )}

              {queue && queue.length > 0 && (
                <ul className="mt-3 space-y-3">
                  {queue.map((item) => {
                    const isConfirmed = confirmedIds.has(item.flagId);
                    const isActing = actingOnId === item.flagId;
                    return (
                      <li
                        key={item.flagId}
                        className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
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
                        <p className="mt-2 font-mono text-sm font-bold text-zinc-900">
                          {formatNaira(item.amount)}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {item.payerName ?? "Unknown payer"} · {formatDate(item.createdAt)}
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
                            className="min-h-9 flex-1 rounded-full bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                          >
                            {isActing ? "…" : "Clear"}
                          </button>
                          <button
                            type="button"
                            onClick={() => override(item.flagId, "confirm")}
                            disabled={isActing || isConfirmed}
                            className="min-h-9 flex-1 rounded-full border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                          >
                            {isConfirmed ? "Confirmed" : "Confirm"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
