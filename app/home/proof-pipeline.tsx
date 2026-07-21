"use client";

import { useEffect, useState } from "react";

type Stage = "inflow" | "screen" | "verified" | "score" | "loan" | "ready";

const STAGES: Stage[] = ["inflow", "screen", "verified", "score", "loan", "ready"];

const PAYMENTS = [
  { payer: "Ngozi A.", amount: 120_000 },
  { payer: "Mich Boutique", amount: 45_000 },
  { payer: "Yolanda Stores", amount: 80_000 },
];

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export function ProofPipeline() {
  const [stage, setStage] = useState<Stage>("inflow");
  const [paymentIdx, setPaymentIdx] = useState(0);
  const [score, setScore] = useState(82);
  const [reduceMotion, setReduceMotion] = useState(false);

  const payment = PAYMENTS[paymentIdx % PAYMENTS.length];
  const active = stageIndex(stage);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setStage("ready");
      setScore(96);
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const later = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms));
    };

    const runCycle = () => {
      if (cancelled) return;

      setStage("inflow");
      setScore(82);

      later(() => {
        if (cancelled) return;
        setStage("screen");

        later(() => {
          if (cancelled) return;
          setStage("verified");

          later(() => {
            if (cancelled) return;
            setStage("score");
            let s = 82;
            setScore(s);

            const tickScore = () => {
              if (cancelled) return;
              s += 1;
              setScore(s);
              if (s < 96) {
                later(tickScore, 65);
              } else {
                later(() => {
                  if (cancelled) return;
                  setStage("loan");
                  later(() => {
                    if (cancelled) return;
                    setStage("ready");
                    later(() => {
                      if (cancelled) return;
                      setPaymentIdx((i) => i + 1);
                      runCycle();
                    }, 2000);
                  }, 1400);
                }, 400);
              }
            };
            later(tickScore, 180);
          }, 1100);
        }, 1300);
      }, 1500);
    };

    runCycle();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reduceMotion]);

  return (
    <div
      aria-label="Product demonstration: payment becoming verified revenue and loan eligibility"
      className="proof-pipeline relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/90 shadow-[0_24px_80px_rgba(0,82,255,0.12)] backdrop-blur-sm"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(0,82,255,0.06)_0%,transparent_42%),repeating-linear-gradient(0deg,transparent,transparent_23px,rgba(15,23,42,0.03)_24px)]"
      />

      <div className="relative border-b border-zinc-100 px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {!reduceMotion && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              )}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">
              Live clearing
            </p>
          </div>
          <p className="font-mono text-[10px] text-zinc-400">PROOFR · demo</p>
        </div>
      </div>

      <div className="relative px-4 py-4 sm:px-5 sm:py-5">
        <PipelineStep
          active={active >= 0}
          current={stage === "inflow"}
          label="Incoming transfer"
          done={active > 0}
        >
          <div
            key={`${payment.payer}-${paymentIdx}`}
            className={`flex items-center justify-between gap-3 ${
              stage === "inflow" && !reduceMotion ? "pipeline-pulse" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-900">{payment.payer}</p>
              <p className="text-xs text-zinc-500">Bank transfer · just now</p>
            </div>
            <p className="shrink-0 font-mono text-lg font-bold text-emerald-600">
              +{formatNaira(payment.amount)}
            </p>
          </div>
        </PipelineStep>

        <PipelineConnector active={active >= 1} />

        <PipelineStep
          active={active >= 1}
          current={stage === "screen"}
          label="Fraud screening"
          done={active > 1}
        >
          <p className="text-sm text-zinc-700">
            {stage === "screen" ? (
              <span className="pipeline-scan font-medium text-brand">Checking patterns…</span>
            ) : active > 1 ? (
              <span className="font-medium text-emerald-700">Clean · no circular transfers</span>
            ) : (
              <span className="text-zinc-400">Standing by</span>
            )}
          </p>
        </PipelineStep>

        <PipelineConnector active={active >= 2} />

        <PipelineStep
          active={active >= 2}
          current={stage === "verified"}
          label="Revenue classification"
          done={active > 2}
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-zinc-600">Verified revenue</p>
            <p
              className={`font-mono text-base font-bold ${
                active >= 2 ? "text-zinc-950" : "text-zinc-300"
              }`}
            >
              {active >= 2 ? formatNaira(10_050_000 + payment.amount) : "—"}
            </p>
          </div>
        </PipelineStep>

        <PipelineConnector active={active >= 3} />

        <PipelineStep
          active={active >= 3}
          current={stage === "score"}
          label="Confidence score"
          done={active > 3}
        >
          <div className="flex items-end justify-between gap-3">
            <p className="text-sm text-zinc-600">Lender trust signal</p>
            <p
              className={`font-mono text-4xl font-bold leading-none tracking-tight ${
                active >= 3 ? "text-brand" : "text-zinc-300"
              }`}
            >
              {active >= 3 ? score : "—"}
            </p>
          </div>
        </PipelineStep>

        <PipelineConnector active={active >= 4} />

        <PipelineStep
          active={active >= 4}
          current={stage === "loan" || stage === "ready"}
          label="Eligible financing"
          done={stage === "ready"}
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                {stage === "ready" ? "Ready to share" : "Recommended offer"}
              </p>
              <p className="text-xs text-zinc-500">Based on verified revenue</p>
            </div>
            <p
              className={`font-mono text-2xl font-bold tracking-tight ${
                active >= 4 ? "text-zinc-950" : "text-zinc-300"
              }`}
            >
              {active >= 4 ? "₦2,300,000" : "—"}
            </p>
          </div>
          {stage === "ready" && (
            <p className="pipeline-ready mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              Proof-of-Revenue profile updated
            </p>
          )}
        </PipelineStep>
      </div>
    </div>
  );
}

function PipelineStep({
  label,
  children,
  active,
  current,
  done,
}: {
  label: string;
  children: React.ReactNode;
  active: boolean;
  current: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`relative rounded-xl px-3 py-3 transition duration-300 sm:px-3.5 ${
        current
          ? "bg-brand-tint/70 ring-1 ring-brand/25"
          : active
            ? "bg-zinc-50/80"
            : "bg-transparent opacity-45"
      }`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
            done
              ? "bg-emerald-500 text-white"
              : current
                ? "bg-brand text-white"
                : "bg-zinc-200 text-zinc-500"
          }`}
        >
          {done ? "✓" : current ? "•" : ""}
        </span>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
          {label}
        </p>
      </div>
      {children}
    </div>
  );
}

function PipelineConnector({ active }: { active: boolean }) {
  return (
    <div className="flex justify-center py-1" aria-hidden>
      <div className={`h-5 w-px transition ${active ? "bg-brand/50" : "bg-zinc-200"}`} />
    </div>
  );
}
