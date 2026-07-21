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

interface ApiKey {
  id: string;
  name: string;
  keyPreview: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export default function LenderSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [lender, setLender] = useState<Lender | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatingKey, setGeneratingKey] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);

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

      const keysRes = await fetch("/api/lenders/api-keys", {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      });
      if (!cancelled && keysRes.ok) {
        setApiKeys((await keysRes.json()) as ApiKey[]);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const generateApiKey = useCallback(async () => {
    if (!session) return;
    setGeneratingKey(true);
    setApiKeyError(null);
    try {
      const res = await fetch("/api/lenders/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(newKeyName.trim() ? { name: newKeyName.trim() } : {}),
      });
      if (!res.ok) {
        setApiKeyError("Couldn't generate an API key.");
        return;
      }
      const created = (await res.json()) as ApiKey & { apiKey: string };
      setJustCreatedKey(created.apiKey);
      setNewKeyName("");
      setApiKeys((prev) => [
        {
          id: created.id,
          name: created.name,
          keyPreview: created.keyPreview,
          createdAt: created.createdAt,
          revokedAt: null,
        },
        ...prev,
      ]);
    } finally {
      setGeneratingKey(false);
    }
  }, [session, newKeyName]);

  const revokeApiKey = useCallback(
    async (keyId: string) => {
      if (!session) return;
      setRevokingKeyId(keyId);
      setApiKeyError(null);
      try {
        const res = await fetch(`/api/lenders/api-keys/${keyId}/revoke`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          setApiKeyError("Couldn't revoke that key.");
          return;
        }
        const { revokedAt } = (await res.json()) as { revokedAt: string };
        setApiKeys((prev) =>
          prev.map((k) => (k.id === keyId ? { ...k, revokedAt } : k))
        );
      } finally {
        setRevokingKeyId(null);
      }
    },
    [session]
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-6">
        <p className="text-sm font-medium text-zinc-500">Loading settings…</p>
      </div>
    );
  }

  return (
    <main className="flex min-w-0 flex-1 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_55%)] px-3 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto w-full min-w-0 max-w-2xl">
        <header className="flex items-center justify-between gap-3">
          <Link
            href="/lender"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            ← Portfolio
          </Link>
        </header>

        <h1 className="font-display mt-5 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">
          Developer settings
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{lender?.org_name}</p>

        <section className="mt-6 border-l-2 border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-zinc-100 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Public API keys
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            For third-party platforms calling{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">GET /api/public/score</code>{" "}
            with an{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">x-api-key</code> header.
          </p>

          {justCreatedKey && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-sm font-semibold text-amber-800">
                Copy this key now — it won&apos;t be shown again.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-white px-2 py-1 text-xs text-zinc-900 ring-1 ring-amber-200">
                  {justCreatedKey}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(justCreatedKey)}
                  className="cursor-pointer rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-amber-700"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => setJustCreatedKey(null)}
                  className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold text-zinc-600 transition hover:text-zinc-900"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={newKeyName}
              placeholder="Label (e.g. Investor demo key)"
              onChange={(e) => setNewKeyName(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
            <button
              type="button"
              onClick={generateApiKey}
              disabled={generatingKey}
              className="min-h-11 shrink-0 cursor-pointer rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
            >
              {generatingKey ? "Generating…" : "Generate new key"}
            </button>
          </div>

          {apiKeyError && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {apiKeyError}
            </p>
          )}

          {apiKeys.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                <span>Name</span>
                <span>Key</span>
                <span>Status</span>
              </div>
              {apiKeys.map((key, index) => (
                <div
                  key={key.id}
                  className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 ${
                    index !== apiKeys.length - 1 ? "border-b border-zinc-100" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900">{key.name}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      Created {new Date(key.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="truncate font-mono text-[11px] text-zinc-500">
                    {key.keyPreview ?? "—"}
                  </span>
                  {key.revokedAt ? (
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-500">
                      Revoked
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => revokeApiKey(key.id)}
                      disabled={revokingKeyId === key.id}
                      className="shrink-0 cursor-pointer rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      {revokingKeyId === key.id ? "Revoking…" : "Revoke"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
