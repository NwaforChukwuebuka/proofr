"use client";

export type RuleType =
  | "circular_transfer"
  | "self_funding"
  | "identical_transfers"
  | "velocity_spike";

export type Severity = "high" | "medium";
export type FlagStatus = "open" | "overridden";

export interface FraudFlag {
  id: string;
  rule_type: RuleType;
  severity: Severity;
  status: FlagStatus;
  created_at: string;
  transactions: {
    id: string;
    amount: number;
    payer_name: string | null;
    payer_account: string | null;
    created_at: string;
  };
}

const RULE_LABELS: Record<RuleType, string> = {
  circular_transfer: "Circular transfer pattern",
  self_funding: "Possible self-funding",
  identical_transfers: "Repeated identical transfers",
  velocity_spike: "Unusual transaction volume spike",
};

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
  });
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const isHigh = severity === "high";
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
        isHigh ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {isHigh ? "High" : "Medium"}
    </span>
  );
}

function FlagRow({ flag }: { flag: FraudFlag }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-red-50/60 p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900">
          {RULE_LABELS[flag.rule_type]}
        </p>
        <p className="mt-0.5 truncate text-xs text-zinc-500">
          {formatNaira(flag.transactions.amount)}
          {flag.transactions.payer_name ? ` · ${flag.transactions.payer_name}` : ""}
          {" · "}
          {formatDate(flag.transactions.created_at)}
        </p>
      </div>
      <SeverityBadge severity={flag.severity} />
    </div>
  );
}

export function FraudFlagsCard({ flags }: { flags: FraudFlag[] }) {
  const openFlags = flags.filter((f) => f.status === "open");
  const clearedFlags = flags.filter((f) => f.status === "overridden");

  if (openFlags.length === 0 && clearedFlags.length === 0) return null;

  return (
    <div className="rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-400">Fraud flags</p>
        {openFlags.length > 0 && (
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-700">
            {openFlags.length} open
          </span>
        )}
      </div>

      {openFlags.length > 0 ? (
        <div className="mt-3 space-y-2">
          {openFlags.map((flag) => (
            <FlagRow key={flag.id} flag={flag} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-400">No open flags — all clear.</p>
      )}

      {clearedFlags.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4 opacity-60">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Cleared
          </p>
          {clearedFlags.map((flag) => (
            <div
              key={flag.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 p-3"
            >
              <p className="min-w-0 truncate text-sm text-zinc-500">
                {RULE_LABELS[flag.rule_type]} ·{" "}
                {formatNaira(flag.transactions.amount)}
              </p>
              <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold text-zinc-500">
                Cleared
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
