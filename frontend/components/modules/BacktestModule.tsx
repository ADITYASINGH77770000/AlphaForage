"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  api, ApiError, downsample,
  type BacktestFullResponse, type CostProfile,
} from "@/lib/api";
import { revealProps } from "../motion";
import { ApiDown, ModuleHeader, Panel, Skeleton, StatRow, IdleState } from "./Shell";
import { Histogram, Legend, LineChart, type Series } from "./charts";
import { TickerBar, yearsAgo } from "./TickerBar";

/* ──────────────────────────────────────────────────────────────────────────
   BACKTEST MODULE — full parity with the Streamlit Backtest page:
     💸 Market Cost Model      📊 Backtest Results       🔬 Walk-Forward
     🎲 Monte Carlo            🗺️ Strategy × Regime      Trade Log
   ────────────────────────────────────────────────────────────────────────── */

const ACCENT = "#a55efd";
const STRATEGIES = ["Momentum", "Mean Reversion", "RSI", "MACD Crossover", "Dual MA"];

function Toggle({ on, onChange, label, help }: {
  on: boolean; onChange: (v: boolean) => void; label: string; help: string;
}) {
  return (
    <button onClick={() => onChange(!on)} title={help}
      className="hv flex items-center gap-2.5 rounded-[10px] border px-3.5 py-2 text-left"
      style={on
        ? { borderColor: `${ACCENT}80`, background: `${ACCENT}14` }
        : { borderColor: "rgba(255,255,255,0.12)" }}>
      <span className="relative inline-block h-4 w-7 rounded-full transition-colors"
        style={{ background: on ? ACCENT : "rgba(255,255,255,0.18)" }}>
        <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all"
          style={{ left: on ? 14 : 2 }} />
      </span>
      <span className="font-mono text-[11.5px]" style={{ color: on ? ACCENT : "#adc6dd" }}>{label}</span>
    </button>
  );
}

