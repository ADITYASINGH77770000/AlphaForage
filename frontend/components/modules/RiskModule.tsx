"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  api, ApiError, downsample,
  type Point, type RiskResponse, type RiskGarchResponse,
  type RiskKupiecResponse, type RiskMethodsResponse, type RiskPortfolioResponse,
} from "@/lib/api";
import { revealProps } from "../motion";
import { ApiDown, ModuleHeader, Panel, Skeleton, StatRow, IdleState } from "./Shell";
import { Heatmap, Histogram, Legend, LineChart, WeightBars, type Series } from "./charts";
import { TickerBar, yearsAgo } from "./TickerBar";

/* ──────────────────────────────────────────────────────────────────────────
   RISK MODULE — full parity with the Streamlit Risk page's five tabs:
     📊 VaR Comparison   🌊 GARCH Rolling Risk   🏦 Portfolio Risk
     💥 Stress Tests     🔬 Kupiec Backtest
   Each panel has its own endpoint and its own loading flag, so a slow GARCH
   fit or multi-ticker load never blocks the rest of the page.
   ────────────────────────────────────────────────────────────────────────── */

const ACCENT = "#a55efd";
const RED = "#ff5470";
const GREEN = "#00f5a0";
const CYAN = "#0be0ff";
const GOLD = "#ffd700";

