"use client";

import { useState } from "react";
import { Naira, formatNaira } from "@/lib/fraud-labels";

interface TrendPoint {
  period: string;
  amount: number;
}

function formatPeriodLabel(period: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return period.slice(5);
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    const month = Number(period.slice(5, 7));
    const labels = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return labels[month - 1] ?? period.slice(5);
  }
  return period;
}

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (trend.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No transactions yet — the trend will appear once a payment lands.
      </p>
    );
  }

  const max = Math.max(...trend.map((p) => p.amount), 1);

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
      >
        <div className="absolute inset-x-0 top-[25%] border-t border-dashed border-zinc-200" />
        <div className="absolute inset-x-0 top-[50%] border-t border-dashed border-zinc-200" />
        <div className="absolute inset-x-0 top-[75%] border-t border-dashed border-zinc-200" />
        <div className="absolute inset-x-0 bottom-0 border-t border-zinc-200" />
      </div>

      <div
        role="img"
        aria-label="Revenue trend chart"
        className="relative flex h-40 items-end gap-3 overflow-x-auto overflow-y-hidden px-1 pb-0 sm:gap-4 sm:px-1.5"
      >
        {trend.map((point, i) => {
          const heightPct = Math.max((point.amount / max) * 100, 6);
          const isHovered = hovered === i;
          const showLabel =
            isHovered || i === 0 || i === trend.length - 1 || trend.length <= 8;

          return (
            <div
              key={point.period}
              className="group relative flex h-full w-2.5 shrink-0 flex-col items-center justify-end sm:w-3"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            >
              {isHovered && (
                <div className="absolute bottom-[calc(100%+8px)] z-10 whitespace-nowrap rounded-md bg-zinc-900 px-2.5 py-1.5 text-left shadow-lg">
                  <p className="font-mono text-[11px] font-semibold text-white">
                    <Naira amount={point.amount} />
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    {formatPeriodLabel(point.period)}
                  </p>
                </div>
              )}

              <button
                type="button"
                aria-label={`${formatPeriodLabel(point.period)}: ${formatNaira(point.amount)}`}
                className={`w-full origin-bottom rounded-full transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  isHovered
                    ? "bg-brand-dark scale-y-[1.02]"
                    : "bg-brand/85 hover:bg-brand"
                }`}
                style={{ height: `${heightPct}%` }}
              />

              <span
                className={`mt-2 h-4 text-[10px] font-medium ${
                  showLabel
                    ? isHovered
                      ? "text-zinc-700"
                      : "text-zinc-400"
                    : "text-transparent"
                }`}
              >
                {formatPeriodLabel(point.period)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