export function BacktestModule() {
  const [ticker, setTicker] = useState("GOOG");
  const [start, setStart] = useState(yearsAgo(8));
  const [strategy, setStrategy] = useState("Momentum");
  const [fast, setFast] = useState(20);
  const [slow, setSlow] = useState(50);
  const [capital, setCapital] = useState(100000);
  const [profiles, setProfiles] = useState<CostProfile[]>([]);
  const [profile, setProfile] = useState("India – Delivery");
  const [doWf, setDoWf] = useState(true);
  const [doMc, setDoMc] = useState(true);
  const [doMat, setDoMat] = useState(false);
  const [trainMo, setTrainMo] = useState(36);
  const [testMo, setTestMo] = useState(6);
  const [nSims, setNSims] = useState(400);
  const [res, setRes] = useState<BacktestFullResponse | null>(null);
  const [wf, setWf] = useState<BacktestFullResponse["walk_forward"] | null>(null);
  const [mc, setMc] = useState<BacktestFullResponse["monte_carlo"] | null>(null);
  const [matrixRows, setMatrixRows] = useState<Record<string, unknown>[] | null>(null);
  const [wfLoading, setWfLoading] = useState(false);
  const [mcLoading, setMcLoading] = useState(false);
  const [matLoading, setMatLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api.costProfiles()
      .then((p) => {
        setProfiles(p.profiles);
        if (p.profiles.length && !p.profiles.some((x) => x.name === profile)) setProfile(p.profiles[0].name);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null);
    setWf(null); setMc(null); setMatrixRows(null);

    const body = {
      ticker, strategy, start, fast_window: fast, slow_window: slow, capital,
      cost_profile: profile, train_months: trainMo, test_months: testMo, n_simulations: nSims,
    };
    const ignore = (e: unknown) => (e as Error)?.name === "AbortError";

    try {
      // Base result first so the page fills immediately…
      setRes(await api.backtestFull(body, ac.signal));
      setLoading(false);
    } catch (e) {
      if (ignore(e)) return;
      setError(e instanceof ApiError ? e.message : String(e));
      setLoading(false);
      return;
    }

    // …then the slower panels in parallel, each populating as it lands.
    if (doWf) {
      setWfLoading(true);
      api.backtestWalkForward(body, ac.signal)
        .then(setWf)
        .catch((e) => { if (!ignore(e)) setWf({ error: e instanceof ApiError ? e.message : String(e) }); })
        .finally(() => setWfLoading(false));
    }
    if (doMc) {
      setMcLoading(true);
      api.backtestMonteCarlo(body, ac.signal)
        .then(setMc)
        .catch((e) => { if (!ignore(e)) setMc({ error: e instanceof ApiError ? e.message : String(e) }); })
        .finally(() => setMcLoading(false));
    }
    if (doMat) {
      setMatLoading(true);
      api.backtestRegimeMatrix(body, ac.signal)
        .then((r) => setMatrixRows(r.rows))
        .catch(() => { if (!ac.signal.aborted) setMatrixRows([]); })
        .finally(() => setMatLoading(false));
    }
  }, [ticker, strategy, start, fast, slow, capital, profile, trainMo, testMo, nSims, doWf, doMc, doMat]);

  // A single effect owns fetching. Two effects both calling run() meant every
  // mount fired several concurrent (expensive) backtests that aborted each
  // other. `runId` is bumped by the Run button and by slider commits.
  // Nothing is fetched until the user presses Run — opening the page is free.
  useEffect(() => {
    if (runId === 0) return;
    run();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const strat = useMemo(() => downsample(res?.strategy_cumulative ?? [], 200), [res]);
  const bh = useMemo(() => downsample(res?.buy_hold_cumulative ?? [], 200), [res]);
  const roll = useMemo(() => downsample(res?.rolling_sharpe ?? [], 200), [res]);
  const trades = useMemo(() => (res?.trade_log ?? []).slice(-14).reverse(), [res]);
  const activeProfile = profiles.find((p) => p.name === profile);
  const m = (k: string) => res?.metrics?.[k] ?? "—";
  const sgn = (k: string) => (parseFloat(String(res?.metrics?.[k] ?? "0")) < 0 ? "neg" : "pos") as "neg" | "pos";

  const matrix = matrixRows ?? [];

  // Monte-Carlo fan
  const fan = mc?.fan;
  const fanSeries: Series[] = fan ? (() => {
    const p50 = downsample(fan.pct_50 ?? [], 180);
    const pick = (k: keyof typeof fan) => downsample(fan[k] ?? [], 180).map((r) => Number(r.v));
    return [
      { label: "Best 5%", color: "#00f5a0", values: pick("pct_95"), dashed: true },
      { label: "75th", color: "#0be0ff", values: pick("pct_75") },
      { label: "Median", color: ACCENT, values: p50.map((r) => Number(r.v)) },
      { label: "25th", color: "#0be0ff", values: pick("pct_25") },
      { label: "Worst 5%", color: "#ff5470", values: pick("pct_5"), dashed: true },
    ];
  })() : [];

  return (
    <>
      <ModuleHeader
        n="03" title="Strategy Backtester" accent={ACCENT}
        subtitle="Lookahead-free simulation with real costs, plus the two checks that matter: walk-forward overfit detection and Monte Carlo luck-vs-skill."
      />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <TickerBar ticker={ticker} onTicker={setTicker} start={start} onStart={setStart}
          loading={loading} onRefresh={() => setRunId((n) => n + 1)} accent={ACCENT} />

        {/* ── 💸 Market Cost Model ── */}
        <motion.div {...revealProps()} className="mt-4">
          <Panel title="💸 Market Cost Model" sub="Indian markets realistically cost 0.4–0.6% round-trip after STT, stamp duty, SEBI charges and GST">
            <div className="flex flex-wrap items-center gap-2">
              {profiles.map((p) => (
                <button key={p.name} onClick={() => setProfile(p.name)}
                  className="hv rounded-[10px] border px-3.5 py-1.5 font-mono text-[12px]"
                  style={p.name === profile
                    ? { borderColor: ACCENT, background: `${ACCENT}1f`, color: ACCENT }
                    : { borderColor: "rgba(255,255,255,0.12)", color: "#adc6dd" }}>
                  {p.name}
                </button>
              ))}
            </div>
            {activeProfile && (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    { l: "Round-trip cost", v: `${(activeProfile.round_trip * 100).toFixed(3)}%` },
                    { l: "vs old model (0.21%)", v: `${(activeProfile.round_trip / 0.0021).toFixed(1)}×` },
                    { l: "Slippage", v: `${activeProfile.slippage_bps.toFixed(0)} bps` },
                  ].map((k) => (
                    <div key={k.l} className="rounded-xl border border-white/10 bg-ink/50 px-3.5 py-3">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-hazedim">{k.l}</div>
                      <div className="mt-1 text-[17px] font-semibold" style={{ color: ACCENT }}>{k.v}</div>
                    </div>
                  ))}
                </div>
                <details className="mt-3 rounded-lg border border-white/10 bg-ink/40 px-4 py-2.5">
                  <summary className="cursor-pointer font-mono text-[11.5px] text-hazedim">Full cost breakdown</summary>
                  <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    {Object.entries(activeProfile.breakdown).map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-white/[0.06] py-1 font-mono text-[11.5px]">
                        <span className="text-hazedim">{k}</span><span className="text-white">{v}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
          </Panel>
        </motion.div>

        {/* ── strategy + params + toggles ── */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-panel/45 p-5 backdrop-blur">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Strategy</div>
          <div className="flex flex-wrap gap-2">
            {STRATEGIES.map((s) => (
              <button key={s} onClick={() => setStrategy(s)}
                className="hv rounded-[10px] border px-3.5 py-1.5 font-mono text-[12px]"
                style={s === strategy
                  ? { borderColor: ACCENT, background: `${ACCENT}1f`, color: ACCENT }
                  : { borderColor: "rgba(255,255,255,0.12)", color: "#adc6dd" }}>
                {s}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Fast window — {fast}</div>
              <input type="range" min={5} max={60} value={fast} onChange={(e) => setFast(+e.target.value)}
                onMouseUp={() => setRunId((n) => n + 1)} onTouchEnd={() => setRunId((n) => n + 1)} className="w-full accent-[#a55efd]" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Slow window — {slow}</div>
              <input type="range" min={10} max={200} value={slow} onChange={(e) => setSlow(+e.target.value)}
                onMouseUp={() => setRunId((n) => n + 1)} onTouchEnd={() => setRunId((n) => n + 1)} className="w-full accent-[#a55efd]" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Initial capital</div>
              <input type="number" value={capital} step={10000} min={10000} onChange={(e) => setCapital(+e.target.value)}
                onBlur={() => setRunId((n) => n + 1)}
                className="w-full rounded-[10px] border border-white/12 bg-ink/60 px-3 py-2 font-mono text-[13.5px] text-white outline-none focus:border-white/40" />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-white/10 pt-4">
            <Toggle on={doWf} onChange={setDoWf} label="Walk-forward test" help="Train on rolling windows, test on unseen data" />
            <Toggle on={doMc} onChange={setDoMc} label="Monte Carlo" help="Random entry delays + execution noise — luck vs skill" />
            <Toggle on={doMat} onChange={setDoMat} label="Regime matrix" help="Which strategy wins in each regime (slow)" />
            <button onClick={() => setRunId((n) => n + 1)} disabled={loading}
              className="hv-btn ml-auto rounded-[10px] border px-5 py-2 font-mono text-[12px] uppercase tracking-widest disabled:opacity-60"
              style={{ borderColor: `${ACCENT}80`, background: `${ACCENT}1a`, color: ACCENT }}>
              {loading ? "Running…" : "Run backtest"}
            </button>
          </div>
          {(doWf || doMc) && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {doWf && (
                <>
                  <div>
                    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Train window — {trainMo}mo</div>
                    <input type="range" min={12} max={60} step={3} value={trainMo} onChange={(e) => setTrainMo(+e.target.value)} className="w-full accent-[#a55efd]" />
                  </div>
                  <div>
                    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Test window — {testMo}mo</div>
                    <input type="range" min={3} max={18} step={1} value={testMo} onChange={(e) => setTestMo(+e.target.value)} className="w-full accent-[#a55efd]" />
                  </div>
                </>
              )}
              {doMc && (
                <div>
                  <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">MC simulations — {nSims}</div>
                  <input type="range" min={200} max={1500} step={100} value={nSims} onChange={(e) => setNSims(+e.target.value)} className="w-full accent-[#a55efd]" />
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div className="mt-6"><ApiDown message={error} /></div>}

        {runId === 0 ? (
          <IdleState onRun={() => setRunId((n) => n + 1)} accent={ACCENT}
            label="Run backtest"
            note="Set the strategy, costs and windows above, then run it. Walk-forward and Monte Carlo can take a while, so nothing starts on its own." />
        ) : (
        <>

        {/* ── 📊 Backtest Results ── */}
        <motion.div {...revealProps()} className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {loading && !res ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={72} />)
            : res && [
                { l: "CAGR", v: m("CAGR"), t: sgn("CAGR") },
                { l: "Sharpe", v: m("Sharpe"), t: sgn("Sharpe") },
                { l: "Sortino", v: m("Sortino"), t: sgn("Sortino") },
                { l: "Max DD", v: m("Max Drawdown"), t: "neg" as const },
                { l: "Win rate", v: m("Win Rate"), t: "pos" as const },
                { l: "Trades", v: String(res.trade_log?.length ?? 0), t: "pos" as const },
              ].map((k) => (
                <div key={k.l} className="hv rounded-xl border border-white/10 bg-panel/45 px-3.5 py-3 backdrop-blur">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-hazedim">{k.l}</div>
                  <div className="mt-1 text-[17px] font-semibold" style={{ color: k.t === "neg" ? "#ff5470" : "#00f5a0" }}>{k.v}</div>
                </div>
              ))}
        </motion.div>

        <motion.div {...revealProps(0.05)} className="mt-4">
          <Panel title="📊 Strategy vs Buy & Hold" sub="Cumulative growth, net of modelled costs">
            {loading && !strat.length ? <Skeleton h={250} /> : (
              <>
                <LineChart height={250} labels={strat.map((r) => r.index)} yFormat={(v) => v.toFixed(2)}
                  series={[
                    { label: "Strategy", color: ACCENT, values: strat.map((r) => Number(r.cumulative)) },
                    { label: "Buy & Hold", color: "#8aa6c8", values: bh.map((r) => Number(r.cumulative)), dashed: true },
                  ]} />
                <Legend items={[{ color: ACCENT, label: "Strategy" }, { color: "#8aa6c8", label: "Buy & Hold" }]} />
              </>
            )}
          </Panel>
        </motion.div>

        {/* ── 🔬 Walk-Forward ── */}
        {doWf && (
          <motion.div {...revealProps(0.1)} className="mt-4">
            <Panel title="🔬 Walk-Forward Test — Overfit Detection"
              sub="Every test fold uses data the strategy was never trained on. Efficiency Ratio (OOS ÷ IS Sharpe) below 0.5 = overfit warning.">
              {wfLoading && !wf ? <Skeleton h={280} /> : wf?.error ? (
                <p className="py-6 text-center text-[13.5px] text-hazedim">Walk-forward unavailable: {wf.error}</p>
              ) : wf ? (
                <>
                  <div className="rounded-xl border px-5 py-4"
                    style={wf.overfit_warning
                      ? { borderColor: "#dc323255", background: "rgba(220,50,50,0.1)" }
                      : { borderColor: "#1f8f4e55", background: "rgba(31,143,78,0.1)" }}>
                    <div className="font-mono text-[12px] font-bold" style={{ color: wf.overfit_warning ? "#dc3232" : "#1f8f4e" }}>
                      {wf.overfit_warning
                        ? `⚠️ OVERFIT WARNING — Efficiency Ratio ${wf.efficiency_ratio?.toFixed(2)}`
                        : `✅ Passes walk-forward — Efficiency Ratio ${wf.efficiency_ratio?.toFixed(2)}`}
                    </div>
                    <div className="mt-1 text-[13px] text-haze">
                      {wf.overfit_warning
                        ? "Looks great in-sample but fails on unseen data. Do NOT deploy this live."
                        : "Out-of-sample performance is consistent with in-sample."}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    {[
                      { l: "OOS CAGR", v: wf.oos_metrics?.["CAGR"] ?? "—" },
                      { l: "OOS Sharpe", v: wf.oos_metrics?.["Sharpe"] ?? "—" },
                      { l: "OOS Max DD", v: wf.oos_metrics?.["Max Drawdown"] ?? "—" },
                      { l: "Folds", v: String(wf.n_folds ?? "—") },
                    ].map((k) => (
                      <div key={k.l} className="rounded-xl border border-white/10 bg-ink/50 px-3.5 py-3">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-hazedim">{k.l}</div>
                        <div className="mt-1 text-[16px] font-semibold text-white">{k.v}</div>
                      </div>
                    ))}
                  </div>

                  {(wf.fold_metrics?.length ?? 0) > 0 && (
                    <div className="mt-4 max-h-[300px] overflow-auto rounded-lg border border-white/8">
                      <table className="w-full min-w-[620px] border-collapse text-left">
                        <thead className="sticky top-0 bg-ink/90"><tr>
                          {Object.keys(wf.fold_metrics![0]).map((h) => (
                            <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {wf.fold_metrics!.map((f, i) => (
                            <tr key={i} className="hover:bg-white/[0.03]">
                              {Object.entries(f).map(([k, v]) => {
                                const st = String(v);
                                const col = k === "Status"
                                  ? (st === "Strong" ? "#4ade80" : st === "Acceptable" ? "#ffd700" : st === "Weak" ? "#ff8a5c" : "#f87171")
                                  : "#cfe0f5";
                                return (
                                  <td key={k} className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]" style={{ color: col }}>
                                    {st}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}
            </Panel>
          </motion.div>
        )}

        {/* ── 🎲 Monte Carlo ── */}
        {doMc && (
          <motion.div {...revealProps(0.12)} className="mt-4">
            <Panel title="🎲 Monte Carlo Simulation — Luck vs Skill"
              sub="Simulations with random entry delays and execution noise. Tight fan = robust. Wide fan = lucky.">
              {mcLoading && !mc ? <Skeleton h={300} /> : mc?.error ? (
                <p className="py-6 text-center text-[13.5px] text-hazedim">Monte Carlo unavailable: {mc.error}</p>
              ) : mc ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { l: "Probability of profit", v: `${((mc.prob_profit ?? 0) * 100).toFixed(1)}%`, c: (mc.prob_profit ?? 0) >= 0.55 ? "#00f5a0" : "#ff5470" },
                      { l: "Beats buy & hold", v: `${((mc.prob_beat_bh ?? 0) * 100).toFixed(1)}%`, c: (mc.prob_beat_bh ?? 0) >= 0.5 ? "#00f5a0" : "#ff5470" },
                      { l: "Risk of ruin (>50% DD)", v: `${((mc.risk_of_ruin ?? 0) * 100).toFixed(1)}%`, c: (mc.risk_of_ruin ?? 0) > 0.3 ? "#ff5470" : "#00f5a0" },
                      { l: "Sharpe 90% CI", v: `${(mc.sharpe_ci_low ?? 0).toFixed(2)} – ${(mc.sharpe_ci_high ?? 0).toFixed(2)}`, c: "#0be0ff" },
                    ].map((k) => (
                      <div key={k.l} className="rounded-xl border border-white/10 bg-ink/50 px-3.5 py-3">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-hazedim">{k.l}</div>
                        <div className="mt-1 text-[16px] font-semibold" style={{ color: k.c }}>{k.v}</div>
                      </div>
                    ))}
                  </div>

                  {fanSeries.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                        Fan chart · {mc.n_simulations} simulations
                      </div>
                      <LineChart height={260} yFormat={(v) => `${(v / 1000).toFixed(0)}k`}
                        labels={downsample(fan?.pct_50 ?? [], 180).map((r) => r.index)} series={fanSeries} />
                      <Legend items={[
                        { color: "#00f5a0", label: "Best 5%" }, { color: "#0be0ff", label: "25–75th" },
                        { color: ACCENT, label: "Median" }, { color: "#ff5470", label: "Worst 5%" },
                      ]} />
                    </div>
                  )}

                  {(mc.final_values?.length ?? 0) > 0 && (
                    <div className="mt-4">
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                        Distribution of final portfolio values
                      </div>
                      <Histogram
                        values={mc.final_values!}
                        color={ACCENT}
                        height={180}
                        bins={40}
                        marker={capital}
                        xFormat={(v) => `$${(v / 1000).toFixed(1)}k`}
                      />
                    </div>
                  )}
                </>
              ) : null}
            </Panel>
          </motion.div>
        )}

        {/* ── 🗺️ Strategy × Regime matrix ── */}
        {doMat && (
          <motion.div {...revealProps(0.14)} className="mt-4">
            <Panel title="🗺️ Strategy × Regime Performance Matrix"
              sub="Which strategy performs best in each market condition">
              {matLoading && !matrixRows ? <Skeleton h={220} /> : matrix.length === 0 ? (
                <p className="py-6 text-center text-[13.5px] text-hazedim">Not enough regime data. Try a longer date range.</p>
              ) : (
                <div className="max-h-[340px] overflow-auto rounded-lg border border-white/8">
                  <table className="w-full min-w-[520px] border-collapse text-left">
                    <thead className="sticky top-0 bg-ink/90"><tr>
                      {Object.keys(matrix[0]).map((h) => (
                        <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {matrix.map((r, i) => (
                        <tr key={i} className="hover:bg-white/[0.03]">
                          {Object.entries(r).map(([k, v]) => {
                            const isSharpe = k.toLowerCase() === "sharpe";
                            const n = Number(v);
                            const col = isSharpe && Number.isFinite(n)
                              ? (n > 0.5 ? "#4ade80" : n > 0 ? "#ffd700" : "#f87171") : "#cfe0f5";
                            return (
                              <td key={k} className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]" style={{ color: col }}>
                                {String(v)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </motion.div>
        )}

        {/* ── rolling Sharpe + full metrics ── */}
        <motion.div {...revealProps(0.16)} className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="Rolling Sharpe (63d)" sub="Is the edge stable through time?">
            {loading && !roll.length ? <Skeleton h={210} /> : (
              <LineChart height={210} zeroLine labels={roll.map((r) => r.index)} yFormat={(v) => v.toFixed(1)}
                series={[{ label: "Rolling Sharpe", color: "#ffd700", values: roll.map((r) => Number(r.sharpe)) }]} />
            )}
          </Panel>
          <Panel title="Full metric set" sub="Straight from core.metrics">
            {loading && !res ? <Skeleton h={210} /> : res && (
              <div>
                <StatRow label="Ann. Return" desc="Arithmetic annual return" value={m("Ann. Return")} tone={sgn("Ann. Return")} />
                <StatRow label="Ann. Volatility" desc="Annualised standard deviation" value={m("Ann. Volatility")} tone="neutral" />
                <StatRow label="Calmar" desc="CAGR ÷ max drawdown" value={m("Calmar")} tone={sgn("Calmar")} />
                <StatRow label="VaR 95%" desc="One-day 95% value at risk" value={m("VaR 95% (Hist)")} tone="neg" />
                <StatRow label="VaR 95% (GARCH)" desc="Volatility-clustered estimate" value={m("VaR 95% (GARCH)")} tone="neg" />
                <StatRow label="CVaR 95%" desc="Expected shortfall" value={m("CVaR 95% (Hist)")} tone="neg" />
              </div>
            )}
          </Panel>
        </motion.div>

        {/* ── Trade log ── */}
        <motion.div {...revealProps(0.18)} className="mt-4">
          <Panel title="Trade Log" sub="Most recent completed trades">
            {loading && !trades.length ? <Skeleton h={200} /> : trades.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-hazedim">No completed trades in this window.</p>
            ) : (
              <div className="max-h-[300px] overflow-auto rounded-lg border border-white/8">
                <table className="w-full min-w-[520px] border-collapse text-left">
                  <thead className="sticky top-0 bg-ink/90"><tr>
                    {Object.keys(trades[0]).slice(0, 7).map((h) => (
                      <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {trades.map((t, i) => {
                      const pnl = Number(t["PnL"] ?? t["pnl"] ?? 0);
                      return (
                        <tr key={i} className="hover:bg-white/[0.03]">
                          {Object.keys(trades[0]).slice(0, 7).map((h) => (
                            <td key={h} className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                              style={{ color: h.toLowerCase().includes("pnl") ? (pnl >= 0 ? "#4ade80" : "#f87171") : "#cfe0f5" }}>
                              {String(t[h] ?? "—").slice(0, 22)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </motion.div>

        </>
        )}

        <p className="mt-6 text-center font-mono text-[11px] text-hazedim/70">
          Positions act on the next bar — no lookahead. Walk-forward, Monte Carlo and cost models all from core.backtest_engine.
        </p>
      </section>
    </>
  );
}
