"use client";

import { useState } from "react";
import {
  LIVE_INTERVALS,
  LIVE_LOOKBACKS,
  normalizeTicker,
  type DataEngine,
  type FrameMeta,
} from "@/lib/api";

/* ──────────────────────────────────────────────────────────────────────────
   Data Engine — the same controls as the Streamlit sidebar:
     · Ticker            (free text, any symbol)
     · Update Mode       Static Mode / Live Mode
     · Static Start Date (Static only)
     · Live Interval     1m … 60m      (Live only)
     · Live Fetch Window 1d / 2d / 5d  (Live only)
     · Refresh Seconds   1 – 300       (Live only)
   ────────────────────────────────────────────────────────────────────────── */

const ACCENT = "#00f5a0";

export function DataEngineBar({
  ticker,
  onTicker,
  engine,
  onEngine,
  meta,
  loading,
  onRefresh,
}: {
  ticker: string;
  onTicker: (t: string) => void;
  engine: DataEngine;
  onEngine: (e: DataEngine) => void;
  meta?: FrameMeta | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState(ticker);
  const live = engine.live;

  const submit = () => {
    const t = normalizeTicker(draft);
    if (!t) {
      setDraft(ticker); // reject empty/invalid input, restore the loaded symbol
      return;
    }
    setDraft(t); // reflect the normalised symbol back into the field
    if (t !== ticker) onTicker(t);
  };

  return (
    <div data-tour="inputs" className="rounded-2xl border border-white/10 bg-panel/45 p-5 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[15px] font-semibold text-white">Data Engine</div>
        {meta && (
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px]">
            <span
              className="rounded-full border px-2.5 py-1 uppercase tracking-widest"
              style={
                meta.source === "real"
                  ? { color: ACCENT, borderColor: `${ACCENT}55`, background: `${ACCENT}12` }
                  : { color: "#ffd700", borderColor: "#ffd70055", background: "#ffd7000f" }
              }
            >
              ● {meta.badge}
            </span>
            <span className="text-hazedim">
              {meta.mode} · interval {meta.interval}
              {meta.last_bar ? ` · last bar ${meta.last_bar}` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 h-px w-full bg-white/10" />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* ── ticker + mode ── */}
        <div className="space-y-4">
          <Field label="Ticker" hint="Type any symbol — e.g. TSLA, AAPL, RELIANCE.NS, ^NSEI">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={submit}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                spellCheck={false}
                placeholder="TSLA"
                className="min-w-0 flex-1 rounded-[10px] border border-white/12 bg-ink/60 px-3 py-2 font-mono text-[14px] uppercase text-white outline-none transition-colors placeholder:text-hazedim/50 focus:border-forge-green/60"
              />
              <button
                onClick={submit}
                className="hv-btn rounded-[10px] border border-forge-green/50 bg-forge-green/10 px-4 py-2 font-mono text-[12px] uppercase tracking-widest text-forge-green"
              >
                Load
              </button>
            </div>
          </Field>

          <Field label="Update Mode">
            <div className="flex gap-1.5 rounded-[10px] border border-white/10 p-1">
              {[
                { l: "Static Mode", v: false },
                { l: "Live Mode", v: true },
              ].map((o) => (
                <button
                  key={o.l}
                  onClick={() => onEngine({ ...engine, live: o.v })}
                  className="flex-1 rounded-[7px] px-3 py-1.5 font-mono text-[12px] transition-colors"
                  style={
                    live === o.v
                      ? { background: `${ACCENT}1f`, color: ACCENT }
                      : { color: "#8aa6c8" }
                  }
                >
                  {o.l}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* ── mode-specific controls ── */}
        <div className="space-y-4">
          {!live ? (
            <Field label="Static Start Date" hint="Dataset begins from this date">
              <input
                type="date"
                value={engine.start}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => onEngine({ ...engine, start: e.target.value })}
                className="w-full rounded-[10px] border border-white/12 bg-ink/60 px-3 py-2 font-mono text-[13.5px] text-white outline-none transition-colors focus:border-forge-green/60"
              />
            </Field>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Live Interval">
                  <Select
                    value={engine.interval}
                    options={LIVE_INTERVALS as unknown as string[]}
                    onChange={(v) => onEngine({ ...engine, interval: v })}
                  />
                </Field>
                <Field label="Live Fetch Window">
                  <Select
                    value={engine.lookback}
                    options={LIVE_LOOKBACKS as unknown as string[]}
                    onChange={(v) => onEngine({ ...engine, lookback: v })}
                  />
                </Field>
              </div>
              <Field label={`Refresh Seconds — ${engine.refreshSeconds}s`} hint="Auto-refetches while Live Mode is on">
                <input
                  type="range"
                  min={1}
                  max={300}
                  step={1}
                  value={engine.refreshSeconds}
                  onChange={(e) => onEngine({ ...engine, refreshSeconds: Number(e.target.value) })}
                  className="w-full accent-[#00f5a0]"
                />
              </Field>
            </>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="hv-btn rounded-[10px] border border-white/14 bg-white/[0.05] px-4 py-2 font-mono text-[12px] uppercase tracking-widest text-white disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh now"}
            </button>
            {live && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-forge-green">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forge-green" />
                auto-refresh every {engine.refreshSeconds}s
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] leading-4 text-hazedim/70">{hint}</div>}
    </div>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full cursor-pointer rounded-[10px] border border-white/12 bg-ink/60 px-3 py-2 font-mono text-[13.5px] text-white outline-none transition-colors focus:border-forge-green/60"
    >
      {options.map((o) => (
        <option key={o} value={o} className="bg-[#0b1426]">
          {o}
        </option>
      ))}
    </select>
  );
}
