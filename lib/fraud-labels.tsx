/**
 * Plain-language fraud flag labels/formatting, extracted from milestone 9's
 * app/dashboard/fraud-flags.tsx so milestone 11's report view can reuse the
 * same labels instead of reimplementing them (per handoff.md's note that
 * GET /api/merchants/:id/report deliberately returns raw flag rows and
 * leaves display-formatting to the frontend).
 */

export type RuleType =
  | "circular_transfer"
  | "self_funding"
  | "identical_transfers"
  | "velocity_spike";

export type Severity = "high" | "medium";
export type FlagStatus = "open" | "overridden";

export const RULE_LABELS: Record<RuleType, string> = {
  circular_transfer: "Circular transfer pattern",
  self_funding: "Possible self-funding",
  identical_transfers: "Repeated identical transfers",
  velocity_spike: "Unusual transaction volume spike",
};

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

/**
 * The ₦ glyph is missing from Geist Sans/Mono, so the browser falls back to
 * a different font for just that character. That fallback's advance width
 * doesn't match, and the symbol overlaps or strikes through the digits that
 * follow. Rendering the symbol in a plain system-font span sidesteps it.
 */
export function Naira({ amount, className = "" }: { amount: number; className?: string }) {
  return (
    <span className={`whitespace-nowrap ${className}`}>
      <span style={{ fontFamily: "Segoe UI, Arial, sans-serif" }}>₦</span>
      {amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}
    </span>
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
  });
}

export function SeverityBadge({ severity }: { severity: Severity }) {
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
