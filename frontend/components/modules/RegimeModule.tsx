"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  api, ApiError, downsample,
  type Point, type RegimeResponse, type RegimeRollingResponse,
} from "@/lib/api";
import { revealProps } from "../motion";
import { ApiDown, ModuleHeader, Panel, Skeleton, IdleState } from "./Shell";
import { Heatmap, Legend, LineChart, Scatter, WeightBars, type Series } from "./charts";
import { TickerBar, yearsAgo } from "./TickerBar";

/* ──────────────────────────────────────────────────────────────────────────
   REGIME MODULE — full parity with the Streamlit Regime page's six tabs:
     🗺️ Regime Map            📊 Forward Probabilities   ⚠️ Early Warning
     🤖 Strategy Router        🔄 Rolling HMM             📈 Statistics
   The rolling HMM refits the model repeatedly, so it is opt-in and loads
   into its own panel rather than blocking the page.
   ────────────────────────────────────────────────────────────────────────── */

const ACCENT = "#0be0ff";
const GREEN = "#00f5a0";
const RED = "#ff5470";
const GOLD = "#ffd700";

const REGIME_COLOR = (name: string) =>
  /bull/i.test(name) ? GREEN : /bear/i.test(name) ? RED : GOLD;

const pct = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`;

const label = (r: Point) => String(r?.index ?? r?.Date ?? "");
const val = (r: Point, k = "v") => {
  const n = Number(r?.[k]);
  return Number.isFinite(n) ? n : null;
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

export function RegimeModule() {
  const [ticker, setTicker] = useState("GOOG");
  const [start, setStart] = useState(yearsAgo(8));
  const [nStates, setNStates] = useState(3);
  const [showRolling, setShowRolling] = useState(false);

  const [res, setRes] = useState<RegimeResponse | null>(null);
  const [roll, setRoll] = useState<RegimeRollingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [rLoading, setRLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rErr, setRErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const ignore = (e: unknown) => (e as Error)?.name === "AbortError";
  const msg = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

  const load = useCallback(async (t: string, s: string, n: number) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null); setRoll(null); setRErr(null);
    try { setRes(await api.regime(t, s, n, ac.signal)); setLoading(false); }
    catch (e) {
      if (ignore(e)) return;
      setError(msg(e)); setLoading(false);
    }
  }, []);

  // Nothing is fetched until the user presses Run — opening the page is free.
  useEffect(() => {
    if (tick === 0) return;
    load(ticker, start, nStates);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const loadRolling = useCallback(async () => {
    setRLoading(true); setRErr(null);
    try { setRoll(await api.regimeRolling(ticker, start, nStates)); }
    catch (e) { if (!ignore(e)) setRErr(msg(e)); }
    finally { setRLoading(false); }
  }, [ticker, start, nStates]);

  useEffect(() => {
    if (showRolling && !roll && !rLoading) loadRolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRolling, roll]);

  /* ── derived ── */
  const price = useMemo(() => downsample(res?.price_data ?? [], 220), [res]);
  const counts = res?.regime_counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const current = res?.current_regime ?? "";
  const ew = res?.early_warning;
  const strat = res?.strategy;

  const regimeCols = useMemo(
    () => (res?.forward_proba?.length
      ? Object.keys(res.forward_proba[0]).filter((k) => k !== "index" && k !== "Date")
      : []),
    [res]
  );

  const fwd = useMemo<{ labels: string[]; series: Series[] }>(() => {
    if (!res?.forward_proba?.length) return { labels: [], series: [] };
    const rows = downsample(res.forward_proba, 220);
    return {
      labels: rows.map(label),
      series: regimeCols.map((c) => ({
        label: c, color: REGIME_COLOR(c), values: rows.map((r) => val(r, c)),
      })),
    };
  }, [res, regimeCols]);

  const ewChart = useMemo<{ labels: string[]; ac1: Series[]; variance: Series[] }>(() => {
    if (!ew?.ac1?.length) return { labels: [], ac1: [], variance: [] };
    const a = downsample(ew.ac1, 220);
    const idx = new Map(a.map((r, i) => [label(r), i]));
    const varr: (number | null)[] = new Array(a.length).fill(null);
    ew.variance.forEach((r) => { const i = idx.get(label(r)); if (i != null) varr[i] = val(r); });
    return {
      labels: a.map(label),
      ac1: [
        { label: "AC1", color: "#ff8a5c", values: a.map((r) => val(r)) },
        { label: "Threshold 0.15", color: "rgba(255,138,92,0.45)", values: a.map(() => 0.15), dashed: true },
      ],
      variance: [{ label: "Rolling variance", color: RED, values: varr }],
    };
  }, [ew]);

  const ageChart = useMemo(() => downsample(res?.age_scalar_series ?? [], 220), [res]);

  const rollChart = useMemo<{ labels: string[]; series: Series[] }>(() => {
    if (!roll?.rows?.length) return { labels: [], series: [] };
    const rows = downsample(roll.rows, 220);
    return {
      labels: rows.map(label),
      series: roll.columns.map((c) => ({
        label: c, color: REGIME_COLOR(c), values: rows.map((r) => val(r, c)),
      })),
    };
  }, [roll]);

  /* Static vs rolling P(Bull) on the shared dates. */
  const compare = useMemo<{ labels: string[]; series: Series[] }>(() => {
    if (!roll?.rows?.length || !res?.forward_proba?.length) return { labels: [], series: [] };
    const bullCol = regimeCols.find((c) => /bull/i.test(c));
    const rollBull = roll.columns.find((c) => /bull/i.test(c));
    if (!bullCol || !rollBull) return { labels: [], series: [] };
    const rollMap = new Map(roll.rows.map((r) => [label(r), val(r, rollBull)]));
    const shared = res.forward_proba.filter((r) => rollMap.has(label(r)));
    const rows = downsample(shared, 220);
    return {
      labels: rows.map(label),
      series: [
        { label: "Static HMM P(Bull)", color: GREEN, values: rows.map((r) => val(r, bullCol)) },
        { label: "Rolling HMM P(Bull)", color: ACCENT, values: rows.map((r) => rollMap.get(label(r)) ?? null), dashed: true },
      ],
    };
  }, [roll, res, regimeCols]);

  const scatterPts = useMemo(
    () => (res?.return_vol_scatter ?? []).map((p) => ({
      x: p.vol, y: p.ret, c: 0, color: REGIME_COLOR(p.regime),
    })),
    [res]
  );

  const activeWeights = strat ? Object.entries(strat.weights).sort((a, b) => b[1] - a[1]) : [];
  const barColor = REGIME_COLOR(current);

  return (
    <>
      <ModuleHeader
        n="10" title="Regime Detection" accent={ACCENT}
        subtitle="A Hidden Markov Model classifies the market into bull, bear and choppy states — with forward-only probabilities, an early-warning signal, and a strategy router, because a strategy's edge is regime-dependent."
        right={current && (
          <span className="rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest"
            style={{ color: barColor, borderColor: `${barColor}55`, background: `${barColor}12` }}>
            ● {current}
          </span>
        )}
      />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <TickerBar ticker={ticker} onTicker={setTicker} start={start} onStart={setStart}
          loading={loading} onRefresh={() => setTick((n) => n + 1)} accent={ACCENT} />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Hidden states</span>
          {[2, 3].map((n) => (
            <button key={n} onClick={() => setNStates(n)}
              className="hv rounded-[10px] border px-3.5 py-1.5 font-mono text-[12px]"
              style={n === nStates
                ? { borderColor: ACCENT, background: `${ACCENT}1f`, color: ACCENT }
                : { borderColor: "rgba(255,255,255,0.12)", color: "#adc6dd" }}>
              {n} states
            </button>
          ))}
          {res && res.n_states_used !== nStates && (
            <span className="font-mono text-[10.5px] text-hazedim">
              (fell back to {res.n_states_used} — the HMM couldn&apos;t fit {nStates})
            </span>
          )}
        </div>

        {error && <div className="mt-6"><ApiDown message={error} /></div>}

        {tick === 0 ? (
          <IdleState onRun={() => setTick((n) => n + 1)} accent={ACCENT}
            label="Detect regimes"
            note="Pick a ticker and state count, then run. Fitting the HMM takes a moment, so nothing starts on its own." />
        ) : (
        <>

        {/* ── master status bar ── */}
        {res && (
          <motion.div {...revealProps()} className="mt-4 rounded-2xl border p-6"
            style={{ borderColor: `${barColor}66`, background: `${barColor}10`, borderLeftWidth: 6 }}>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div className="text-[24px] font-bold text-white">{current}</div>
              <div className="font-mono text-[12.5px] text-haze">
                Age <b className="text-white">{res.regime_age}d</b> · Position scalar{" "}
                <b className="text-white">{pct(res.age_scalar, 0)}</b>
              </div>
              <span className="rounded-full border px-3 py-1 font-mono text-[11px]"
                style={ew?.active
                  ? { color: RED, borderColor: `${RED}55`, background: `${RED}12` }
                  : { color: GREEN, borderColor: `${GREEN}55`, background: `${GREEN}12` }}>
                {ew?.active ? "🚨 Early warning active" : "✅ No warning"}
              </span>
            </div>
            <div className="mt-2 text-[13.5px] leading-6 text-haze">{ew?.lead_msg}</div>
            <div className="mt-1.5 text-[13.5px] leading-6 text-haze">{res.recommendation}</div>
          </motion.div>
        )}

        <motion.div {...revealProps(0.04)} className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {loading && !res ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={72} />)
            : res && [
                { l: "Current regime", v: current, c: barColor },
                { l: "Regime age", v: `${res.regime_age}d`, c: "#cfe0f5" },
                { l: "Position scalar", v: pct(res.age_scalar, 0), c: ACCENT },
                { l: "AC1 (early warn.)", v: res.early_warning.latest_ac1.toFixed(3), c: res.early_warning.latest_ac1 > 0.15 ? GOLD : "#cfe0f5", note: res.early_warning.latest_ac1 > 0.15 ? "⚠️ elevated" : "normal" },
                { l: "P(Bull) live", v: pct(res.bull_prob), c: GREEN },
                { l: "P(Bear) live", v: pct(res.bear_prob), c: RED },
              ].map((k) => <Sub key={k.l} {...k} />)}
        </motion.div>

        {/* ── 🗺️ Regime Map ── */}
        <motion.div {...revealProps(0.06)} className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Panel title="🗺️ Price history" sub="Close price over the classified window">
            {loading && !price.length ? <Skeleton h={250} /> : (
              <LineChart height={250} fillFirst labels={price.map(label)}
                yFormat={(v) => v.toFixed(0)}
                series={[{ label: "Close", color: ACCENT, values: price.map((p) => Number(p.Close)) }]} />
            )}
          </Panel>

          <Panel title="Time spent in each regime" sub="How the model split the history">
            {loading && !res ? <Skeleton h={250} /> : (
              <div className="space-y-3.5">
                {Object.entries(counts).map(([name, n]) => {
                  const c = REGIME_COLOR(name);
                  const share = (n / total) * 100;
                  return (
                    <div key={name}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[13px] font-semibold text-white">{name}</span>
                        <span className="font-mono text-[12px] font-bold" style={{ color: c }}>
                          {share.toFixed(0)}% · {n}d
                        </span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/8">
                        <motion.div className="h-full rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}66` }}
                          initial={{ width: 0 }} animate={{ width: `${share}%` }} transition={{ duration: 0.9 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </motion.div>

        {/* ── 📊 Forward Probabilities ── */}
        <motion.div {...revealProps(0.08)} className="mt-4">
          <Panel title="📊 Forward-Pass Regime Probabilities (No Lookahead)"
            sub="Viterbi labels use future data to smooth the past. These are P(regime | data up to that day) — the only version valid for live trading.">
            {loading && !res ? <Skeleton h={240} /> : fwd.series.length ? (
              <>
                <LineChart height={240} labels={fwd.labels}
                  yFormat={(v) => `${(v * 100).toFixed(0)}%`} series={fwd.series} />
                <Legend items={regimeCols.map((c) => ({ color: REGIME_COLOR(c), label: c }))} />

                {(res?.high_confidence.length ?? 0) > 0 && (
                  <div className="mt-5">
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      High-confidence regime periods (probability &gt; 75%, flips only)
                    </div>
                    <div className="max-h-[240px] overflow-auto rounded-lg border border-white/8">
                      <table className="w-full min-w-[380px] border-collapse text-left">
                        <thead className="sticky top-0 bg-ink/90"><tr>
                          {["Date", "Regime", "Confidence"].map((h) => (
                            <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {res!.high_confidence.map((r, i) => (
                            <tr key={i} className="hover:bg-white/[0.03]">
                              <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-hazedim">{r.date}</td>
                              <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]" style={{ color: REGIME_COLOR(r.regime) }}>{r.regime}</td>
                              <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-white">{pct(r.confidence)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : <p className="py-8 text-center text-[13px] text-hazedim">Forward probabilities unavailable.</p>}
          </Panel>
        </motion.div>

        {/* ── ⚠️ Early Warning ── */}
        <motion.div {...revealProps(0.1)} className="mt-4">
          <Panel title="⚠️ Critical Slowing Down — Early Warning Signal"
            sub="Before a system flips state it recovers more slowly from shocks. Rising autocorrelation AND rising variance together fire the warning, typically 10–20 days ahead.">
            {loading && !ew ? <Skeleton h={280} /> : ew ? (
              <>
                <div className="rounded-xl border px-5 py-3.5"
                  style={ew.active
                    ? { borderColor: "#dc323255", background: "rgba(220,50,50,0.1)" }
                    : ew.latest_ac1 > 0.15
                      ? { borderColor: "#e67e0055", background: "rgba(230,126,0,0.08)" }
                      : { borderColor: "#1f8f4e55", background: "rgba(31,143,78,0.1)" }}>
                  <div className="font-mono text-[12.5px] font-bold"
                    style={{ color: ew.active ? "#dc3232" : ew.latest_ac1 > 0.15 ? "#e67e00" : "#1f8f4e" }}>
                    {ew.lead_msg}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Sub l="AC1 (lag-1 autocorr.)" v={ew.latest_ac1.toFixed(4)}
                    c={ew.latest_ac1 > 0.15 ? GOLD : "#cfe0f5"}
                    note={ew.latest_ac1 > 0.15 ? "⚠️ above 0.15 threshold" : "normal"} />
                  <Sub l="Rolling variance" v={ew.latest_var.toFixed(6)} />
                  <Sub l="Warning active" v={ew.active ? "YES 🚨" : "No ✅"} c={ew.active ? RED : GREEN} />
                </div>

                <div className="mt-5">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    AC1 vs the 0.15 warning threshold
                  </div>
                  <LineChart height={190} zeroLine labels={ewChart.labels}
                    yFormat={(v) => v.toFixed(2)} series={ewChart.ac1} />
                </div>
                <div className="mt-4">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">Rolling variance</div>
                  <LineChart height={160} labels={ewChart.labels}
                    yFormat={(v) => v.toExponential(1)} series={ewChart.variance} />
                </div>
                <p className="mt-3 text-[12px] text-hazedim">
                  False positive rate is roughly 25% on its own — combine with forward P(Bear) &gt; 60% before acting.
                </p>
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── 🤖 Strategy Router ── */}
        <motion.div {...revealProps(0.12)} className="mt-4">
          <Panel title="🤖 Regime-Adaptive Strategy Router"
            sub="Factor weights and strategy change completely per regime: momentum in a bull, low-vol and IV skew in a bear, mean-reversion when it's choppy.">
            {loading && !strat ? <Skeleton h={280} /> : strat ? (
              <>
                <div className="rounded-xl border px-5 py-4"
                  style={{ borderColor: `${barColor}55`, background: `${barColor}10` }}>
                  <div className="text-[17px] font-semibold" style={{ color: barColor }}>{strat.regime}</div>
                  <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                    {[
                      ["Primary strategy", strat.recommendations.primary, "#fff"],
                      ["Secondary", strat.recommendations.secondary, "#cfe0f5"],
                      ["Avoid", strat.recommendations.avoid, "#ff6b6b"],
                      ["Position size", strat.recommendations.position, "#fff"],
                      ["Stop style", strat.recommendations.stops, "#cfe0f5"],
                    ].map(([k, v, c]) => (
                      <div key={k} className="flex gap-3 border-b border-white/[0.06] py-1.5">
                        <span className="w-[110px] shrink-0 font-mono text-[10.5px] uppercase tracking-wider text-hazedim">{k}</span>
                        <span className="text-[12.5px]" style={{ color: c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      Active factor weights now ({strat.regime})
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-white/8">
                      <table className="w-full border-collapse text-left">
                        <thead className="bg-ink/70"><tr>
                          {["Factor", "Weight", "Action"].map((h) => (
                            <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {activeWeights.map(([f, w]) => (
                            <tr key={f} className="hover:bg-white/[0.03]">
                              <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-white">{f}</td>
                              <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                                style={{ color: w >= 0.6 ? GREEN : w >= 0.3 ? GOLD : RED }}>{w.toFixed(2)}</td>
                              <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                                style={{ color: w >= 0.6 ? GREEN : w >= 0.3 ? GOLD : RED }}>
                                {w >= 0.6 ? "✅ Use" : w >= 0.3 ? "⚠️ Reduce" : "❌ Avoid"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      Factor weights by regime — how the router reallocates
                    </div>
                    <div className="space-y-4">
                      {Object.entries(res?.factor_weights_by_regime ?? {}).map(([rname, w]) => (
                        <div key={rname}>
                          <div className="mb-1.5 font-mono text-[11px]" style={{ color: REGIME_COLOR(rname) }}>{rname}</div>
                          <WeightBars tickers={Object.keys(w)} weights={Object.values(w)} color={REGIME_COLOR(rname)} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Regime age position scalar over time
                  </div>
                  <LineChart height={180} fillFirst labels={ageChart.map(label)}
                    yFormat={(v) => `${(v * 100).toFixed(0)}%`}
                    series={[{ label: "Position scalar", color: ACCENT, values: ageChart.map((r) => val(r)) }]} />
                  <p className="mt-2 text-[12px] text-hazedim">
                    Bull ramps 50% → 100% over 30 days; bear drops to 10% immediately (40% only after 180 days); sideways sits at 50%.
                  </p>
                </div>
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── 🔄 Rolling HMM ── */}
        <motion.div {...revealProps(0.14)} className="mt-4">
          <Panel title="🔄 Rolling HMM — Non-Stationary Adaptive Model"
            sub="A single static HMM assumes transition probabilities never change. This refits every 21 days on a 252-day window, always predicting out-of-sample.">
            <button onClick={() => setShowRolling((v) => !v)}
              className="hv flex items-center gap-2.5 rounded-[10px] border px-3.5 py-2"
              style={showRolling
                ? { borderColor: `${ACCENT}80`, background: `${ACCENT}14` }
                : { borderColor: "rgba(255,255,255,0.12)" }}>
              <span className="relative inline-block h-4 w-7 rounded-full transition-colors"
                style={{ background: showRolling ? ACCENT : "rgba(255,255,255,0.18)" }}>
                <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all"
                  style={{ left: showRolling ? 14 : 2 }} />
              </span>
              <span className="font-mono text-[11.5px]" style={{ color: showRolling ? ACCENT : "#adc6dd" }}>
                Run rolling HMM (slower — refits at every step)
              </span>
            </button>

            {!showRolling ? (
              <p className="mt-4 text-[13px] text-hazedim">
                Enable the toggle to refit the HMM across the history. It takes noticeably longer than the rest of the page.
              </p>
            ) : rLoading && !roll ? <div className="mt-4"><Skeleton h={240} /></div>
            : rErr ? <p className="mt-4 py-4 text-center text-[13.5px] text-hazedim">Rolling HMM unavailable: {rErr}</p>
            : roll?.note ? <p className="mt-4 py-4 text-center text-[13.5px] text-hazedim">{roll.note}</p>
            : roll ? (
              <>
                <div className="mt-4">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Rolling HMM regime probability (252d window, 21d step)
                  </div>
                  <LineChart height={220} labels={rollChart.labels}
                    yFormat={(v) => `${(v * 100).toFixed(0)}%`} series={rollChart.series} />
                  <Legend items={roll.columns.map((c) => ({ color: REGIME_COLOR(c), label: c }))} />
                </div>
                {compare.series.length > 0 && (
                  <div className="mt-5">
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      Static vs rolling HMM — bull probability
                    </div>
                    <LineChart height={190} labels={compare.labels}
                      yFormat={(v) => `${(v * 100).toFixed(0)}%`} series={compare.series} />
                    <Legend items={[
                      { color: GREEN, label: "Static HMM P(Bull)" },
                      { color: ACCENT, label: "Rolling HMM P(Bull)" },
                    ]} />
                  </div>
                )}
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── 📈 Statistics ── */}
        {res && res.conditional_sharpe?.length > 0 && (
          <motion.div {...revealProps(0.16)} className="mt-4">
            <Panel title="📈 Regime-Conditional Statistics" sub="How returns behave inside each state">
              <div className="overflow-x-auto rounded-lg border border-white/8">
                <table className="w-full min-w-[480px] border-collapse text-left">
                  <thead className="bg-ink/70"><tr>
                    {Object.keys(res.conditional_sharpe[0]).map((c) => (
                      <th key={c} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{c}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {res.conditional_sharpe.map((r, i) => (
                      <tr key={i} className="hover:bg-white/[0.03]">
                        {Object.entries(r).map(([k, v]) => (
                          <td key={k} className="border-b border-white/[0.05] px-3 py-2 font-mono text-[12px]"
                            style={{ color: typeof v === "number" ? (v >= 0 ? "#4ade80" : "#f87171") : "#cfe0f5" }}>
                            {typeof v === "number" ? v.toFixed(3) : String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Transition matrix — P(next | current)
                  </div>
                  <Heatmap matrix={res.transition_matrix} />
                  <p className="mt-2 text-[12px] text-hazedim">
                    Rows are today&apos;s regime, columns tomorrow&apos;s. A high diagonal means regimes persist; a high off-diagonal means the model flips constantly.
                  </p>
                </div>

                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Regime duration distribution (days per episode)
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-white/8">
                    <table className="w-full border-collapse text-left">
                      <thead className="bg-ink/70"><tr>
                        {["Regime", "Mean", "Median", "Min", "Max", "Episodes"].map((h) => (
                          <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {res.duration_stats.map((d) => (
                          <tr key={d.regime} className="hover:bg-white/[0.03]">
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]" style={{ color: REGIME_COLOR(d.regime) }}>{d.regime}</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-white">{d.mean_days}</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-haze">{d.median_days}</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-haze">{d.min_days}</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-haze">{d.max_days}</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-hazedim">{d.episodes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {scatterPts.length > 0 && (
                <div className="mt-6">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Return vs volatility, coloured by regime
                  </div>
                  <Scatter points={scatterPts} height={300}
                    xLabel="Annualised volatility" yLabel="Daily return" />
                  <Legend items={Object.keys(counts).map((c) => ({ color: REGIME_COLOR(c), label: c }))} />
                </div>
              )}
            </Panel>
          </motion.div>
        )}

        </>
        )}

        <p className="mt-6 text-center font-mono text-[11px] text-hazedim/70">
          Gaussian HMM classification by core.regime_detector. Regimes are inferred, not observed — and only the forward probabilities are lookahead-free.
        </p>
      </section>
    </>
  );
}
