"use client";

import { useState } from "react";

interface TrendPoint {
  period: string;
  amount: number;
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (trend.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-400">
        No transactions yet — the trend will appear once a payment lands.
      </p>
    );
  }

  const max = Math.max(...trend.map((p) => p.amount), 1);
  const barWidth = 100 / trend.length;

  return (
    <div>
      <div className="relative flex h-36 items-end gap-1">
        {trend.map((point, i) => {
          const heightPct = Math.max((point.amount / max) * 100, 4);
          const isHovered = hovered === i;
          return (
            <div
              key={point.period}
              className="group relative flex h-full flex-1 items-end justify-center"
              style={{ maxWidth: `${barWidth}%` }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            >
              {isHovered && (
                <div className="absolute bottom-full mb-1.5 whitespace-nowrap rounded-lg bg-zinc-900 px-2 py-1 text-xs font-semibold text-white shadow-lg">
                  {formatNaira(point.amount)}
                  <div className="text-[10px] font-normal text-zinc-300">
                    {point.period}
                  </div>
                </div>
              )}
              <div
                className={`w-full rounded-t-md transition-colors ${
                  isHovered ? "bg-brand-dark" : "bg-brand"
                }`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1">
        {trend.map((point, i) => (
          <div
            key={point.period}
            className="flex-1 truncate text-center text-[10px] text-zinc-400"
            style={{ maxWidth: `${barWidth}%` }}
          >
            {i === 0 || i === trend.length - 1 || i === hovered
              ? point.period.slice(5)
              : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
