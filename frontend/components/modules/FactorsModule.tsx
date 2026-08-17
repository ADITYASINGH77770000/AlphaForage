"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  api, ApiError, downsample,
  type Point, type FactorsResponse, type FactorQuintileResponse,
  type FactorRegimeResponse, type FactorAttributionResponse,
  type FactorCrowdingResponse, type FactorDecayResponse,
} from "@/lib/api";
import { revealProps } from "../motion";
import { ApiDown, ModuleHeader, Panel, Skeleton, IdleState } from "./Shell";
import { Heatmap, Legend, LineChart, WeightBars } from "./charts";
import { TickerBar, yearsAgo } from "./TickerBar";

/* ──────────────────────────────────────────────────────────────────────────
   FACTORS MODULE — full parity with the Streamlit Factor Research Lab:
     📋 Factor Score Matrix     ⚖️ IC-Weighted Composite   📈 Time-Series IC
     💰 Cost-Adjusted Quintile  🌦️ Regime-Conditioned IC   🔬 Carhart Attribution
     🚨 Crowding Detection      📉 Cross-Sectional Decay   📋 Research Summary
   ────────────────────────────────────────────────────────────────────────── */

const ACCENT = "#00f5a0";
const RED = "#ff5470";
const GOLD = "#ffd700";
const CYAN = "#0be0ff";

const num = (v: unknown, d = 4) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : "—";
};
const pct = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "N/A" : `${(v * 100).toFixed(d)}%`;

/** IC colour bands from Grinold & Kahn: >0.05 strong, >0.02 meaningful. */
const icColor = (v: unknown) => {
  const n = Math.abs(Number(v));
  if (!Number.isFinite(n)) return "#cfe0f5";
  return n >= 0.05 ? ACCENT : n >= 0.02 ? GOLD : RED;
};
const signalColor = (s: unknown) => {
  const t = String(s ?? "");
  return /strong/i.test(t) ? ACCENT : /moderate/i.test(t) ? GOLD : /weak/i.test(t) ? RED : "#cfe0f5";
};

function Sub({ l, v, c = "#cfe0f5", note }: { l: string; v: string; c?: string; note?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink/50 px-3.5 py-3">
      <div className="font-mono text-[9px] uppercase tracking-wider text-hazedim">{l}</div>
      <div className="mt-1 text-[16px] font-semibold" style={{ color: c }}>{v}</div>
      {note && <div className="mt-0.5 font-mono text-[9.5px] text-hazedim">{note}</div>}
    </div>
  );
}

