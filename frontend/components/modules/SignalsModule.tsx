"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  api, ApiError, downsample, HEALTH_SIGNALS,
  type AlphaSignalsResponse, type DataEngine, type FrameMeta, type MacroRegimeResponse,
  type Point, type SignalCrowdingResponse, type SignalHealthRow, type SignalHealthResponse,
  type SignalsResponse,
} from "@/lib/api";
import { revealProps } from "../motion";
import { DataEngineBar } from "./DataEngineBar";
import { ApiDown, ModuleHeader, Panel, Skeleton, IdleState } from "./Shell";
import { Legend, LineChart, type Series } from "./charts";

/* ──────────────────────────────────────────────────────────────────────────
   SIGNALS MODULE — indicator panels plus full parity with the Streamlit
   Signals page's six tabs:
     📊 IC-Weighted Combined   🌊 Volume Pressure (OFI proxy)
     😰 Realized Skew (IV proxy)  🏭 Crowding (+ multi-ticker)
     ❤️ Signal Health & Alpha Decay   🌍 Cross-Asset Macro Regime
   ────────────────────────────────────────────────────────────────────────── */

const ACCENT = "#0be0ff";
const GREEN = "#00f5a0";
const RED = "#ff5470";
const GOLD = "#ffd700";
const ORANGE = "#ff8a5c";
const VIOLET = "#a55efd";

function yearsAgo(y: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - y);
  return d.toISOString().slice(0, 10);
}

const STANCE = {
  BUY: { c: GREEN, icon: "▲", note: "Indicators lean bullish" },
  SELL: { c: RED, icon: "▼", note: "Indicators lean bearish" },
  HOLD: { c: GOLD, icon: "—", note: "No clear consensus" },
} as const;

const label = (r: Point) => String(r?.index ?? r?.Date ?? "");
const gv = (r: Point, k: string) => {
  const n = Number(r?.[k]);
  return Number.isFinite(n) ? n : null;
};
const f = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(d);

function Sub({ l, v, c = "#cfe0f5", note }: { l: string; v: string; c?: string; note?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink/50 px-3.5 py-3">
      <div className="font-mono text-[9px] uppercase tracking-wider text-hazedim">{l}</div>
      <div className="mt-1 text-[16px] font-semibold" style={{ color: c }}>{v}</div>
      {note && <div className="mt-0.5 font-mono text-[9.5px] text-hazedim">{note}</div>}
    </div>
  );
}

