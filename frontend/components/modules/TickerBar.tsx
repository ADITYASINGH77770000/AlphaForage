"use client";

import { useState } from "react";
import { normalizeTicker } from "@/lib/api";

/** Simple ticker + start-date bar for modules that don't need Live Mode. */
export function yearsAgo(y: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - y);
  return d.toISOString().slice(0, 10);
}

export function TickerBar({
  ticker, onTicker, start, onStart, loading, onRefresh, accent = "#00f5a0",
  label = "Ticker", multi = false,
}: {
  ticker: string;
  onTicker: (t: string) => void;
  start: string;
  onStart: (s: string) => void;
  loading: boolean;
  onRefresh: () => void;
  accent?: string;
  label?: string;
  multi?: boolean;
}) {
  const [draft, setDraft] = useState(ticker);

  /** Normalise and apply the typed symbol. Does not run anything on its own. */
  const apply = () => {
    const t = multi
      ? draft.split(",").map((c) => normalizeTicker(c)).filter(Boolean).join(",")
      : normalizeTicker(draft);
    if (!t) { setDraft(ticker); return; }
    setDraft(t);
    if (t !== ticker) onTicker(t);
  };

  /** Load / Enter = apply the symbol AND run. Modules never fetch on their own. */
  const applyAndRun = () => { apply(); onRefresh(); };

  return (
    <div data-tour="inputs" className="rounded-2xl border border-white/10 bg-panel/45 p-5 backdrop-blur">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">{label}</div>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={apply}
            onKeyDown={(e) => e.key === "Enter" && applyAndRun()}
            spellCheck={false}
            placeholder={multi ? "GOOG,NVDA,META" : "TSLA"}
            className="w-full rounded-[10px] border border-white/12 bg-ink/60 px-3 py-2 font-mono text-[14px] uppercase text-white outline-none transition-colors placeholder:text-hazedim/50 focus:border-white/40"
          />
          <div className="mt-1 text-[11px] text-hazedim/70">
            {multi ? "Comma-separated symbols" : "Type any symbol — e.g. TSLA, RELIANCE.NS, ^NSEI"}
          </div>
        </div>

        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Start Date</div>
          <input
            type="date"
            value={start}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => onStart(e.target.value)}
            className="w-full rounded-[10px] border border-white/12 bg-ink/60 px-3 py-2 font-mono text-[13.5px] text-white outline-none transition-colors focus:border-white/40"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={applyAndRun}
            disabled={loading}
            className="hv-btn rounded-[10px] border px-4 py-2 font-mono text-[12px] uppercase tracking-widest disabled:opacity-50"
            style={{ borderColor: `${accent}80`, background: `${accent}18`, color: accent }}
          >
            Load
          </button>
          <button
            data-tour="run"
            onClick={onRefresh}
            disabled={loading}
            className="hv-btn rounded-[10px] border border-white/14 bg-white/[0.05] px-4 py-2 font-mono text-[12px] uppercase tracking-widest text-white disabled:opacity-50"
          >
            {loading ? "…" : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}