/** Generic table with per-column colouring hooks. */
function DataTable({ rows, colorFor, min = 520, max = 340 }: {
  rows: Record<string, unknown>[];
  colorFor?: (col: string, v: unknown) => string | undefined;
  min?: number; max?: number;
}) {
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-hazedim">No rows returned.</p>;
  const cols = Object.keys(rows[0]).filter((c) => c !== "index");
  const fmt = (v: unknown) =>
    typeof v === "number" ? (Math.abs(v) < 1 ? v.toFixed(4) : v.toFixed(2)) : String(v ?? "—");
  return (
    <div className="overflow-auto rounded-lg border border-white/8" style={{ maxHeight: max }}>
      <table className="w-full border-collapse text-left" style={{ minWidth: min }}>
        <thead className="sticky top-0 bg-ink/90"><tr>
          {cols.map((c) => (
            <th key={c} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{c}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="transition-colors hover:bg-white/[0.03]">
              {cols.map((c) => (
                <td key={c} className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                  style={{ color: colorFor?.(c, r[c]) ?? "#cfe0f5" }}>
                  {fmt(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FactorsModule() {
  const [tickers, setTickers] = useState("GOOG,NVDA,META,AMZN");
  const [start, setStart] = useState(yearsAgo(8));
  const [fwdDays, setFwdDays] = useState(21);
  const [factor, setFactor] = useState("Momentum");
  const [costBps, setCostBps] = useState(40);
  const [rebalFreq, setRebalFreq] = useState(21);
  const [nQuintiles, setNQuintiles] = useState(5);

  const [res, setRes] = useState<FactorsResponse | null>(null);
  const [qbt, setQbt] = useState<FactorQuintileResponse | null>(null);
  const [reg, setReg] = useState<FactorRegimeResponse | null>(null);
  const [attr, setAttr] = useState<FactorAttributionResponse | null>(null);
  const [crowd, setCrowd] = useState<FactorCrowdingResponse | null>(null);
  const [decay, setDecay] = useState<FactorDecayResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [qLoading, setQLoading] = useState(false);
  const [rLoading, setRLoading] = useState(false);
  const [aLoading, setALoading] = useState(false);
  const [cLoading, setCLoading] = useState(false);
  const [dLoading, setDLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const ignore = (e: unknown) => (e as Error)?.name === "AbortError";
  const msg = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

  /* One effect owns fetching: base result first, then each deep-analysis panel
     in parallel, each landing into its own state. */
  const run = useCallback(async () => {
    const list = tickers.split(",").map((t) => t.trim()).filter(Boolean);
    if (list.length < 2) { setError("Enter at least two tickers — factors are cross-sectional."); setLoading(false); return; }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null);
    setQbt(null); setReg(null); setAttr(null); setCrowd(null); setDecay(null);

    const body = {
      tickers: list, start, fwd_days: fwdDays, factor,
      cost_bps: costBps, rebal_freq: rebalFreq, n_quintiles: nQuintiles,
    };

    try {
      setRes(await api.factors(body, ac.signal));
      setLoading(false);
    } catch (e) {
      if (ignore(e)) return;
      setError(msg(e)); setLoading(false); return;
    }

    const fire = <T,>(
      call: Promise<T>, setV: (v: T) => void,
      setL: (b: boolean) => void, onErr: (m: string) => void
    ) => {
      setL(true);
      call.then(setV).catch((e) => { if (!ignore(e)) onErr(msg(e)); }).finally(() => setL(false));
    };

    fire(api.factorsQuintile(body, ac.signal), setQbt, setQLoading, (m) => setQbt({ error: m } as FactorQuintileResponse));
    fire(api.factorsRegime(body, ac.signal), setReg, setRLoading, () => setReg({ rows: [], pivot: {}, best: null, worst: null }));
    fire(api.factorsAttribution(body, ac.signal), setAttr, setALoading, (m) => setAttr({ error: m }));
    fire(api.factorsCrowding(body, ac.signal), setCrowd, setCLoading, (m) => setCrowd({ error: m }));
    fire(api.factorsDecay(body, ac.signal), setDecay, setDLoading, () => setDecay({ rows: [], optimal_horizon: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers, start, fwdDays, factor, costBps, rebalFreq, nQuintiles]);

  // Nothing is fetched until the user presses Run — opening the page is free.
  useEffect(() => {
    if (runId === 0) return;
    run();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  /* ── derived ── */
  const factorList = res?.factors ?? ["Momentum", "LowVol", "Size", "Quality", "Value"];
  const weights = res?.composite?.weights ?? {};
  const compScores = res?.composite?.scores ?? [];

  const tsIc = useMemo<{ labels: string[]; ic: (number | null)[]; roll: (number | null)[]; icir: (number | null)[] }>(() => {
    const rows = downsample(res?.ts_ic?.[factor] ?? [], 160);
    const gv = (r: Point, k: string) => {
      const n = Number(r?.[k]);
      return Number.isFinite(n) ? n : null;
    };
    return {
      labels: rows.map((r) => String(r?.Date ?? "").slice(0, 10)),
      ic: rows.map((r) => gv(r, "IC")),
      roll: rows.map((r) => gv(r, "RollingMeanIC")),
      icir: rows.map((r) => gv(r, "RollingICIR")),
    };
  }, [res, factor]);

  const crowdSeries = useMemo(() => downsample(crowd?.series ?? [], 200), [crowd]);

  const decayRows = decay?.rows ?? [];
  const decayIc = decayRows.map((r) => Number(r["IC"]));
  const decayLabels = decayRows.map((r) => `${r["Horizon (days)"]}d`);

  /* Research summary — the same rules the Streamlit page applies. */
  const summary = useMemo(() => {
    if (!res) return [];
    const out: { tone: "good" | "warn" | "bad"; text: string }[] = [];
    const icRows = res.ic_summary ?? [];
    for (const r of icRows) {
      const ic = Number(r["Mean IC"]);
      if (Number.isFinite(ic) && Math.abs(ic) < 0.02) {
        out.push({ tone: "warn", text: `${r["Factor"]} has very low IC (${ic.toFixed(4)}). Consider removing it from the composite — it adds noise, not signal.` });
      }
    }
    if (qbt && !qbt.error && qbt.ls_net_cagr != null && qbt.ls_net_cagr <= 0) {
      out.push({ tone: "bad", text: `${factor} quintile strategy loses money net of ${costBps}bps costs. Reduce rebalancing to at least ${rebalFreq * 2} days.` });
    }
    if (crowd?.is_crowded) {
      out.push({ tone: "bad", text: `${factor} is crowded (dispersion at ${pct(crowd.current_pctile, 0)} percentile). Reduce allocation or switch factors.` });
    }
    if (attr && !attr.error && attr.alpha_tstat != null && Math.abs(attr.alpha_tstat) < 2) {
      out.push({ tone: "warn", text: "No significant alpha detected. Returns are fully explained by factor premia — a cheaper passive factor ETF would do the same job." });
    }
    const best = icRows.reduce<{ f: string; v: number }>((acc, r) => {
      const v = Math.abs(Number(r["Mean IC"]));
      return Number.isFinite(v) && v > acc.v ? { f: String(r["Factor"]), v } : acc;
    }, { f: "N/A", v: -1 });
    out.push({ tone: "good", text: `Best factor by absolute IC: ${best.f}. Use it as the primary signal inside the IC-weighted composite.` });
    return out;
  }, [res, qbt, crowd, attr, factor, costBps, rebalFreq]);

  return (
    <>
      <ModuleHeader
        n="09" title="Factor Analytics" accent={ACCENT}
        subtitle="Information Coefficient through time, an IC-weighted composite, cost-adjusted quintile backtests, regime conditioning, Carhart attribution and crowding — what actually predicts returns, and for how long."
      />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <TickerBar ticker={tickers} onTicker={setTickers} start={start} onStart={setStart} multi
          label="Universe" loading={loading} onRefresh={() => setRunId((n) => n + 1)} accent={ACCENT} />

        {/* ── settings ── */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-panel/45 p-5 backdrop-blur">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">
            Primary factor (deep analysis)
          </div>
          <div className="flex flex-wrap gap-2">
            {factorList.map((f) => (
              <button key={f} onClick={() => setFactor(f)}
                className="hv rounded-[10px] border px-3.5 py-1.5 font-mono text-[12px]"
                style={f === factor
                  ? { borderColor: ACCENT, background: `${ACCENT}1f`, color: ACCENT }
                  : { borderColor: "rgba(255,255,255,0.12)", color: "#adc6dd" }}>
                {f}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Forward window — {fwdDays}d</div>
              <input type="range" min={1} max={63} value={fwdDays} onChange={(e) => setFwdDays(+e.target.value)}
                onMouseUp={() => setRunId((n) => n + 1)} onTouchEnd={() => setRunId((n) => n + 1)} className="w-full accent-[#00f5a0]" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Round-trip cost — {costBps} bps</div>
              <input type="range" min={10} max={200} step={5} value={costBps} onChange={(e) => setCostBps(+e.target.value)}
                onMouseUp={() => setRunId((n) => n + 1)} onTouchEnd={() => setRunId((n) => n + 1)} className="w-full accent-[#00f5a0]" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Rebalance — every {rebalFreq}d</div>
              <input type="range" min={5} max={63} value={rebalFreq} onChange={(e) => setRebalFreq(+e.target.value)}
                onMouseUp={() => setRunId((n) => n + 1)} onTouchEnd={() => setRunId((n) => n + 1)} className="w-full accent-[#00f5a0]" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Quintiles — {nQuintiles}</div>
              <input type="range" min={3} max={10} value={nQuintiles} onChange={(e) => setNQuintiles(+e.target.value)}
                onMouseUp={() => setRunId((n) => n + 1)} onTouchEnd={() => setRunId((n) => n + 1)} className="w-full accent-[#00f5a0]" />
            </div>
          </div>

          <button onClick={() => setRunId((n) => n + 1)} disabled={loading}
            className="hv-btn mt-4 rounded-[10px] border px-5 py-2 font-mono text-[12px] uppercase tracking-widest disabled:opacity-60"
            style={{ borderColor: `${ACCENT}80`, background: `${ACCENT}1a`, color: ACCENT }}>
            {loading ? "Running…" : "Run full factor analysis"}
          </button>
        </div>

        {error && <div className="mt-6"><ApiDown message={error} /></div>}

        {runId === 0 ? (
          <IdleState onRun={() => setRunId((n) => n + 1)} accent={ACCENT}
            label="Run factor analysis"
            note="Choose a universe and a primary factor, then run. Nothing is computed until you ask." />
        ) : (
        <>

        {/* ── 📋 Factor Score Matrix ── */}
        <motion.div {...revealProps()} className="mt-4">
          <Panel title="📋 Factor Score Matrix" sub="Percentile rank per ticker per factor (0 = worst, 1 = best). Cross-sectional — tickers compared to each other, not to history.">
            {loading && !res ? <Skeleton h={200} /> : res && (
              <>
                <DataTable rows={res.factor_matrix}
                  colorFor={(c, v) => {
                    const n = Number(v);
                    if (c === "index" || !Number.isFinite(n)) return undefined;
                    return n >= 0.66 ? ACCENT : n >= 0.33 ? GOLD : RED;
                  }} />
                <p className="mt-3 text-[12px] text-hazedim">
                  ⚠️ Value and Quality use OHLCV-based proxies (price-trend deviation, return consistency). True P/B and ROE need fundamental data.
                </p>
              </>
            )}
          </Panel>
        </motion.div>

        {/* ── ⚖️ IC-Weighted Composite ── */}
        <motion.div {...revealProps(0.04)} className="mt-4">
          <Panel title="⚖️ IC-Weighted Composite Factor Score"
            sub="Grinold & Kahn (1999): weight each factor by its recent IC, so stronger predictors get more influence as conditions change.">
            {loading && !res ? <Skeleton h={220} /> : res && (
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Dynamic IC weights — negative means inversely predictive
                  </div>
                  <div className="space-y-2.5">
                    {Object.entries(weights).map(([f, w]) => (
                      <div key={f} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 font-mono text-[12px] text-white">{f}</span>
                        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/8">
                          <motion.div className="absolute h-full rounded-full"
                            style={{ background: w >= 0 ? ACCENT : RED, left: w >= 0 ? "50%" : undefined, right: w < 0 ? "50%" : undefined }}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(50, (Math.abs(w) / 0.5) * 50)}%` }}
                            transition={{ duration: 0.8 }} />
                          <div className="absolute left-1/2 h-full w-px bg-white/25" />
                        </div>
                        <span className="w-16 shrink-0 text-right font-mono text-[12px] font-bold"
                          style={{ color: w >= 0 ? ACCENT : RED }}>{w.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">Composite ranking</div>
                  <div className="overflow-x-auto rounded-lg border border-white/8">
                    <table className="w-full border-collapse text-left">
                      <thead className="bg-ink/70"><tr>
                        {["Rank", "Ticker", "Composite score"].map((h) => (
                          <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {compScores.map((s) => (
                          <tr key={s.ticker} className="hover:bg-white/[0.03]">
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-hazedim">{s.rank}</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-white">{s.ticker}</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                              style={{ color: s.score >= 0 ? ACCENT : RED }}>{s.score.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {compScores.length > 1 && (
                    <p className="mt-3 text-[12.5px] text-haze">
                      Top pick <b className="text-white">{compScores[0].ticker}</b> ({compScores[0].score.toFixed(3)}) ·
                      bottom <b className="text-white">{compScores[compScores.length - 1].ticker}</b> ({compScores[compScores.length - 1].score.toFixed(3)})
                    </p>
                  )}
                </div>
              </div>
            )}
          </Panel>
        </motion.div>

        {/* ── 📈 Time-Series IC ── */}
        <motion.div {...revealProps(0.06)} className="mt-4">
          <Panel title="📈 Time-Series IC Analysis"
            sub="IC recomputed at every rebalance across the full history — not one snapshot. Mean IC > 0.05 is meaningful; ICIR > 0.5 is reliable.">
            {loading && !res ? <Skeleton h={260} /> : res && (
              <>
                <DataTable rows={(res.ic_summary ?? []).map((r) => ({
                  Factor: r["Factor"], "Mean IC": r["Mean IC"], ICIR: r["ICIR"],
                  "IC > 0 %": r["IC > 0 %"], Obs: r["Obs"], Signal: r["Signal"],
                }))}
                  colorFor={(c, v) =>
                    c === "Mean IC" ? icColor(v)
                      : c === "Signal" ? signalColor(v)
                        : c === "ICIR" ? (Math.abs(Number(v)) >= 0.5 ? ACCENT : Math.abs(Number(v)) >= 0.3 ? GOLD : RED)
                          : undefined} />

                {tsIc.labels.length > 0 ? (
                  <div className="mt-5">
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      {factor} — IC per rebalance, with rolling mean IC and ICIR
                    </div>
                    <LineChart height={230} zeroLine labels={tsIc.labels}
                      yFormat={(v) => v.toFixed(2)}
                      series={[
                        { label: "IC", color: "rgba(11,224,255,0.55)", values: tsIc.ic },
                        { label: "Rolling mean IC", color: CYAN, values: tsIc.roll },
                        { label: "Rolling ICIR", color: GOLD, values: tsIc.icir, dashed: true },
                        { label: "IC = 0.05", color: "rgba(0,245,160,0.4)", values: tsIc.labels.map(() => 0.05), dashed: true },
                      ]} />
                    <Legend items={[
                      { color: "rgba(11,224,255,0.55)", label: "IC per rebalance" },
                      { color: CYAN, label: "Rolling mean IC" },
                      { color: GOLD, label: "Rolling ICIR" },
                      { color: "rgba(0,245,160,0.4)", label: "IC = 0.05 threshold" },
                    ]} />
                  </div>
                ) : (
                  <p className="mt-4 text-[13px] text-hazedim">Insufficient history for time-series IC — use a longer date range.</p>
                )}
              </>
            )}
          </Panel>
        </motion.div>

        {/* ── 💰 Cost-Adjusted Quintile Backtest ── */}
        <motion.div {...revealProps(0.08)} className="mt-4">
          <Panel title="💰 Cost-Adjusted Quintile Backtest"
            sub="Novy-Marx & Velikov (2016): factor strategies often look good gross of costs and lose money net. Round-trip costs are charged on turnover at every rebalance.">
            {qLoading && !qbt ? <Skeleton h={200} /> : qbt?.error ? (
              <div className="py-6 text-center">
                <p className="text-[13.5px] text-hazedim">{qbt.error}</p>
                {nQuintiles > (res?.tickers.length ?? 0) && (
                  <p className="mt-1.5 text-[12.5px]" style={{ color: GOLD }}>
                    You are asking for {nQuintiles} quintiles from {res?.tickers.length} tickers — there aren&apos;t
                    enough names to fill the buckets. Lower the quintile count or widen the universe.
                  </p>
                )}
              </div>
            ) : qbt ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Sub l="Gross L/S CAGR" v={pct(qbt.ls_gross_cagr)} c={CYAN} />
                  <Sub l="Net L/S CAGR" v={pct(qbt.ls_net_cagr)}
                    c={qbt.ls_net_cagr != null && qbt.ls_net_cagr > 0 ? ACCENT : RED} note="after costs" />
                  <Sub l="Avg turnover" v={pct(qbt.avg_turnover, 1)}
                    c={(qbt.avg_turnover ?? 0) > 0.8 ? GOLD : "#cfe0f5"} note="per rebalance" />
                  <Sub l="Cost per rebalance" v={`${qbt.cost_bps ?? costBps} bps`} />
                </div>

                {(qbt.table?.length ?? 0) > 0 && (
                  <div className="mt-4">
                    <DataTable rows={qbt.table} min={420}
                      colorFor={(c, v) => {
                        if (!/CAGR|Sharpe/.test(c)) return undefined;
                        const n = parseFloat(String(v));
                        return Number.isFinite(n) ? (n >= 0 ? ACCENT : RED) : undefined;
                      }} />
                  </div>
                )}

                {qbt.ls_net_cagr != null && (
                  <div className="mt-4 rounded-xl border px-5 py-3.5"
                    style={qbt.ls_net_cagr > 0
                      ? { borderColor: "#1f8f4e55", background: "rgba(31,143,78,0.1)" }
                      : { borderColor: "#dc323255", background: "rgba(220,50,50,0.1)" }}>
                    <div className="font-mono text-[12.5px] font-bold" style={{ color: qbt.ls_net_cagr > 0 ? "#1f8f4e" : "#dc3232" }}>
                      {qbt.ls_net_cagr > 0
                        ? `Profitable net of costs — gross ${pct(qbt.ls_gross_cagr)}, net ${pct(qbt.ls_net_cagr)}`
                        : `Unprofitable net of ${qbt.cost_bps ?? costBps}bps — gross ${pct(qbt.ls_gross_cagr)}, net ${pct(qbt.ls_net_cagr)}`}
                    </div>
                    {qbt.ls_gross_cagr != null && (
                      <div className="mt-1 text-[13px] text-haze">
                        Costs consume {pct(qbt.ls_gross_cagr - qbt.ls_net_cagr)} of return per year.
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── 🌦️ Regime-Conditioned Factor IC ── */}
        <motion.div {...revealProps(0.1)} className="mt-4">
          <Panel title="🌦️ Regime-Conditioned Factor Performance"
            sub="Daniel & Moskowitz (2016): momentum crashes in bear markets. Each factor's IC is broken out by bull / sideways / bear regime.">
            {rLoading && !reg ? <Skeleton h={240} /> : (reg?.rows.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-hazedim">Not enough data for regime analysis — use a longer date range (3+ years).</p>
            ) : reg ? (
              <>
                {Object.keys(reg.pivot).length > 0 && (
                  <div className="mb-5">
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      Factor IC by regime — green = the factor works, red = it hurts
                    </div>
                    <Heatmap matrix={reg.pivot} columns={reg.regimes} />
                  </div>
                )}
                <DataTable rows={reg.rows} min={560}
                  colorFor={(c, v) => c === "Mean IC" ? icColor(v) : c === "Signal" ? signalColor(v) : undefined} />
                {reg.best && reg.worst && (
                  <p className="mt-3 text-[12.5px] text-haze">
                    Best combination: <b className="text-white">{String(reg.best["Factor"])}</b> in{" "}
                    <b className="text-white">{String(reg.best["Regime"])}</b> (IC {num(reg.best["Mean IC"])}) ·
                    worst: <b className="text-white">{String(reg.worst["Factor"])}</b> in{" "}
                    <b className="text-white">{String(reg.worst["Regime"])}</b> (IC {num(reg.worst["Mean IC"])})
                  </p>
                )}
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── 🔬 Carhart Attribution ── */}
        <motion.div {...revealProps(0.12)} className="mt-4">
          <Panel title="🔬 Factor Attribution (Carhart 1997)"
            sub="Splits the equal-weight universe return into alpha plus factor betas. Alpha with |t| ≥ 2 is genuine skill; otherwise you are just riding factor premia.">
            {aLoading && !attr ? <Skeleton h={200} /> : attr?.error ? (
              <p className="py-6 text-center text-[13.5px] text-hazedim">{attr.error}</p>
            ) : attr ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Sub l="Annualised alpha" v={String(attr.alpha_pct ?? "—")} c={ACCENT} />
                  <Sub l="Alpha t-stat" v={attr.alpha_tstat != null ? attr.alpha_tstat.toExponential(2) : "—"}
                    c={Math.abs(attr.alpha_tstat ?? 0) >= 2 ? ACCENT : RED}
                    note={Math.abs(attr.alpha_tstat ?? 0) >= 2 ? "significant ✅" : "not significant ❌"} />
                  <Sub l="R² (factor explained)" v={pct(attr.r_squared)} c={GOLD} />
                </div>
                {(attr.table?.length ?? 0) > 0 && (
                  <div className="mt-4">
                    <DataTable rows={attr.table!} min={620}
                      colorFor={(c, v) => c === "Significant" ? (/yes/i.test(String(v)) ? ACCENT : "#8aa6c8") : undefined} />
                  </div>
                )}
                {(attr.r_squared ?? 0) > 0.99 && (
                  <p className="mt-3 text-[12px] text-hazedim">
                    ⚠️ R² is essentially 1.0 because the factors here are built from the same small universe being regressed — the t-stats are not meaningful at this universe size. Widen the universe for a real attribution.
                  </p>
                )}
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── 🚨 Crowding ── */}
        <motion.div {...revealProps(0.14)} className="mt-4">
          <Panel title="🚨 Factor Crowding Detection"
            sub="Khandani & Lo (2007): crowded factors liquidate together. Detected as a collapse in cross-sectional score dispersion.">
            {cLoading && !crowd ? <Skeleton h={220} /> : crowd?.error ? (
              <p className="py-6 text-center text-[13.5px] text-hazedim">{crowd.error}</p>
            ) : crowd ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Sub l="Crowding level" v={String(crowd.crowding_level ?? "—")}
                    c={crowd.is_crowded ? RED : ACCENT} />
                  <Sub l="Dispersion percentile" v={pct(crowd.current_pctile, 1)}
                    c={(crowd.current_pctile ?? 1) < 0.25 ? RED : "#cfe0f5"} note="low = crowded" />
                  <Sub l="Current dispersion" v={num(crowd.current_dispersion)} />
                  <Sub l="Avg score autocorr." v={num(crowd.avg_autocorr)} note="high = persistent rankings" />
                </div>

                <div className="mt-4 rounded-xl border px-5 py-3.5"
                  style={crowd.is_crowded
                    ? { borderColor: "#dc323255", background: "rgba(220,50,50,0.1)" }
                    : { borderColor: "#1f8f4e55", background: "rgba(31,143,78,0.1)" }}>
                  <div className="font-mono text-[12.5px] font-bold" style={{ color: crowd.is_crowded ? "#dc3232" : "#1f8f4e" }}>
                    {crowd.is_crowded
                      ? `Crowding detected — level ${crowd.crowding_level}, dispersion at ${pct(crowd.current_pctile, 0)} of its historical range`
                      : `No significant crowding — dispersion at ${pct(crowd.current_pctile, 0)} of its historical range`}
                  </div>
                  <div className="mt-1 text-[13px] text-haze">
                    {crowd.is_crowded
                      ? "Many funds likely hold the same positions. Reduce size — exits will be correlated."
                      : "Scores are well dispersed across the universe, so positioning is not concentrated."}
                  </div>
                </div>

                {crowdSeries.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      {factor} score dispersion over time — drops = crowding, spikes = opportunity
                    </div>
                    <LineChart height={200} fillFirst
                      labels={crowdSeries.map((r) => String(r?.Date ?? "").slice(0, 10))}
                      yFormat={(v) => v.toFixed(2)}
                      series={[
                        { label: "Dispersion", color: CYAN, values: crowdSeries.map((r) => Number(r?.Dispersion)) },
                        ...(crowd.crowding_zone != null
                          ? [{ label: "25th pct", color: "rgba(255,215,0,0.5)", values: crowdSeries.map(() => crowd.crowding_zone!), dashed: true }]
                          : []),
                      ]} />
                    <Legend items={[
                      { color: CYAN, label: "Score dispersion" },
                      { color: "rgba(255,215,0,0.5)", label: "25th percentile — crowding zone" },
                    ]} />
                  </div>
                )}
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── 📉 Cross-Sectional Decay ── */}
        <motion.div {...revealProps(0.16)} className="mt-4">
          <Panel title="📉 Cross-Sectional Factor Decay Curve"
            sub="IC measured cross-sectionally at many sample dates per horizon (Grinold & Kahn 1999) — how fast the signal loses its predictive power.">
            {dLoading && !decay ? <Skeleton h={230} /> : decayRows.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-hazedim">Not enough data for the decay curve — use a longer date range (3+ years).</p>
            ) : (
              <>
                <LineChart height={210} zeroLine labels={decayLabels}
                  yFormat={(v) => v.toFixed(3)}
                  series={[
                    { label: "Mean IC", color: CYAN, values: decayIc },
                    { label: "IC = 0.05", color: "rgba(0,245,160,0.4)", values: decayIc.map(() => 0.05), dashed: true },
                  ]} />
                <Legend items={[
                  { color: CYAN, label: `${factor} mean cross-sectional IC` },
                  { color: "rgba(0,245,160,0.4)", label: "IC = 0.05 threshold" },
                ]} />
                <div className="mt-4">
                  <DataTable rows={decayRows} min={420}
                    colorFor={(c, v) => c === "IC" ? icColor(v) : undefined} />
                </div>
                <p className="mt-3 text-[12.5px] text-haze">
                  {decay?.optimal_horizon != null
                    ? <>Signal stays meaningful (IC &gt; 0.02) out to <b className="text-white">{decay.optimal_horizon} days</b> — rebalance around there.</>
                    : <>IC is below 0.02 at every horizon. {factor} may have no predictive power in this universe.</>}
                </p>
              </>
            )}
          </Panel>
        </motion.div>

        {/* ── 📋 Research Summary ── */}
        {summary.length > 0 && (
          <motion.div {...revealProps(0.18)} className="mt-4">
            <Panel title="📋 Factor Research Summary" sub="What the whole run adds up to">
              <div className="space-y-2">
                {summary.map((s, i) => (
                  <div key={i} className="rounded-lg border-l-[3px] px-4 py-2.5 text-[13px] leading-6"
                    style={{
                      borderColor: s.tone === "good" ? ACCENT : s.tone === "warn" ? GOLD : RED,
                      background: s.tone === "good" ? "rgba(0,245,160,0.06)" : s.tone === "warn" ? "rgba(255,215,0,0.06)" : "rgba(255,84,112,0.06)",
                      color: "#cfe0f5",
                    }}>
                    {s.tone === "good" ? "✅ " : s.tone === "warn" ? "⚠️ " : "🔴 "}{s.text}
                  </div>
                ))}
              </div>
            </Panel>
          </motion.div>
        )}

        </>
        )}

        <p className="mt-6 text-center font-mono text-[11px] text-hazedim/70">
          Momentum · value · size · quality · low-volatility factors, computed by core.factor_engine.
        </p>
      </section>
    </>
  );
}
