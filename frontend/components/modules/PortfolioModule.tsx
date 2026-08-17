"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  api, ApiError, downsample,
  type AnalyticFrontierResponse, type Point, type PortfolioFullResponse,
  type PortfolioStrategy,
} from "@/lib/api";
import { revealProps } from "../motion";
import { ApiDown, ModuleHeader, Panel, Skeleton, IdleState } from "./Shell";
import { Heatmap, Legend, LineChart, Scatter, WeightBars } from "./charts";
import { TickerBar, yearsAgo } from "./TickerBar";

/* ──────────────────────────────────────────────────────────────────────────
   PORTFOLIO MODULE — full parity with the Streamlit Portfolio page:
     Live Signals (covariance health · regime · regime timeline)
     Analytic Efficient Frontier · Regime-Adaptive Portfolio
     Risk Parity (with risk contributions) · Correlation
   ────────────────────────────────────────────────────────────────────────── */

const ACCENT = "#ffd700";
const GREEN = "#00f5a0";
const RED = "#ff5470";
const CYAN = "#0be0ff";
const VIOLET = "#a55efd";

const STRATS = ["Max Sharpe", "Min Variance", "Risk Parity", "Equal Weight"] as const;
const STRAT_COLOR: Record<string, string> = {
  "Max Sharpe": ACCENT, "Min Variance": CYAN, "Risk Parity": VIOLET, "Equal Weight": RED,
};

const badgeColor = (c: string) => (c === "green" ? GREEN : c === "orange" ? ACCENT : RED);
const regimeColor = (r: string) => (/bull/i.test(r) ? GREEN : /bear/i.test(r) ? RED : ACCENT);
const label = (r: Point) => String(r?.index ?? r?.Date ?? "");

function Sub({ l, v, c = "#cfe0f5", note }: { l: string; v: string; c?: string; note?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink/50 px-3.5 py-3">
      <div className="font-mono text-[9px] uppercase tracking-wider text-hazedim">{l}</div>
      <div className="mt-1 text-[16px] font-semibold" style={{ color: c }}>{v}</div>
      {note && <div className="mt-0.5 font-mono text-[9.5px] text-hazedim">{note}</div>}
    </div>
  );
}