const pct = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`;
const num = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(d);

/** series_to_records keys the date as "index" or the frame's index name. */
const label = (r: Point) => String(r?.index ?? r?.Date ?? "");
const val = (r: Point, k = "v") => {
  const n = Number(r?.[k]);
  return Number.isFinite(n) ? n : null;
};

function Card({ l, v, c = "#fff" }: { l: string; v: string; c?: string }) {
  return (
    <div className="hv rounded-xl border border-white/10 bg-panel/45 px-3.5 py-3 backdrop-blur">
      <div className="font-mono text-[9px] uppercase tracking-wider text-hazedim">{l}</div>
      <div className="mt-1 text-[17px] font-semibold" style={{ color: c }}>{v}</div>
    </div>
  );
}

function Sub({ l, v, c = "#cfe0f5" }: { l: string; v: string; c?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink/50 px-3.5 py-3">
      <div className="font-mono text-[9px] uppercase tracking-wider text-hazedim">{l}</div>
      <div className="mt-1 text-[16px] font-semibold" style={{ color: c }}>{v}</div>
    </div>
  );
}

export function RiskModule() {
  const [ticker, setTicker] = useState("GOOG");
  const [start, setStart] = useState(yearsAgo(8));
  const [conf, setConf] = useState(0.95);
  const [garchWindow, setGarchWindow] = useState(63);
  const [kupWindow, setKupWindow] = useState(63);
  const [portInput, setPortInput] = useState("GOOG, NVDA, META, AMZN");
  const [portMethod, setPortMethod] = useState("historical");

  const [res, setRes] = useState<RiskResponse | null>(null);
  const [methods, setMethods] = useState<RiskMethodsResponse | null>(null);
  const [garch, setGarch] = useState<RiskGarchResponse | null>(null);
  const [kupiec, setKupiec] = useState<RiskKupiecResponse | null>(null);
  const [port, setPort] = useState<RiskPortfolioResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [mLoading, setMLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [kLoading, setKLoading] = useState(false);
  const [pLoading, setPLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [gErr, setGErr] = useState<string | null>(null);
  const [kErr, setKErr] = useState<string | null>(null);
  const [pErr, setPErr] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const ignore = (e: unknown) => (e as Error)?.name === "AbortError";
  const msg = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

  /* One effect owns fetching — base result first, then each slower panel in
     parallel so every section fills as soon as its own call lands. */
  const run = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null);
    setMethods(null); setGarch(null); setKupiec(null);
    setGErr(null); setKErr(null);

    try {
      setRes(await api.risk(ticker, start, conf, ac.signal));
      setLoading(false);
    } catch (e) {
      if (ignore(e)) return;
      setError(msg(e)); setLoading(false); return;
    }

    setMLoading(true);
    api.riskMethods(ticker, start, conf, ac.signal)
      .then(setMethods).catch((e) => { if (!ignore(e)) setError(msg(e)); })
      .finally(() => setMLoading(false));

    setGLoading(true);
    api.riskGarch(ticker, start, conf, garchWindow, ac.signal)
      .then(setGarch).catch((e) => { if (!ignore(e)) setGErr(msg(e)); })
      .finally(() => setGLoading(false));

    setKLoading(true);
    api.riskKupiec(ticker, start, conf, kupWindow, ac.signal)
      .then(setKupiec).catch((e) => { if (!ignore(e)) setKErr(msg(e)); })
      .finally(() => setKLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, start, conf, garchWindow, kupWindow]);

  // Nothing is fetched until the user presses Run — opening the page is free.
  useEffect(() => {
    if (runId === 0) return;
    run();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  /* Portfolio risk is its own request — it loads several tickers, so it only
     refires when the user asks for it. */
  const loadPortfolio = useCallback(async () => {
    const tickers = portInput.split(",").map((t) => t.trim()).filter(Boolean);
    if (tickers.length < 2) { setPErr("Enter at least 2 tickers."); setPort(null); return; }
    setPLoading(true); setPErr(null);
    try {
      setPort(await api.riskPortfolio({ tickers, start, confidence: conf, method: portMethod }));
    } catch (e) {
      if (!ignore(e)) { setPErr(msg(e)); setPort(null); }
    } finally { setPLoading(false); }
  }, [portInput, start, conf, portMethod]);

  useEffect(() => {
    if (runId === 0) return;   // don't load a multi-ticker portfolio on open
    loadPortfolio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portMethod, runId]);

  /* ── derived chart data ── */
  const dist = methods?.return_distribution ?? res?.return_distribution ?? [];

  const garchSeries = useMemo<{ labels: string[]; var: Series[]; vol: Series[] }>(() => {
    if (!garch) return { labels: [], var: [], vol: [] };
    const rets = downsample(garch.returns, 220);
    const idx = new Map(rets.map((r, i) => [label(r), i]));
    const align = (rows: Point[]) => {
      const out: (number | null)[] = new Array(rets.length).fill(null);
      rows.forEach((r) => { const i = idx.get(label(r)); if (i != null) out[i] = val(r); });
      return out;
    };
    return {
      labels: rets.map(label),
      var: [
        { label: "Daily return", color: "rgba(173,198,221,0.45)", values: rets.map((r) => val(r, "ret")) },
        { label: "Rolling VaR", color: RED, values: align(garch.rolling_var) },
        ...(garch.fit_ok ? [{ label: "GARCH VaR", color: GREEN, values: align(garch.garch_var) }] : []),
      ],
      vol: [
        { label: "Rolling ann. vol", color: "#ff8a5c", values: align(garch.rolling_vol) },
        ...(garch.fit_ok ? [{ label: "GARCH cond. vol", color: GREEN, values: align(garch.garch_vol) }] : []),
      ],
    };
  }, [garch]);

  const kupSeries = useMemo<{ labels: string[]; series: Series[] }>(() => {
    if (!kupiec) return { labels: [], series: [] };
    const rets = downsample(kupiec.returns, 260);
    const idx = new Map(rets.map((r, i) => [label(r), i]));
    const varLine: (number | null)[] = new Array(rets.length).fill(null);
    kupiec.var_series.forEach((r) => { const i = idx.get(label(r)); if (i != null) varLine[i] = val(r); });
    const viol: (number | null)[] = new Array(rets.length).fill(null);
    kupiec.violation_points.forEach((p) => { const i = idx.get(p.date); if (i != null) viol[i] = p.ret; });
    return {
      labels: rets.map(label),
      series: [
        { label: "Daily return", color: "rgba(173,198,221,0.5)", values: rets.map((r) => val(r, "ret")) },
        { label: "VaR (1d lag)", color: RED, values: varLine },
        { label: "Violation", color: "#ff8a5c", values: viol, dots: true },
      ],
    };
  }, [kupiec]);

  const portChart = useMemo<{ labels: string[]; series: Series[] }>(() => {
    if (!port) return { labels: [], series: [] };
    const p = downsample(port.portfolio_cumulative, 200);
    const idx = new Map(p.map((r, i) => [label(r), i]));
    const comps: Series[] = port.tickers.map((t, i) => {
      const out: (number | null)[] = new Array(p.length).fill(null);
      (port.component_cumulative[t] ?? []).forEach((r) => {
        const j = idx.get(label(r)); if (j != null) out[j] = val(r);
      });
      return { label: t, color: ["#8aa6c8", "#6f8fb5", "#5c7fa8", "#4a6f99"][i % 4], values: out };
    });
    return {
      labels: p.map(label),
      series: [...comps, { label: "Portfolio", color: CYAN, values: p.map((r) => val(r)) }],
    };
  }, [port]);

  const cum = useMemo(() => downsample(res?.cumulative_return ?? [], 200), [res]);
  const stress = res?.stress_tests ?? [];
  const pVal = kupiec?.p_value;
  const kupPass = pVal != null && Number.isFinite(pVal) && pVal > 0.05;

  const varBars = port
    ? { names: [...port.tickers, "Portfolio"], vals: [...port.tickers.map((t) => port.individual_var[t] ?? 0), port.portfolio_var] }
    : { names: [], vals: [] };

  return (
    <>
      <ModuleHeader
        n="07" title="Risk Analytics" accent={ACCENT}
        subtitle="Value at Risk four ways, GARCH conditional volatility, portfolio correlation risk, stress scenarios and a Kupiec test that checks whether the VaR model is honest."
      />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <TickerBar ticker={ticker} onTicker={setTicker} start={start} onStart={setStart}
          loading={loading} onRefresh={() => setRunId((n) => n + 1)} accent={ACCENT} />

        {/* ── confidence + windows ── */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-panel/45 p-5 backdrop-blur">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Confidence level</div>
              <div className="flex gap-2">
                {[0.95, 0.99].map((c) => (
                  <button key={c} onClick={() => setConf(c)}
                    className="hv rounded-[10px] border px-3.5 py-1.5 font-mono text-[12px]"
                    style={c === conf
                      ? { borderColor: ACCENT, background: `${ACCENT}1f`, color: ACCENT }
                      : { borderColor: "rgba(255,255,255,0.12)", color: "#adc6dd" }}>
                    {(c * 100).toFixed(0)}%
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-[190px] flex-1">
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">
                GARCH rolling window — {garchWindow}d
              </div>
              <input type="range" min={21} max={252} value={garchWindow}
                onChange={(e) => setGarchWindow(+e.target.value)}
                onMouseUp={() => setRunId((n) => n + 1)} onTouchEnd={() => setRunId((n) => n + 1)}
                className="w-full accent-[#a55efd]" />
            </div>
            <div className="min-w-[190px] flex-1">
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">
                Kupiec VaR window — {kupWindow}d
              </div>
              <input type="range" min={21} max={126} value={kupWindow}
                onChange={(e) => setKupWindow(+e.target.value)}
                onMouseUp={() => setRunId((n) => n + 1)} onTouchEnd={() => setRunId((n) => n + 1)}
                className="w-full accent-[#a55efd]" />
            </div>
            <button onClick={() => setRunId((n) => n + 1)} disabled={loading}
              className="hv-btn rounded-[10px] border px-5 py-2 font-mono text-[12px] uppercase tracking-widest disabled:opacity-60"
              style={{ borderColor: `${ACCENT}80`, background: `${ACCENT}1a`, color: ACCENT }}>
              {loading ? "Running…" : "Run risk analysis"}
            </button>
          </div>
        </div>

        {error && <div className="mt-6"><ApiDown message={error} /></div>}

        {runId === 0 ? (
          <IdleState onRun={() => setRunId((n) => n + 1)} accent={ACCENT}
            label="Run risk analysis"
            note="Set the ticker, confidence level and windows above, then run. Nothing is computed until you ask." />
        ) : (
        <>

        {/* ── headline VaR row ── */}
        <motion.div {...revealProps()} className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {loading && !res
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={72} />)
            : [
                { l: `VaR ${pct(conf, 0)} (Hist)`, v: pct(res?.var_historical), c: RED },
                { l: `CVaR ${pct(conf, 0)} (Hist)`, v: pct(res?.cvar_historical), c: RED },
                { l: `VaR ${pct(conf, 0)} (t-dist)`, v: pct(methods?.var_t_dist), c: GOLD },
                { l: `VaR ${pct(conf, 0)} (GARCH)`, v: pct(methods?.var_garch), c: GREEN },
                { l: "Ann. volatility", v: pct(res?.annualised_vol), c: ACCENT },
              ].map((k) => <Card key={k.l} {...k} />)}
        </motion.div>
        <p className="mt-2 font-mono text-[10.5px] text-hazedim/80">
          ℹ️ GARCH VaR reflects today&apos;s conditional vol — it spikes during stressed markets, historical VaR does not.
        </p>

        {/* ── 📊 VaR Method Comparison ── */}
        <motion.div {...revealProps(0.05)} className="mt-4">
          <Panel title="📊 Return Distribution — VaR Method Comparison"
            sub="One distribution, four estimators. Where they disagree tells you how fat the tails really are.">
            {mLoading && !methods ? <Skeleton h={230} /> : methods ? (
              <>
                <Histogram values={dist} height={230} color={CYAN}
                  markers={[
                    { value: methods.var_historical, color: RED, label: `Hist ${pct(conf, 0)}` },
                    { value: methods.cvar_historical, color: "#ff8a5c", label: `CVaR ${pct(conf, 0)}` },
                    { value: methods.var_t_dist, color: GOLD, label: `t-dist ${pct(conf, 0)}` },
                    { value: methods.var_garch, color: GREEN, label: `GARCH ${pct(conf, 0)}` },
                  ]} />
                <div className="mt-4 overflow-x-auto rounded-lg border border-white/8">
                  <table className="w-full min-w-[560px] border-collapse text-left">
                    <thead className="bg-ink/70"><tr>
                      {["Method", "VaR", "Note"].map((h) => (
                        <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {methods.methods.map((m) => (
                        <tr key={m.method} className="hover:bg-white/[0.03]">
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-white">{m.method}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]" style={{ color: RED }}>{pct(m.var)}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 text-[11.5px] text-haze">{m.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <Sub l="Tail events" v={String(methods.tail_events)} c={ACCENT} />
                  <Sub l="Worst day" v={pct(methods.worst_day)} c={RED} />
                  <Sub l="Kurtosis" v={num(methods.kurtosis)} c={methods.kurtosis > 5 ? GOLD : "#cfe0f5"} />
                  <Sub l="Max drawdown" v={pct(methods.max_drawdown)} c={RED} />
                </div>
              </>
            ) : <p className="py-8 text-center text-[13px] text-hazedim">No distribution returned.</p>}
          </Panel>
        </motion.div>

        {/* ── 🌊 GARCH Rolling Risk ── */}
        <motion.div {...revealProps(0.08)} className="mt-4">
          <Panel title="🌊 GARCH Conditional Volatility vs Rolling Volatility"
            sub="GARCH reacts fast during stress. A rolling window lags reality by half its length.">
            {gLoading && !garch ? <Skeleton h={260} /> : gErr ? (
              <p className="py-6 text-center text-[13.5px] text-hazedim">GARCH panel unavailable: {gErr}</p>
            ) : garch ? (
              <>
                {!garch.fit_ok && (
                  <div className="mb-3 rounded-lg border px-4 py-2.5 text-[12.5px]"
                    style={{ borderColor: "#e67e0055", background: "rgba(230,126,0,0.08)", color: "#e67e00" }}>
                    ⚠️ GARCH fit failed — showing rolling VaR only.
                  </div>
                )}
                <LineChart height={240} zeroLine labels={garchSeries.labels}
                  yFormat={(v) => `${(v * 100).toFixed(1)}%`} series={garchSeries.var} />
                <Legend items={[
                  { color: "rgba(173,198,221,0.45)", label: "Daily return" },
                  { color: RED, label: `Rolling VaR (${garch.window}d)` },
                  ...(garch.fit_ok ? [{ color: GREEN, label: "GARCH VaR" }] : []),
                ]} />
                {garch.fit_ok && (
                  <div className="mt-5">
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      Annualised vol — rolling vs GARCH
                    </div>
                    <LineChart height={200} labels={garchSeries.labels}
                      yFormat={(v) => `${(v * 100).toFixed(0)}%`} series={garchSeries.vol} />
                    <Legend items={[
                      { color: "#ff8a5c", label: `Rolling ann. vol (${garch.window}d)` },
                      { color: GREEN, label: "GARCH ann. conditional vol" },
                    ]} />
                  </div>
                )}
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── 🏦 Portfolio-Level Risk ── */}
        <motion.div {...revealProps(0.1)} className="mt-4">
          <Panel title="🏦 Portfolio-Level Risk"
            sub="Single-stock VaR misses correlations. Portfolio VaR accounts for how the assets move together.">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[260px] flex-1">
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Tickers (comma-separated)</div>
                <input value={portInput} onChange={(e) => setPortInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") loadPortfolio(); }}
                  className="w-full rounded-[10px] border border-white/12 bg-ink/60 px-3 py-2 font-mono text-[13px] text-white outline-none focus:border-white/40" />
              </div>
              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">VaR method</div>
                <div className="flex gap-2">
                  {["historical", "parametric", "garch"].map((mth) => (
                    <button key={mth} onClick={() => setPortMethod(mth)}
                      className="hv rounded-[10px] border px-3 py-1.5 font-mono text-[11.5px]"
                      style={mth === portMethod
                        ? { borderColor: ACCENT, background: `${ACCENT}1f`, color: ACCENT }
                        : { borderColor: "rgba(255,255,255,0.12)", color: "#adc6dd" }}>
                      {mth}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={loadPortfolio} disabled={pLoading}
                className="hv-btn rounded-[10px] border px-4 py-2 font-mono text-[11.5px] uppercase tracking-widest disabled:opacity-60"
                style={{ borderColor: `${CYAN}70`, background: `${CYAN}14`, color: CYAN }}>
                {pLoading ? "Loading…" : "Load portfolio"}
              </button>
            </div>

            {pErr && <p className="mt-4 text-[13px]" style={{ color: RED }}>{pErr}</p>}

            {pLoading && !port ? <div className="mt-4"><Skeleton h={240} /></div> : port ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <Sub l={`Portfolio VaR ${pct(conf, 0)}`} v={pct(port.portfolio_var)} c={RED} />
                  <Sub l={`Portfolio CVaR ${pct(conf, 0)}`} v={pct(port.portfolio_cvar)} c={RED} />
                  <Sub l="Portfolio ann. vol" v={pct(port.portfolio_vol)} c={GOLD} />
                  <Sub l="Portfolio max DD" v={pct(port.portfolio_max_drawdown)} c={RED} />
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">Return correlation matrix</div>
                    <Heatmap matrix={port.correlation} />
                  </div>
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      Individual vs portfolio VaR ({pct(conf, 0)})
                    </div>
                    <WeightBars tickers={varBars.names} weights={varBars.vals} color={RED} />
                    <p className="mt-3 text-[11.5px] text-hazedim">
                      The portfolio bar sitting below every component is the diversification benefit — correlations below 1 cancel part of the risk.
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Cumulative returns — portfolio vs components
                  </div>
                  <LineChart height={230} labels={portChart.labels}
                    yFormat={(v) => v.toFixed(2)} series={portChart.series} />
                  <Legend items={[{ color: "#8aa6c8", label: "Components" }, { color: CYAN, label: "Portfolio (equal weight)" }]} />
                </div>
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── 💥 Stress Tests ── */}
        <motion.div {...revealProps(0.12)} className="mt-4">
          <Panel title="💥 Stress Tests — Historical Crisis Windows"
            sub="How this asset actually behaved through the last five regime shocks.">
            {loading && !res ? <Skeleton h={200} /> : stress.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-hazedim">
                No stress window falls inside this date range — extend the start date to cover 2018, 2020 or 2022.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-white/8">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead className="bg-ink/70"><tr>
                    {["Scenario", "Period", "Total return", "Max drawdown", "Hist VaR 95%", "t-dist VaR 95%", "Worst day", "Volatility"].map((h) => (
                      <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {stress.map((s) => (
                      <tr key={s.scenario} className="hover:bg-white/[0.03]">
                        <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-white">{s.scenario}</td>
                        <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11px] text-hazedim">{s.period}</td>
                        <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                          style={{ color: s.total_return >= 0 ? GREEN : RED }}>{pct(s.total_return)}</td>
                        <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]" style={{ color: RED }}>{pct(s.max_drawdown)}</td>
                        <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-haze">{pct(s.var_95)}</td>
                        <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-haze">{pct(s.var_t_95)}</td>
                        <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]" style={{ color: RED }}>{pct(s.worst_day)}</td>
                        <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]" style={{ color: GOLD }}>{pct(s.volatility)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </motion.div>

        {/* ── 🔬 Kupiec POF Backtest ── */}
        <motion.div {...revealProps(0.14)} className="mt-4">
          <Panel title="🔬 Kupiec Proportion of Failures (POF) Test"
            sub="Is the VaR model honest? Counts actual losses beyond VaR against the expected rate. p > 0.05 = statistically valid.">
            {kLoading && !kupiec ? <Skeleton h={280} /> : kErr ? (
              <p className="py-6 text-center text-[13.5px] text-hazedim">Kupiec test unavailable: {kErr}</p>
            ) : kupiec ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Sub l="Observations" v={String(kupiec.observations)} />
                  <Sub l="Violations" v={String(kupiec.violations)} c={GOLD} />
                  <Sub l="Expected rate" v={pct(kupiec.expected_rate, 1)} />
                  <Sub l="Actual rate" v={pct(kupiec.actual_rate, 1)}
                    c={kupiec.actual_rate != null && kupiec.actual_rate > kupiec.expected_rate ? RED : GREEN} />
                </div>

                <div className="mt-4 rounded-xl border px-5 py-4"
                  style={kupPass
                    ? { borderColor: "#1f8f4e55", background: "rgba(31,143,78,0.1)" }
                    : { borderColor: "#dc323255", background: "rgba(220,50,50,0.1)" }}>
                  <div className="font-mono text-[12px] font-bold" style={{ color: kupPass ? "#1f8f4e" : "#dc3232" }}>
                    {pVal == null || !Number.isFinite(pVal)
                      ? kupiec.result
                      : `${kupPass ? "✅ Valid model" : "❌ Model underestimates risk"} — p-value ${pVal.toFixed(4)}`}
                  </div>
                  <div className="mt-1 text-[13px] text-haze">
                    {kupPass
                      ? "Violation count is statistically consistent with the confidence level. The VaR model is behaving as advertised."
                      : "Losses breached VaR more often than the model allows for. Treat this VaR as optimistic and size positions off CVaR instead."}
                  </div>
                </div>

                <div className="mt-4">
                  <LineChart height={250} zeroLine labels={kupSeries.labels}
                    yFormat={(v) => `${(v * 100).toFixed(1)}%`} series={kupSeries.series} />
                  <Legend items={[
                    { color: "rgba(173,198,221,0.5)", label: "Daily return" },
                    { color: RED, label: `VaR ${pct(conf, 0)} (1d lag, ${kupiec.window}d window)` },
                    { color: "#ff8a5c", label: `VaR violation (${kupiec.violations})` },
                  ]} />
                </div>

                <p className="mt-3 text-[12px] text-hazedim">
                  💡 Too few violations = overcautious, wasting capital. Too many = underestimating risk.
                  Target: violations ≈ {pct(1 - conf, 0)} × {kupiec.observations} ≈ {Math.round((1 - conf) * kupiec.observations)} days.
                </p>
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── summary + cumulative ── */}
        <motion.div {...revealProps(0.16)} className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="Risk & return summary" sub="Downside measures from core.metrics">
            {loading && !res ? <Skeleton h={210} /> : res && (
              <div>
                <StatRow label={`VaR ${pct(conf, 0)} (historical)`} desc="Loss exceeded ~1 day in 20" value={pct(res.var_historical)} tone="neg" />
                <StatRow label={`CVaR ${pct(conf, 0)}`} desc="Average loss beyond VaR" value={pct(res.cvar_historical)} tone="neg" />
                <StatRow label={`VaR ${pct(conf, 0)} (parametric)`} desc="Gaussian assumption" value={pct(res.var_parametric)} tone="neg" />
                <StatRow label="Annualised volatility" desc="Standard deviation, annualised" value={pct(res.annualised_vol)} tone="neutral" />
                <StatRow label="Skewness" desc="Negative = losses cluster larger" value={num(methods?.skewness)} tone={(methods?.skewness ?? 0) < 0 ? "neg" : "pos"} />
                <StatRow label="Worst day" desc="Largest single-day loss" value={pct(res.worst_day)} tone="neg" />
                <StatRow label="Best day" desc="Largest single-day gain" value={pct(res.best_day)} tone="pos" />
              </div>
            )}
          </Panel>

          <Panel title="Cumulative return" sub="Growth of the series over the window">
            {loading && !cum.length ? <Skeleton h={210} /> : cum.length ? (
              <LineChart height={210} fillFirst labels={cum.map(label)}
                yFormat={(v) => v.toFixed(2)}
                series={[{ label: "Cumulative", color: ACCENT, values: cum.map((r) => val(r, "cumulative")) }]} />
            ) : <p className="py-8 text-center text-[13px] text-hazedim">No series returned.</p>}
          </Panel>
        </motion.div>

        </>
        )}

        <p className="mt-6 text-center font-mono text-[11px] text-hazedim/70">
          VaR is not a worst case — real crashes go past it. Every figure computed by core.metrics.
        </p>
      </section>
    </>
  );
}
