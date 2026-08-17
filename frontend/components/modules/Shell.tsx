"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { loadProps } from "../motion";

/* Shared chrome for every feature module page. */

export function ModuleHeader({
  n,
  title,
  subtitle,
  accent,
  right,
}: {
  n: string;
  title: string;
  subtitle: string;
  accent: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden border-b border-white/10">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-[-60%] h-[320px] w-[560px] -translate-x-1/2 rounded-full opacity-40"
          style={{ background: `radial-gradient(circle, ${accent} 0%, transparent 70%)`, filter: "blur(90px)" }}
        />
      </div>
      <div className="relative mx-auto max-w-6xl px-6 pb-8 pt-28 sm:pt-32">
        <motion.div {...loadProps(1)}>
          <Link
            href="/features#modules"
            className="hv-link font-mono text-[11px] uppercase tracking-[0.22em] text-hazedim hover:text-forge-cyan"
          >
            ← All modules
          </Link>
        </motion.div>

        <motion.div {...loadProps(2)} className="mt-5 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[12px] font-bold" style={{ color: accent }}>
                {n}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-widest"
                style={{ color: accent, borderColor: `${accent}55`, background: `${accent}12` }}
              >
                <span className="h-1 w-1 rounded-full" style={{ background: accent }} />
                connected to the engine
              </span>
            </div>
            <h1 className="mt-3 text-[2.1rem] font-medium leading-tight text-white sm:text-[2.6rem]">
              {title}
            </h1>
            <p className="mt-2.5 max-w-2xl text-[15px] leading-7 text-haze">{subtitle}</p>
          </div>
          {right}
        </motion.div>
      </div>
    </div>
  );
}

/** A bordered panel matching the Streamlit page's card layout. */
export function Panel({
  title,
  sub,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-panel/45 p-5 backdrop-blur ${className}`}>
      <div className="text-[15px] font-semibold text-white">{title}</div>
      {sub && <div className="mt-0.5 text-[12.5px] text-hazedim">{sub}</div>}
      <div className="mt-3 h-px w-full bg-white/10" />
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Streamlit's `_metric_row` — label, description, value. */
export function StatRow({
  label,
  desc,
  value,
  tone,
}: {
  label: string;
  desc: string;
  value: string;
  tone?: "pos" | "neg" | "neutral";
}) {
  const color =
    tone === "pos" ? "#00f5a0" : tone === "neg" ? "#ff5470" : "#e8f4fd";
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-white">{label}</div>
        <div className="text-[11.5px] leading-4 text-hazedim">{desc}</div>
      </div>
      <div className="shrink-0 font-mono text-[15px] font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

export function Skeleton({ h = 220 }: { h?: number }) {
  return <div className="animate-pulse rounded-xl border border-white/8 bg-white/[0.03]" style={{ height: h }} />;
}

/**
 * Shown before the user has asked for anything. Modules never fetch on mount —
 * nothing runs until Run is pressed, so opening a page is always cheap.
 */
export function IdleState({
  onRun, accent = "#00f5a0", label = "Run analysis", note,
}: {
  onRun: () => void; accent?: string; label?: string; note?: string;
}) {
  return (
    <div data-tour="idle" className="mt-4 rounded-2xl border border-dashed border-white/12 bg-panel/25 px-6 py-12 text-center">
      <div className="text-[15px] font-medium text-white">Ready when you are</div>
      <p className="mx-auto mt-2 max-w-[440px] text-[13.5px] leading-6 text-hazedim">
        {note ?? "Set the inputs above, then run it. Nothing is computed until you ask."}
      </p>
      <button
        onClick={onRun}
        className="hv-btn mt-6 rounded-[10px] border px-6 py-2.5 font-mono text-[12px] uppercase tracking-widest"
        style={{ borderColor: `${accent}80`, background: `${accent}1a`, color: accent }}
      >
        ▶ {label}
      </button>
    </div>
  );
}

/** Nudge shown when inputs changed after a run, so results are stale. */
export function StaleHint({ onRun, accent = "#00f5a0" }: { onRun: () => void; accent?: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5"
      style={{ borderColor: `${accent}44`, background: `${accent}0d` }}>
      <span className="font-mono text-[11.5px]" style={{ color: accent }}>
        Inputs changed — results below are from the previous run.
      </span>
      <button onClick={onRun}
        className="hv-btn rounded-[8px] border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-widest"
        style={{ borderColor: `${accent}80`, background: `${accent}1a`, color: accent }}>
        Re-run
      </button>
    </div>
  );
}

export function ApiDown({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-5 py-4">
      <div className="font-mono text-[11px] uppercase tracking-widest text-red-400">⛔ engine unavailable</div>
      <p className="mt-1.5 text-[14px] text-white/85">{message}</p>
      <p className="mt-2 font-mono text-[12px] text-hazedim">
        Start it with: <span className="text-forge-cyan">python -m uvicorn api.server:app --port 8000</span>
      </p>
    </div>
  );
}