function StrategyCard({ name, s, tickers, highlight }: {
  name: string; s: PortfolioStrategy; tickers: string[]; highlight?: boolean;
}) {
  const c = STRAT_COLOR[name] ?? ACCENT;
  return (
    <div className="rounded-xl border px-5 py-4"
      style={highlight
        ? { borderColor: `${c}88`, background: `${c}12`, borderLeftWidth: 5 }
        : { borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-semibold" style={{ color: c }}>
          {highlight ? "⭐ " : ""}{name}
        </span>
        <span className="font-mono text-[11px]" style={{ color: badgeColor(s.concentration.color) }}>
          {s.concentration.status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {Object.entries(s.stats).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-white/10 bg-ink/50 px-2.5 py-2">
            <div className="font-mono text-[8.5px] uppercase tracking-wider text-hazedim">{k}</div>
            <div className="mt-0.5 font-mono text-[12.5px] text-white">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/10 bg-ink/40 px-2.5 py-2">
          <div className="font-mono text-[8.5px] uppercase tracking-wider text-hazedim">Gross Sharpe</div>
          <div className="mt-0.5 font-mono text-[12.5px] text-white">{s.cost.gross_sharpe.toFixed(3)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-ink/40 px-2.5 py-2">
          <div className="font-mono text-[8.5px] uppercase tracking-wider text-hazedim">Net Sharpe</div>
          <div className="mt-0.5 font-mono text-[12.5px]" style={{ color: s.cost.sharpe_drag > 0 ? RED : GREEN }}>
            {s.cost.net_sharpe.toFixed(3)} <span className="text-[10px] text-hazedim">−{s.cost.sharpe_drag.toFixed(3)}</span>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-ink/40 px-2.5 py-2">
          <div className="font-mono text-[8.5px] uppercase tracking-wider text-hazedim">Cost / yr</div>
          <div className="mt-0.5 font-mono text-[12.5px] text-white">{s.cost.annual_cost_pct}%</div>
        </div>
      </div>

      <p className="mt-2.5 text-[11.5px] text-hazedim">
        HHI {s.concentration.norm_hhi.toFixed(0)}/100 · largest {s.concentration.top_ticker} {s.concentration.max_weight}% ·
        top-2 {s.concentration.top2_pct}% · turnover {s.cost.turnover_pct}%
      </p>

      <div className="mt-3">
        <WeightBars tickers={tickers} weights={s.weights} color={c} />
      </div>
    </div>
  );
}

export function PortfolioModule() {
  const [tickers, setTickers] = useState("GOOG,NVDA,META,AMZN");
  const [start, setStart] = useState(yearsAgo(8));
  const [maxWeight, setMaxWeight] = useState(0.4);
  const [costBps, setCostBps] = useState(10);
  const [rebalDays, setRebalDays] = useState(21);

  const [res, setRes] = useState<PortfolioFullResponse | null>(null);
  const [front, setFront] = useState<AnalyticFrontierResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fLoading, setFLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const ignore = (e: unknown) => (e as Error)?.name === "AbortError";
  const msg = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

  const run = useCallback(async () => {
    const list = tickers.split(",").map((t) => t.trim()).filter(Boolean);
    if (list.length < 2) { setError("Enter at least two tickers, comma-separated."); setLoading(false); return; }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null); setFront(null);

    const body = { tickers: list, start, max_weight: maxWeight, cost_bps: costBps, rebal_days: rebalDays };

    try {
      setRes(await api.portfolioFull(body, ac.signal));
      setLoading(false);
    } catch (e) {
      if (ignore(e)) return;
      setError(msg(e)); setLoading(false); return;
    }

    // The frontier is ~50 convex solves — load it after the page is populated.
    setFLoading(true);
    api.portfolioFrontierAnalytic(body, ac.signal)
      .then(setFront).catch(() => { if (!ac.signal.aborted) setFront(null); })
      .finally(() => setFLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers, start, maxWeight, costBps, rebalDays]);

  // Nothing is fetched until the user presses Run — opening the page is free.
  useEffect(() => {
    if (runId === 0) return;
    run();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const list = res?.tickers ?? [];
  const regime = res?.regime;
  const chosen = regime?.strategy ?? "";
  const timeline = useMemo(() => downsample(res?.regime_timeline ?? [], 200), [res]);

  /* Frontier scatter, with the four strategy portfolios marked. */
  const pts = front ? front.vols.map((v, i) => ({
    x: v, y: front.rets[i],
    c: (front.rets[i] - front.risk_free_rate) / (v + 1e-10),
  })) : [];
  const highlights = res ? STRATS.filter((n) => res.strategies[n]).map((n) => ({
    x: res.strategies[n].point.vol,
    y: res.strategies[n].point.ret,
    color: STRAT_COLOR[n],
    label: n,
  })) : [];

  return (
    <>
      <ModuleHeader
        n="08" title="Portfolio Optimization" accent={ACCENT}
        subtitle="Ledoit-Wolf shrinkage covariance, an analytic efficient frontier, regime-adaptive strategy selection and risk parity — with transaction costs and concentration made explicit."
        right={regime?.current && (
          <span className="rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest"
            style={{ color: regimeColor(regime.current), borderColor: `${regimeColor(regime.current)}55`, background: `${regimeColor(regime.current)}12` }}>
            ● {regime.current}
          </span>
        )}
      />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <TickerBar ticker={tickers} onTicker={setTickers} start={start} onStart={setStart} multi
          label="Universe" loading={loading} onRefresh={() => setRunId((n) => n + 1)} accent={ACCENT} />

        {/* ── settings ── */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-panel/45 p-5 backdrop-blur">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Max weight per asset — {(maxWeight * 100).toFixed(0)}%</div>
              <input type="range" min={0.1} max={1} step={0.05} value={maxWeight} onChange={(e) => setMaxWeight(+e.target.value)}
                onMouseUp={() => setRunId((n) => n + 1)} onTouchEnd={() => setRunId((n) => n + 1)} className="w-full accent-[#ffd700]" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Transaction cost — {costBps} bps</div>
              <input type="range" min={0} max={100} step={5} value={costBps} onChange={(e) => setCostBps(+e.target.value)}
                onMouseUp={() => setRunId((n) => n + 1)} onTouchEnd={() => setRunId((n) => n + 1)} className="w-full accent-[#ffd700]" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Rebalance — every {rebalDays}d</div>
              <input type="range" min={5} max={126} value={rebalDays} onChange={(e) => setRebalDays(+e.target.value)}
                onMouseUp={() => setRunId((n) => n + 1)} onTouchEnd={() => setRunId((n) => n + 1)} className="w-full accent-[#ffd700]" />
            </div>
          </div>
          <button onClick={() => setRunId((n) => n + 1)} disabled={loading}
            className="hv-btn mt-4 rounded-[10px] border px-5 py-2 font-mono text-[12px] uppercase tracking-widest disabled:opacity-60"
            style={{ borderColor: `${ACCENT}80`, background: `${ACCENT}1a`, color: ACCENT }}>
            {loading ? "Optimising…" : "Run portfolio analysis"}
          </button>
        </div>

        {error && <div className="mt-6"><ApiDown message={error} /></div>}

        {runId === 0 ? (
          <IdleState onRun={() => setRunId((n) => n + 1)} accent={ACCENT}
            label="Run portfolio analysis"
            note="Enter a universe and constraints above, then run. The efficient frontier solves ~50 optimisations, so nothing starts on its own." />
        ) : (
        <>

        {/* ── Live Signals ── */}
        <motion.div {...revealProps()} className="mt-4">
          <Panel title="Live Signals" sub="Whether the weights can be trusted, what regime we are in, and how that regime has moved">
            {loading && !res ? <Skeleton h={180} /> : res && (
              <div className="grid gap-4 lg:grid-cols-3">
                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">Covariance health</div>
                  <div className="rounded-xl border-l-[4px] px-4 py-3"
                    style={{ borderColor: badgeColor(res.covariance_health.color), background: `${badgeColor(res.covariance_health.color)}12` }}>
                    <div className="font-mono text-[13px] font-bold" style={{ color: badgeColor(res.covariance_health.color) }}>
                      {res.covariance_health.status} (ratio {res.covariance_health.ratio}×)
                    </div>
                    <div className="mt-1 text-[12px] text-haze">{res.covariance_health.msg}</div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">Market regime</div>
                  <div className="rounded-xl border-l-[4px] px-4 py-3"
                    style={{ borderColor: regime!.color, background: `${regime!.color}18` }}>
                    <div className="font-mono text-[13px] font-bold" style={{ color: regime!.color }}>{regime!.current}</div>
                    <div className="mt-1 text-[12px] text-haze">
                      Recommended: <b className="text-white">{regime!.strategy}</b> — {regime!.reason}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">Regime timeline (1yr)</div>
                  {timeline.length > 0 ? (
                    <LineChart height={110} zeroLine fillFirst labels={timeline.map(label)}
                      yFormat={(v) => (v > 0.5 ? "Bull" : v < -0.5 ? "Bear" : "Side")}
                      series={[{ label: "Regime", color: regime!.color, values: timeline.map((r) => Number(r.v)) }]} />
                  ) : <p className="py-6 text-center text-[12.5px] text-hazedim">Timeline unavailable.</p>}
                </div>
              </div>
            )}
          </Panel>
        </motion.div>

        {/* ── Analytic Efficient Frontier ── */}
        <motion.div {...revealProps(0.05)} className="mt-4">
          <Panel title="Analytic Efficient Frontier"
            sub="Built by solving a convex optimisation at each target return — not Monte Carlo random sampling. Points are coloured by Sharpe.">
            {fLoading && !front ? <Skeleton h={300} /> : pts.length > 0 ? (
              <>
                <Scatter points={pts} highlights={highlights} height={320}
                  xLabel="Annual volatility" yLabel="Annual return" />
                <Legend items={STRATS.filter((n) => res?.strategies[n]).map((n) => ({ color: STRAT_COLOR[n], label: n }))} />
              </>
            ) : (
              <p className="py-8 text-center text-[13px] text-hazedim">
                Frontier unavailable for this universe — try a longer date range.
              </p>
            )}
          </Panel>
        </motion.div>

        {/* ── Max Sharpe vs Min Variance ── */}
        <motion.div {...revealProps(0.08)} className="mt-4 grid gap-4 lg:grid-cols-2">
          {loading && !res ? <><Skeleton h={340} /><Skeleton h={340} /></>
            : res && (["Max Sharpe", "Min Variance"] as const).map((n) =>
                res.strategies[n] ? (
                  <StrategyCard key={n} name={n} s={res.strategies[n]} tickers={list} highlight={n === chosen} />
                ) : null)}
        </motion.div>

        {/* ── Regime-Adaptive Portfolio ── */}
        <motion.div {...revealProps(0.11)} className="mt-4">
          <Panel title="Regime-Adaptive Portfolio"
            sub="The strategy is picked automatically from the current HMM regime — Max Sharpe in a bull, Min Variance in a bear, Risk Parity when it's sideways.">
            {loading && !res ? <Skeleton h={300} /> : res && regime && (
              <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
                <div>
                  <div className="rounded-xl border-2 px-5 py-4" style={{ borderColor: regime.color, background: "rgba(255,255,255,0.02)" }}>
                    <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: regime.color }}>Current regime</div>
                    <div className="mt-1 text-[22px] font-bold text-white">{regime.current}</div>
                    <div className="my-3 h-px w-full" style={{ background: `${regime.color}55` }} />
                    <div className="font-mono text-[10px] uppercase tracking-widest text-hazedim">Auto-selected strategy</div>
                    <div className="mt-1 text-[18px] font-semibold" style={{ color: regime.color }}>{regime.strategy}</div>
                    <p className="mt-1.5 text-[12.5px] text-hazedim">{regime.reason}</p>
                  </div>

                  {Object.keys(regime.regime_pct).length > 0 && (
                    <div className="mt-4">
                      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">Regime distribution</div>
                      <div className="space-y-2">
                        {Object.entries(regime.regime_pct).map(([r, pct]) => (
                          <div key={r}>
                            <div className="flex items-baseline justify-between text-[12px]">
                              <span style={{ color: regimeColor(r) }}>{r}</span>
                              <span className="font-mono text-hazedim">{pct}%</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8">
                              <motion.div className="h-full rounded-full" style={{ background: regimeColor(r) }}
                                initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 0.8 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  {res.strategies[chosen] && (
                    <StrategyCard name={chosen} s={res.strategies[chosen]} tickers={list} highlight />
                  )}
                </div>
              </div>
            )}

            {/* strategy comparison */}
            {res && (
              <div className="mt-5">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">Strategy comparison</div>
                <div className="overflow-x-auto rounded-lg border border-white/8">
                  <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead className="bg-ink/70"><tr>
                      {["Strategy", "Return", "Vol", "Gross Sharpe", "Net Sharpe", "Cost/yr", "Concentration", "Max wt"].map((h) => (
                        <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {STRATS.filter((n) => res.strategies[n]).map((n) => {
                        const s = res.strategies[n];
                        return (
                          <tr key={n} className="hover:bg-white/[0.03]">
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                              style={{ color: n === chosen ? STRAT_COLOR[n] : "#fff" }}>
                              {n === chosen ? "⭐ " : ""}{n}
                            </td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-white">{s.stats["Annual Return"]}</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-haze">{s.stats["Volatility"]}</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-white">{s.cost.gross_sharpe.toFixed(3)}</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                              style={{ color: s.cost.net_sharpe >= s.cost.gross_sharpe ? GREEN : RED }}>{s.cost.net_sharpe.toFixed(3)}</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-hazedim">{s.cost.annual_cost_pct}%</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                              style={{ color: badgeColor(s.concentration.color) }}>{s.concentration.status}</td>
                            <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-haze">{s.concentration.max_weight}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Panel>
        </motion.div>

        {/* ── Risk Parity ── */}
        <motion.div {...revealProps(0.14)} className="mt-4">
          <Panel title="Equal Risk Contribution — Risk Parity"
            sub="Maillard, Roncalli & Teïletche (2010): every asset contributes exactly 1/N of total portfolio volatility, regardless of its weight.">
            {loading && !res ? <Skeleton h={260} /> : res?.strategies["Risk Parity"] && (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Sub l="Gross Sharpe" v={res.strategies["Risk Parity"].cost.gross_sharpe.toFixed(3)} c={CYAN} />
                  <Sub l="Net Sharpe" v={res.strategies["Risk Parity"].cost.net_sharpe.toFixed(3)}
                    c={GREEN} note={`drag −${res.strategies["Risk Parity"].cost.sharpe_drag.toFixed(3)}`} />
                  <Sub l="Annual cost" v={`${res.strategies["Risk Parity"].cost.annual_cost_pct}%`} />
                  <Sub l="Turnover" v={`${res.strategies["Risk Parity"].cost.turnover_pct}%`} />
                </div>

                <div className="mt-5 grid gap-6 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">Risk parity weights</div>
                    <WeightBars tickers={list} weights={res.strategies["Risk Parity"].weights} color={VIOLET} />
                  </div>
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      Risk contribution (% of total volatility)
                    </div>
                    <WeightBars tickers={list}
                      weights={(res.risk_contributions["Risk Parity"] ?? []).map((v) => v / 100)}
                      color={GREEN} />
                    <p className="mt-3 text-[11.5px] text-hazedim">
                      All bars sitting at {(100 / Math.max(list.length, 1)).toFixed(0)}% is the point — that is what &quot;equal risk contribution&quot; means.
                      Compare with equal-weight, where risk contribution follows volatility instead.
                    </p>
                  </div>
                </div>
              </>
            )}
          </Panel>
        </motion.div>

        {/* ── Correlation ── */}
        <motion.div {...revealProps(0.17)} className="mt-4">
          <Panel title="Correlation Analysis" sub="What actually drives diversification — low correlations are the whole reason a portfolio beats its components">
            {loading && !res ? <Skeleton h={220} /> : res && <Heatmap matrix={res.correlation} />}
          </Panel>
        </motion.div>

        </>
        )}

        <p className="mt-6 text-center font-mono text-[11px] text-hazedim/70">
          Ledoit-Wolf shrinkage covariance and convex optimisation. Weights are an output of the data, not a recommendation.
        </p>
      </section>
    </>
  );
}