export function SignalsModule() {
  const [ticker, setTicker] = useState("GOOG");
  const [engine, setEngine] = useState<DataEngine>({
    live: false, start: yearsAgo(6), interval: "1m", lookback: "1d", refreshSeconds: 60,
  });
  const [fwdDays, setFwdDays] = useState(5);
  const [ofiThresh, setOfiThresh] = useState(0.8);
  const [skewThresh, setSkewThresh] = useState(0.7);
  const [crowdTickers, setCrowdTickers] = useState("GOOG, NVDA, META, AMZN");

  const [res, setRes] = useState<SignalsResponse | null>(null);
  const [meta, setMeta] = useState<FrameMeta | null>(null);
  const [alpha, setAlpha] = useState<AlphaSignalsResponse | null>(null);
  const [health, setHealth] = useState<Record<string, SignalHealthResponse>>({});
  const [crowdCmp, setCrowdCmp] = useState<SignalCrowdingResponse | null>(null);
  const [macro, setMacro] = useState<MacroRegimeResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [aLoading, setALoading] = useState(false);
  const [hLoading, setHLoading] = useState(false);
  const [cLoading, setCLoading] = useState(false);
  const [mLoading, setMLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const ignore = (e: unknown) => (e as Error)?.name === "AbortError";
  const msg = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

  const load = useCallback(async (t: string, e: DataEngine) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null);
    setAlpha(null); setHealth({}); setMacro(null);

    try {
      const r = await api.signals(t, e, ac.signal);
      setRes(r); setMeta(r.meta ?? null); setLoading(false);
    } catch (err) {
      if (ignore(err)) return;
      setError(msg(err)); setLoading(false); return;
    }

    const body = {
      start: e.start, fwd_days: fwdDays,
      ofi_threshold: ofiThresh, skew_threshold: skewThresh,
    };

    setALoading(true);
    api.alphaSignals(t, body, ac.signal)
      .then(setAlpha).catch((err) => { if (!ignore(err)) setError(msg(err)); })
      .finally(() => setALoading(false));

    // Six health calls in parallel — each is ~4s, all six in one request would
    // sit right on the proxy's ceiling.
    setHLoading(true);
    Promise.allSettled(
      HEALTH_SIGNALS.map((name) =>
        api.signalHealth(t, name, body, ac.signal).then((r) => [name, r] as const))
    ).then((settled) => {
      if (ac.signal.aborted) return;
      const next: Record<string, SignalHealthResponse> = {};
      for (const s of settled) if (s.status === "fulfilled") next[s.value[0]] = s.value[1];
      setHealth(next);
    }).finally(() => { if (!ac.signal.aborted) setHLoading(false); });

    setMLoading(true);
    api.macroRegime(e.start, ac.signal)
      .then(setMacro).catch(() => { if (!ac.signal.aborted) setMacro({ available: false, note: "Macro data unavailable." }); })
      .finally(() => setMLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fwdDays, ofiThresh, skewThresh]);

  // Nothing is fetched until the user presses Run — opening the page is free.
  useEffect(() => {
    if (tick === 0) return;
    if (ticker) load(ticker, engine);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  useEffect(() => {
    if (!engine.live) return;
    const id = setInterval(() => setTick((n) => n + 1), engine.refreshSeconds * 1000);
    return () => clearInterval(id);
  }, [engine.live, engine.refreshSeconds]);

  const loadCrowding = useCallback(async () => {
    const list = crowdTickers.split(",").map((t) => t.trim()).filter(Boolean);
    if (list.length < 2) { setCrowdCmp({ rows: [] }); return; }
    setCLoading(true);
    try { setCrowdCmp(await api.signalCrowding({ tickers: list, start: engine.start })); }
    catch { setCrowdCmp({ rows: [] }); }
    finally { setCLoading(false); }
  }, [crowdTickers, engine.start]);

  useEffect(() => {
    if (tick === 0) return;   // don't load a multi-ticker comparison on open
    loadCrowding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  /* ── derived ── */
  const rows = useMemo(() => downsample(res?.data ?? [], 220), [res]);
  const latest = res?.latest;
  const stance = (res?.stance ?? "HOLD") as keyof typeof STANCE;
  const s = STANCE[stance] ?? STANCE.HOLD;
  const recent = useMemo(
    () => (res?.data ?? []).filter((r) => r.combined !== 0).slice(-12).reverse(),
    [res]
  );

  const A = useMemo(() => downsample(alpha?.series ?? [], 220), [alpha]);
  const aLabels = A.map(label);
  const combinedLatest = alpha?.latest.combined ?? 0;
  const master = combinedLatest === 1 ? "BUY" : combinedLatest === -1 ? "SELL" : "HOLD";
  const masterC = combinedLatest === 1 ? GREEN : combinedLatest === -1 ? RED : GOLD;

  /** Price series with buy/sell markers taken from a signal column. */
  const marked = (col: string, upC: string, dnC: string, upL: string, dnL: string): Series[] => {
    const close = A.map((r) => gv(r, "close"));
    const up = A.map((r) => (gv(r, col) === 1 ? gv(r, "close") : null));
    const dn = A.map((r) => (gv(r, col) === -1 ? gv(r, "close") : null));
    return [
      { label: "Close", color: "rgba(255,255,255,0.65)", values: close },
      { label: upL, color: upC, values: up, dots: true },
      { label: dnL, color: dnC, values: dn, dots: true },
    ];
  };

  const healthRows = useMemo<SignalHealthRow[]>(
    () => Object.values(health).map((h) => h.row).sort((a, b) => b.Health - a.Health),
    [health]
  );
  const bestHealth = healthRows[0];
  const bestDetail = bestHealth ? health[bestHealth.Signal] : undefined;
  const bestIc = useMemo(() => {
    if (!bestDetail) return { ic: [] as (number | null)[], trend: [] as (number | null)[] };
    const ic = downsample(bestDetail.rolling_ic, 200);
    const tr = downsample(bestDetail.ic_trend, 200);
    return { ic: ic.map((p) => p.v), trend: tr.map((p) => p.v) };
  }, [bestDetail]);

  const macroSeries = useMemo(() => downsample(macro?.series ?? [], 200), [macro]);

  return (
    <>
      <ModuleHeader
        n="06" title="Signals" accent={ACCENT}
        subtitle="Indicator rules plus the alpha stack: volume pressure, realized skew, crowding, signal-health decay and a cross-asset macro regime — combined by Information Coefficient, not by hand."
        right={meta && (
          <span className="rounded-full border px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-widest"
            style={{ color: GOLD, borderColor: "#ffd70055", background: "#ffd7000f" }}>
            ● {meta.badge}
          </span>
        )}
      />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <DataEngineBar ticker={ticker} onTicker={setTicker} engine={engine} onEngine={setEngine}
          meta={meta} loading={loading} onRefresh={() => setTick((n) => n + 1)} />

        {/* ── thresholds ── */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-panel/45 p-5 backdrop-blur">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">IC forward window — {fwdDays}d</div>
              <input type="range" min={1} max={21} value={fwdDays} onChange={(e) => setFwdDays(+e.target.value)}
                onMouseUp={() => setTick((n) => n + 1)} onTouchEnd={() => setTick((n) => n + 1)} className="w-full accent-[#0be0ff]" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">OFI threshold — {ofiThresh.toFixed(1)}</div>
              <input type="range" min={0.3} max={2} step={0.1} value={ofiThresh} onChange={(e) => setOfiThresh(+e.target.value)}
                onMouseUp={() => setTick((n) => n + 1)} onTouchEnd={() => setTick((n) => n + 1)} className="w-full accent-[#0be0ff]" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Skew threshold — {skewThresh.toFixed(1)}</div>
              <input type="range" min={0.3} max={2} step={0.1} value={skewThresh} onChange={(e) => setSkewThresh(+e.target.value)}
                onMouseUp={() => setTick((n) => n + 1)} onTouchEnd={() => setTick((n) => n + 1)} className="w-full accent-[#0be0ff]" />
            </div>
          </div>
        </div>

        {error && <div className="mt-6"><ApiDown message={error} /></div>}

        {tick === 0 ? (
          <IdleState onRun={() => setTick((n) => n + 1)} accent={ACCENT}
            label="Run signal analysis"
            note="Pick a ticker and thresholds, then run. The signal-health monitor fits six models, so nothing starts on its own." />
        ) : (
        <>

        {/* ── master stance bar ── */}
        {alpha && (
          <motion.div {...revealProps()} className="mt-4 rounded-2xl border p-6"
            style={{ borderColor: `${masterC}66`, background: `${masterC}10`, borderLeftWidth: 6 }}>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div className="text-[26px] font-bold" style={{ color: masterC }}>{master}</div>
              <div className="font-mono text-[12.5px] text-haze">
                IC-weighted combination of {alpha.latest.n_signals} signals · forward window {alpha.fwd_days}d ·
                crowding weight {alpha.latest.crowd_weight.toFixed(2)}×
              </div>
            </div>
          </motion.div>
        )}

        <motion.div {...revealProps(0.03)} className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {aLoading && !alpha ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={72} />)
            : alpha && [
                { l: "Volume pressure z", v: f(alpha.latest.ofi), c: alpha.latest.ofi > 0.5 ? GREEN : alpha.latest.ofi < -0.5 ? RED : "#cfe0f5", note: alpha.latest.ofi > 0.5 ? "buy pressure" : alpha.latest.ofi < -0.5 ? "sell pressure" : "neutral" },
                { l: "Realized skew z", v: f(alpha.latest.skew), c: alpha.latest.skew < -0.5 ? RED : alpha.latest.skew > 0.5 ? GREEN : "#cfe0f5", note: alpha.latest.skew < -0.5 ? "fear" : alpha.latest.skew > 0.5 ? "calm" : "neutral" },
                { l: "Crowding", v: `${f(alpha.latest.crowd)}×`, c: alpha.latest.crowd > 1.3 ? RED : alpha.latest.crowd > 1.1 ? GOLD : GREEN, note: alpha.crowd_status },
                { l: "Crowd weight", v: `${(alpha.latest.crowd_weight * 100).toFixed(0)}%`, c: ACCENT },
                { l: "Active signals", v: String(alpha.latest.active_signals), c: "#cfe0f5", note: `of ${alpha.latest.n_signals}` },
                { l: "Best IC weight", v: f(alpha.latest.best_ic_weight, 4), c: VIOLET },
              ].map((k) => <Sub key={k.l} {...k} />)}
        </motion.div>

        {/* ── 📊 IC-Weighted Combined Signal ── */}
        <motion.div {...revealProps(0.05)} className="mt-4">
          <Panel title="📊 IC-Weighted Combined Signal"
            sub="Each signal is weighted by its Spearman IC against forward returns. Negative-IC signals are excluded outright; the rest are averaged and discretised.">
            {aLoading && !alpha ? <Skeleton h={280} /> : alpha ? (
              <>
                <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      IC weights — {alpha.fwd_days}d forward return
                    </div>
                    <div className="space-y-2.5">
                      {Object.entries(alpha.ic_weights).sort((a, b) => b[1] - a[1]).map(([name, w]) => (
                        <div key={name} className="flex items-center gap-3">
                          <span className="w-28 shrink-0 font-mono text-[11.5px] text-white">{name}</span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/8">
                            <motion.div className="h-full rounded-full"
                              style={{ background: w > 0 ? GREEN : "rgba(138,166,200,0.4)" }}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, (w / Math.max(...Object.values(alpha.ic_weights), 0.0001)) * 100)}%` }}
                              transition={{ duration: 0.8 }} />
                          </div>
                          <span className="w-16 shrink-0 text-right font-mono text-[11.5px] font-bold"
                            style={{ color: w > 0 ? GREEN : "#8aa6c8" }}>{w.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      IC vs {alpha.fwd_days}d forward returns
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-white/8">
                      <table className="w-full border-collapse text-left">
                        <thead className="bg-ink/70"><tr>
                          {["Signal", "IC", "Used"].map((h) => (
                            <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {[...alpha.signal_ic].sort((a, b) => b.ic - a.ic).map((r) => (
                            <tr key={r.signal} className="hover:bg-white/[0.03]">
                              <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-white">{r.signal}</td>
                              <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                                style={{ color: r.ic > 0.05 ? GREEN : r.ic > 0 ? GOLD : RED }}>{r.ic.toFixed(4)}</td>
                              <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]">{r.used ? "✅" : "❌"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Combined signal on price — {alpha.ticker}
                  </div>
                  <LineChart height={250} labels={aLabels} yFormat={(v) => v.toFixed(0)}
                    series={marked("combined", GREEN, RED, "Combined buy", "Combined sell")} />
                  <Legend items={[
                    { color: "rgba(255,255,255,0.65)", label: "Close" },
                    { color: GREEN, label: "Combined buy" },
                    { color: RED, label: "Combined sell" },
                  ]} />
                </div>
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── 🌊 Volume Pressure ── */}
        <motion.div {...revealProps(0.07)} className="mt-4">
          <Panel title="🌊 Volume Pressure (OFI Proxy)"
            sub="Net buying vs selling pressure normalised by volume. ⚠️ True Order Flow Imbalance (Kolm et al. 2023) needs Level-2 tick data — this is a daily-OHLCV proxy, not the same thing.">
            {aLoading && !alpha ? <Skeleton h={260} /> : alpha ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Sub l="Volume pressure z (latest)" v={f(alpha.latest.ofi, 3)} c={ACCENT} />
                  <Sub l="Signal"
                    v={alpha.latest.ofi > alpha.ofi_threshold ? "BUY" : alpha.latest.ofi < -alpha.ofi_threshold ? "SELL" : "HOLD"}
                    c={alpha.latest.ofi > alpha.ofi_threshold ? GREEN : alpha.latest.ofi < -alpha.ofi_threshold ? RED : GOLD}
                    note={`threshold ±${alpha.ofi_threshold.toFixed(1)}`} />
                  <Sub l={`Volume pressure IC (${alpha.fwd_days}d)`}
                    v={f(alpha.signal_ic.find((x) => x.signal === "OFI")?.ic, 4)}
                    c={Math.abs(alpha.signal_ic.find((x) => x.signal === "OFI")?.ic ?? 0) > 0.05 ? GREEN : "#8aa6c8"}
                    note={Math.abs(alpha.signal_ic.find((x) => x.signal === "OFI")?.ic ?? 0) > 0.05 ? "signal" : "noise"} />
                </div>

                <div className="mt-4">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Volume pressure z-score vs ±{alpha.ofi_threshold.toFixed(1)} thresholds
                  </div>
                  <LineChart height={200} zeroLine labels={aLabels} yFormat={(v) => v.toFixed(1)}
                    series={[
                      { label: "OFI z", color: ACCENT, values: A.map((r) => gv(r, "ofi_z")) },
                      { label: "+thr", color: "rgba(0,245,160,0.45)", values: A.map(() => alpha.ofi_threshold), dashed: true },
                      { label: "-thr", color: "rgba(255,84,112,0.45)", values: A.map(() => -alpha.ofi_threshold), dashed: true },
                    ]} />
                </div>

                <div className="mt-4">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Buy volume vs sell volume (up-close bars minus down-close bars)
                  </div>
                  <LineChart height={170} zeroLine labels={aLabels}
                    yFormat={(v) => `${(v / 1e6).toFixed(0)}M`}
                    series={[
                      { label: "Buy volume", color: GREEN, values: A.map((r) => gv(r, "buy_vol")) },
                      { label: "Sell volume", color: RED, values: A.map((r) => { const v = gv(r, "sell_vol"); return v == null ? null : -v; }) },
                    ]} />
                  <Legend items={[{ color: GREEN, label: "Buy volume" }, { color: RED, label: "Sell volume (negated)" }]} />
                </div>
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── 😰 Realized Skew ── */}
        <motion.div {...revealProps(0.09)} className="mt-4">
          <Panel title="😰 Realized Skew Signal (IV Skew Proxy)"
            sub="⚠️ Proxy disclosure: true IV skew needs an options chain. This uses realized return skewness and down-day frequency as a stand-in for the same fear options price. Höfler (2024); Bakshi, Kapadia & Madan (2003).">
            {aLoading && !alpha ? <Skeleton h={260} /> : alpha ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Sub l="Skew z (latest)" v={f(alpha.latest.skew, 3)} c={ORANGE} />
                  <Sub l="Signal"
                    v={alpha.latest.skew < -alpha.skew_threshold ? "SELL (fear)" : alpha.latest.skew > alpha.skew_threshold ? "BUY (calm)" : "HOLD"}
                    c={alpha.latest.skew < -alpha.skew_threshold ? RED : alpha.latest.skew > alpha.skew_threshold ? GREEN : GOLD}
                    note={`threshold ±${alpha.skew_threshold.toFixed(1)}`} />
                  <Sub l={`Skew IC (${alpha.fwd_days}d)`}
                    v={f(alpha.signal_ic.find((x) => x.signal === "Realized Skew")?.ic, 4)} c={VIOLET} />
                </div>

                <div className="mt-4">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Fear / calm markers on price
                  </div>
                  <LineChart height={220} labels={aLabels} yFormat={(v) => v.toFixed(0)}
                    series={marked("skew_sig", GREEN, ORANGE, "Calm (buy)", "Fear (sell)")} />
                  <Legend items={[
                    { color: "rgba(255,255,255,0.65)", label: "Close" },
                    { color: GREEN, label: "Calm (buy)" },
                    { color: ORANGE, label: "Fear (sell)" },
                  ]} />
                </div>

                <div className="mt-4">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">Skew z-score</div>
                  <LineChart height={180} zeroLine labels={aLabels} yFormat={(v) => v.toFixed(1)}
                    series={[
                      { label: "Skew z", color: ORANGE, values: A.map((r) => gv(r, "skew_z")) },
                      { label: "+thr", color: "rgba(0,245,160,0.45)", values: A.map(() => alpha.skew_threshold), dashed: true },
                      { label: "-thr", color: "rgba(255,138,92,0.45)", values: A.map(() => -alpha.skew_threshold), dashed: true },
                    ]} />
                </div>
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── 🏭 Crowding ── */}
        <motion.div {...revealProps(0.11)} className="mt-4">
          <Panel title="🏭 Factor Crowding Detector"
            sub="Hua & Sun (2024): crowded trades unwind violently. Detected as recent volatility running far above the long-run level.">
            {aLoading && !alpha ? <Skeleton h={250} /> : alpha ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Sub l="Crowding score" v={`${f(alpha.latest.crowd, 3)}×`}
                    c={alpha.latest.crowd > 1.3 ? RED : alpha.latest.crowd > 1.1 ? GOLD : GREEN}
                    note={alpha.latest.crowd > 1.3 ? "danger zone" : "OK"} />
                  <Sub l="Status" v={alpha.crowd_status} />
                  <Sub l="Position weight scalar" v={`${(alpha.latest.crowd_weight * 100).toFixed(0)}%`} c={ACCENT} />
                  <Sub l="Suggested action" v={alpha.crowd_action}
                    c={alpha.latest.crowd > 1.1 ? GOLD : GREEN} />
                </div>

                <div className="mt-4">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Crowding score over time
                  </div>
                  <LineChart height={200} labels={aLabels} yFormat={(v) => `${v.toFixed(2)}×`}
                    series={[
                      { label: "Crowding", color: GOLD, values: A.map((r) => gv(r, "crowd")) },
                      { label: "Overcrowded 1.3", color: "rgba(255,84,112,0.5)", values: A.map(() => 1.3), dashed: true },
                      { label: "Elevated 1.1", color: "rgba(255,138,92,0.4)", values: A.map(() => 1.1), dashed: true },
                      { label: "Undercrowded 0.8", color: "rgba(0,245,160,0.4)", values: A.map(() => 0.8), dashed: true },
                    ]} />
                  <Legend items={[
                    { color: GOLD, label: "Crowding score" },
                    { color: "rgba(255,84,112,0.5)", label: "Overcrowded (1.3)" },
                    { color: "rgba(0,245,160,0.4)", label: "Undercrowded (0.8)" },
                  ]} />
                </div>

                <div className="mt-6 border-t border-white/10 pt-5">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    Multi-ticker crowding comparison
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <input value={crowdTickers} onChange={(e) => setCrowdTickers(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") loadCrowding(); }}
                      className="min-w-[260px] flex-1 rounded-[10px] border border-white/12 bg-ink/60 px-3 py-2 font-mono text-[13px] text-white outline-none focus:border-white/40" />
                    <button onClick={loadCrowding} disabled={cLoading}
                      className="hv-btn rounded-[10px] border px-4 py-2 font-mono text-[11.5px] uppercase tracking-widest disabled:opacity-60"
                      style={{ borderColor: `${ACCENT}70`, background: `${ACCENT}14`, color: ACCENT }}>
                      {cLoading ? "Loading…" : "Compare"}
                    </button>
                  </div>

                  {cLoading && !crowdCmp ? <div className="mt-4"><Skeleton h={160} /></div>
                    : (crowdCmp?.rows.length ?? 0) === 0 ? (
                      <p className="mt-4 text-[13px] text-hazedim">Enter at least two tickers to compare.</p>
                    ) : (
                      <div className="mt-4 overflow-x-auto rounded-lg border border-white/8">
                        <table className="w-full border-collapse text-left">
                          <thead className="bg-ink/70"><tr>
                            {Object.keys(crowdCmp!.rows[0]).map((h) => (
                              <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {crowdCmp!.rows.map((r, i) => (
                              <tr key={i} className="hover:bg-white/[0.03]">
                                {Object.entries(r).map(([k, v]) => {
                                  const n = Number(v);
                                  const col = k.toLowerCase().includes("crowding") && Number.isFinite(n)
                                    ? (n > 1.3 ? RED : n > 1.1 ? GOLD : GREEN)
                                    : "#cfe0f5";
                                  return (
                                    <td key={k} className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]" style={{ color: col }}>
                                      {typeof v === "number" ? v.toFixed(3) : String(v ?? "—")}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                </div>
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── ❤️ Signal Health ── */}
        <motion.div {...revealProps(0.13)} className="mt-4">
          <Panel title="❤️ Signal Health & Alpha Decay Monitor"
            sub="AlphaAgent (KDD 2025); Harvey, Liu & Zhu (2016) — most discovered factors are false positives. Health above 75 is healthy, below 25 is a kill signal.">
            {hLoading && !healthRows.length ? <Skeleton h={280} /> : healthRows.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-hazedim">Signal health unavailable for this window.</p>
            ) : (
              <>
                <div className="space-y-2.5">
                  {healthRows.map((r) => (
                    <div key={r.Signal} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 font-mono text-[11.5px] text-white">{r.Signal}</span>
                      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-white/8">
                        <motion.div className="h-full rounded-full"
                          style={{ background: r.Health >= 75 ? GREEN : r.Health >= 50 ? GOLD : r.Health >= 25 ? ORANGE : RED }}
                          initial={{ width: 0 }} animate={{ width: `${r.Health}%` }} transition={{ duration: 0.8 }} />
                        <div className="absolute top-0 h-full w-px bg-white/30" style={{ left: "75%" }} />
                        <div className="absolute top-0 h-full w-px bg-white/30" style={{ left: "25%" }} />
                      </div>
                      <span className="w-14 shrink-0 text-right font-mono text-[11.5px] font-bold"
                        style={{ color: r.Health >= 75 ? GREEN : r.Health >= 50 ? GOLD : r.Health >= 25 ? ORANGE : RED }}>
                        {r.Health.toFixed(1)}
                      </span>
                      <span className="w-28 shrink-0 font-mono text-[11px] text-hazedim">{r.Status}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 font-mono text-[10px] text-hazedim">
                  Ticks mark the kill threshold (25) and the healthy line (75).
                </p>

                <div className="mt-4 overflow-x-auto rounded-lg border border-white/8">
                  <table className="w-full border-collapse text-left">
                    <thead className="bg-ink/70"><tr>
                      {["Signal", "Health", "Status", "IC Mean", "IC Std", "IC Trend", "Weight"].map((h) => (
                        <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {healthRows.map((r) => (
                        <tr key={r.Signal} className="hover:bg-white/[0.03]">
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-white">{r.Signal}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                            style={{ color: r.Health >= 75 ? GREEN : r.Health >= 25 ? GOLD : RED }}>{r.Health.toFixed(1)}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-haze">{r.Status}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                            style={{ color: r["IC Mean"] >= 0 ? GREEN : RED }}>{r["IC Mean"].toFixed(4)}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-hazedim">{r["IC Std"].toFixed(4)}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                            style={{ color: r["IC Trend"] >= 0 ? GREEN : RED }}>{r["IC Trend"].toFixed(6)}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-hazedim">{(r.Weight * 100).toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {bestIc.ic.length > 0 && (
                  <div className="mt-5">
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                      Rolling 63d IC — {bestHealth?.Signal} (healthiest signal) with its trend line
                    </div>
                    <LineChart height={210} zeroLine yFormat={(v) => v.toFixed(2)}
                      series={[
                        { label: "Rolling IC", color: ACCENT, values: bestIc.ic },
                        { label: "IC trend", color: ORANGE, values: bestIc.trend, dashed: true },
                        { label: "IC = 0.05", color: "rgba(0,245,160,0.4)", values: bestIc.ic.map(() => 0.05), dashed: true },
                      ]} />
                    <Legend items={[
                      { color: ACCENT, label: "Rolling 63d IC" },
                      { color: ORANGE, label: "IC trend (least squares)" },
                      { color: "rgba(0,245,160,0.4)", label: "IC = 0.05 (meaningful)" },
                    ]} />
                  </div>
                )}
              </>
            )}
          </Panel>
        </motion.div>

        {/* ── 🌍 Macro Regime ── */}
        <motion.div {...revealProps(0.15)} className="mt-4">
          <Panel title="🌍 Cross-Asset Macro Regime Signal"
            sub="VIX, credit spreads, the dollar and the yield curve folded into one risk-on / risk-off score.">
            {mLoading && !macro ? <Skeleton h={200} /> : macro?.available === false ? (
              <p className="py-6 text-center text-[13.5px] text-hazedim">{macro.note}</p>
            ) : macro ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Sub l="Macro score" v={f(macro.score)} c={(macro.score ?? 0) >= 0.25 ? GREEN : (macro.score ?? 0) <= -0.25 ? RED : GOLD} />
                  <Sub l="Regime" v={String(macro.label ?? "—")} />
                  <Sub l="Position scalar" v={`${((macro.position_scalar ?? 0) * 100).toFixed(0)}%`} c={ACCENT} />
                  <Sub l="VIX (latest)" v={f(macro.vix, 1)} c={(macro.vix ?? 0) > 25 ? RED : "#cfe0f5"} />
                </div>
                {macroSeries.length > 0 && (
                  <div className="mt-4">
                    <LineChart height={210} zeroLine labels={macroSeries.map(label)}
                      yFormat={(v) => v.toFixed(1)}
                      series={[
                        { label: "Macro score", color: VIOLET, values: macroSeries.map((r) => gv(r, "v")) },
                        { label: "Risk-on", color: "rgba(0,245,160,0.4)", values: macroSeries.map(() => 1), dashed: true },
                        { label: "Risk-off", color: "rgba(255,84,112,0.4)", values: macroSeries.map(() => -1), dashed: true },
                      ]} />
                    <Legend items={[
                      { color: VIOLET, label: "Macro regime score" },
                      { color: "rgba(0,245,160,0.4)", label: "Risk-on (+1)" },
                      { color: "rgba(255,84,112,0.4)", label: "Risk-off (−1)" },
                    ]} />
                  </div>
                )}
              </>
            ) : null}
          </Panel>
        </motion.div>

        {/* ── indicator panels (unchanged) ── */}
        <motion.div {...revealProps(0.17)} className="mt-4 grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Panel title="Indicator stance" sub="Combined signal from the classic indicators">
            {loading && !latest ? <Skeleton h={150} /> : latest && (
              <div className="text-center">
                <div className="text-[44px] font-bold leading-none" style={{ color: s.c }}>{s.icon}</div>
                <div className="mt-2 text-[26px] font-bold" style={{ color: s.c }}>{stance}</div>
                <div className="mt-1 text-[12.5px] text-hazedim">{s.note}</div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                  {[
                    { k: "RSI", v: latest.rsi?.toFixed(1) ?? "—", sig: latest.rsi_signal },
                    { k: "MACD", v: latest.macd?.toFixed(3) ?? "—", sig: latest.macd_signal },
                    { k: "Bollinger", v: latest.close?.toFixed(2) ?? "—", sig: latest.bb_signal },
                    { k: "Dual MA", v: "cross", sig: latest.dual_ma_signal },
                  ].map((r) => (
                    <div key={r.k} className="rounded-lg border border-white/10 bg-ink/50 px-2.5 py-2">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-hazedim">{r.k}</div>
                      <div className="mt-0.5 flex items-baseline justify-between">
                        <span className="font-mono text-[12.5px] text-white">{r.v}</span>
                        <span className="font-mono text-[10px] font-bold"
                          style={{ color: r.sig > 0 ? GREEN : r.sig < 0 ? RED : "#8aa6c8" }}>
                          {r.sig > 0 ? "BUY" : r.sig < 0 ? "SELL" : "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Price & Bollinger Bands" sub="Close price with upper / lower bands">
            {loading && !rows.length ? <Skeleton h={240} /> : (
              <>
                <LineChart height={250} labels={rows.map((r) => r.date)}
                  series={[
                    { label: "Close", color: ACCENT, values: rows.map((r) => r.close) },
                    { label: "BB Upper", color: VIOLET, values: rows.map((r) => r.bb_upper), dashed: true },
                    { label: "BB Lower", color: GREEN, values: rows.map((r) => r.bb_lower), dashed: true },
                  ]} />
                <Legend items={[{ color: ACCENT, label: "Close" }, { color: VIOLET, label: "BB Upper" }, { color: GREEN, label: "BB Lower" }]} />
              </>
            )}
          </Panel>
        </motion.div>

        <motion.div {...revealProps(0.19)} className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="RSI (14)" sub="Oversold below 30 · overbought above 70">
            {loading && !rows.length ? <Skeleton h={190} /> : (
              <LineChart height={190} labels={rows.map((r) => r.date)} yFormat={(v) => v.toFixed(0)}
                series={[{ label: "RSI", color: GOLD, values: rows.map((r) => r.rsi) }]} />
            )}
          </Panel>
          <Panel title="MACD" sub="MACD line · signal line">
            {loading && !rows.length ? <Skeleton h={190} /> : (
              <>
                <LineChart height={190} zeroLine labels={rows.map((r) => r.date)} yFormat={(v) => v.toFixed(1)}
                  series={[
                    { label: "MACD", color: ACCENT, values: rows.map((r) => r.macd) },
                    { label: "Signal", color: VIOLET, values: rows.map((r) => r.signal_line), dashed: true },
                  ]} />
                <Legend items={[{ color: ACCENT, label: "MACD" }, { color: VIOLET, label: "Signal" }]} />
              </>
            )}
          </Panel>
        </motion.div>

        <motion.div {...revealProps(0.21)} className="mt-4">
          <Panel title="Recent signal events" sub="Most recent days where the combined indicator signal fired">
            {loading && !recent.length ? <Skeleton h={200} /> : recent.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-hazedim">No non-neutral signals in this window.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-white/8">
                <table className="w-full min-w-[520px] border-collapse text-left">
                  <thead className="bg-ink/70"><tr>
                    {["Date", "Close", "RSI", "MACD", "Signal"].map((h) => (
                      <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {recent.map((r) => {
                      const buy = r.combined > 0;
                      return (
                        <tr key={r.date} className="transition-colors hover:bg-white/[0.03]">
                          <td className="border-b border-white/[0.05] px-3 py-2 font-mono text-[12px] text-hazedim">{r.date}</td>
                          <td className="border-b border-white/[0.05] px-3 py-2 font-mono text-[12px] text-white">${r.close?.toFixed(2) ?? "—"}</td>
                          <td className="border-b border-white/[0.05] px-3 py-2 font-mono text-[12px] text-white/75">{r.rsi?.toFixed(1) ?? "—"}</td>
                          <td className="border-b border-white/[0.05] px-3 py-2 font-mono text-[12px] text-white/75">{r.macd?.toFixed(3) ?? "—"}</td>
                          <td className="border-b border-white/[0.05] px-3 py-2 font-mono text-[12px] font-bold"
                            style={{ color: buy ? GREEN : RED }}>{buy ? "BUY ▲" : "SELL ▼"}</td>
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
          Indicator signals from core.indicators; the alpha stack from core.alpha_engine. Not financial advice.
        </p>
      </section>
    </>
  );
}
