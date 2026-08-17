"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  api,
  ApiError,
  downsample,
  fmtVolume,
  sma,
  toNumber,
  type DataEngine,
  type FrameMeta,
  type IndicatorRow,
  type Metrics,
} from "@/lib/api";
import { revealProps } from "../motion";
import { DataEngineBar } from "./DataEngineBar";
import { ApiDown, ModuleHeader, Panel, Skeleton, StatRow, IdleState } from "./Shell";

/* ──────────────────────────────────────────────────────────────────────────
   DASHBOARD MODULE — the same layout as the Streamlit Dashboard page:
     Row 1 · Price Chart (candles · moving averages · volume)
             RSI & MACD Indicators
     Row 2 · Key Metrics            | Risk & Return Snapshot
     Row 3 · Recent OHLCV (last 30 sessions, coloured by direction)

   Every number is computed by the Python core and read over /api — nothing is
   recalculated here.
   ────────────────────────────────────────────────────────────────────────── */

const ACCENT = "#00f5a0";

function yearsAgo(years: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/* ── Candlestick + moving averages + volume ──────────────────────────────── */
function PriceChart({ rows }: { rows: IndicatorRow[] }) {
  const pts = useMemo(() => downsample(rows, 130), [rows]);
  if (pts.length < 2) return null;

  const W = 940;
  const H = 300;
  const VH = 62; // volume band height
  const PAD = { l: 54, r: 12, t: 12, b: 20 };
  const priceH = H - VH - PAD.t - PAD.b;

  const highs = pts.map((p) => p.High);
  const lows = pts.map((p) => p.Low);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = max - min || 1;
  const maxVol = Math.max(...pts.map((p) => p.Volume || 0)) || 1;

  const closes = pts.map((p) => p.Close);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);

  const step = (W - PAD.l - PAD.r) / pts.length;
  const bw = Math.max(1.4, Math.min(7, step * 0.62));
  const x = (i: number) => PAD.l + i * step + step / 2;
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * priceH;
  const vy = (v: number) => H - PAD.b - (v / maxVol) * VH;

  const path = (vals: (number | null)[]) => {
    let d = "";
    let started = false;
    vals.forEach((v, i) => {
      if (v == null) return;
      d += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      started = true;
    });
    return d;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
        const v = min + f * span;
        return (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" />
            <text x={PAD.l - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#8aa6c8" fontFamily="monospace">
              {v.toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* volume bars */}
      {pts.map((p, i) => (
        <rect
          key={`v${i}`}
          x={x(i) - bw / 2}
          y={vy(p.Volume || 0)}
          width={bw}
          height={Math.max(0, H - PAD.b - vy(p.Volume || 0))}
          fill={p.Close >= p.Open ? "#00f5a0" : "#ff5470"}
          opacity={0.22}
        />
      ))}

      {/* candles */}
      {pts.map((p, i) => {
        const up = p.Close >= p.Open;
        const c = up ? "#00f5a0" : "#ff5470";
        const yO = y(p.Open);
        const yC = y(p.Close);
        return (
          <g key={`c${i}`}>
            <line x1={x(i)} x2={x(i)} y1={y(p.High)} y2={y(p.Low)} stroke={c} strokeWidth="1" opacity={0.85} />
            <rect
              x={x(i) - bw / 2}
              y={Math.min(yO, yC)}
              width={bw}
              height={Math.max(1.2, Math.abs(yC - yO))}
              fill={c}
              opacity={0.9}
            />
          </g>
        );
      })}

      {/* moving averages */}
      <motion.path d={path(ma20)} fill="none" stroke="#0be0ff" strokeWidth="1.6"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
      <motion.path d={path(ma50)} fill="none" stroke="#a55efd" strokeWidth="1.6"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />

      {[0, Math.floor(pts.length / 2), pts.length - 1].map((i) => (
        <text key={`d${i}`} x={x(i)} y={H - 5}
          textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}
          fontSize="10" fill="#8aa6c8" fontFamily="monospace">
          {pts[i].Date.slice(0, 7)}
        </text>
      ))}
    </svg>
  );
}

/* ── RSI + MACD ──────────────────────────────────────────────────────────── */
function RsiMacdChart({ rows }: { rows: IndicatorRow[] }) {
  const pts = useMemo(() => downsample(rows.filter((r) => r.RSI != null), 140), [rows]);
  if (pts.length < 2) return null;

  const W = 940;
  const RH = 118;
  const MH = 118;
  const GAP = 22;
  const H = RH + GAP + MH;
  const PAD = { l: 44, r: 12 };
  const step = (W - PAD.l - PAD.r) / (pts.length - 1);
  const x = (i: number) => PAD.l + i * step;

  const ry = (v: number) => 8 + (1 - v / 100) * (RH - 16);
  const rsiPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${ry(p.RSI ?? 50).toFixed(1)}`).join(" ");

  const macdVals = pts.flatMap((p) => [p.MACD ?? 0, p.Signal ?? 0, p.Histogram ?? 0]);
  const mMax = Math.max(...macdVals.map(Math.abs)) || 1;
  const mTop = RH + GAP;
  const my = (v: number) => mTop + MH / 2 - (v / mMax) * (MH / 2 - 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* RSI band */}
      {[30, 50, 70].map((lv) => (
        <g key={lv}>
          <line x1={PAD.l} x2={W - PAD.r} y1={ry(lv)} y2={ry(lv)}
            stroke={lv === 50 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.13)"}
            strokeDasharray={lv === 50 ? "" : "3 3"} />
          <text x={PAD.l - 6} y={ry(lv) + 3.5} textAnchor="end" fontSize="9.5" fill="#8aa6c8" fontFamily="monospace">
            {lv}
          </text>
        </g>
      ))}
      <rect x={PAD.l} y={ry(70)} width={W - PAD.l - PAD.r} height={Math.max(0, ry(100) - ry(70))} fill="#ff5470" opacity={0.05} />
      <rect x={PAD.l} y={ry(30)} width={W - PAD.l - PAD.r} height={Math.max(0, ry(0) - ry(30))} fill="#00f5a0" opacity={0.05} />
      <motion.path d={rsiPath} fill="none" stroke="#ffd700" strokeWidth="1.6"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
      <text x={PAD.l} y={11} fontSize="9.5" fill="#8aa6c8" fontFamily="monospace">RSI (14)</text>

      {/* MACD */}
      <line x1={PAD.l} x2={W - PAD.r} y1={my(0)} y2={my(0)} stroke="rgba(255,255,255,0.12)" />
      {pts.map((p, i) => {
        const h = p.Histogram ?? 0;
        return (
          <rect key={`h${i}`} x={x(i) - Math.max(1, step * 0.3)} y={Math.min(my(0), my(h))}
            width={Math.max(1.4, step * 0.6)} height={Math.max(0.8, Math.abs(my(h) - my(0)))}
            fill={h >= 0 ? "#00f5a0" : "#ff5470"} opacity={0.5} />
        );
      })}
      <path d={pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${my(p.MACD ?? 0).toFixed(1)}`).join(" ")}
        fill="none" stroke="#0be0ff" strokeWidth="1.6" />
      <path d={pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${my(p.Signal ?? 0).toFixed(1)}`).join(" ")}
        fill="none" stroke="#a55efd" strokeWidth="1.4" strokeDasharray="4 3" />
      <text x={PAD.l} y={mTop + 11} fontSize="9.5" fill="#8aa6c8" fontFamily="monospace">MACD (12,26,9)</text>
    </svg>
  );
}

function Legend({ items }: { items: { c: string; l: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 font-mono text-[10.5px] text-hazedim">
      {items.map((i) => (
        <span key={i.l} className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-4 rounded-full" style={{ background: i.c }} />
          {i.l}
        </span>
      ))}
    </div>
  );
}

/* ── Module ──────────────────────────────────────────────────────────────── */
export function DashboardModule() {
  const [ticker, setTicker] = useState("GOOG");
  const [engine, setEngine] = useState<DataEngine>({
    live: false,
    start: yearsAgo(3),
    interval: "1m",
    lookback: "1d",
    refreshSeconds: 60,
  });
  const [rows, setRows] = useState<IndicatorRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [meta, setMeta] = useState<FrameMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // manual/auto refresh trigger
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (t: string, e: DataEngine) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const [ind, met] = await Promise.all([
        api.indicators(t, e, ac.signal),
        api.metrics(t, e, ac.signal),
      ]);
      setRows(ind.data);
      setMeta(ind.meta ?? null);
      setMetrics(met);
      setLoading(false);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError(err instanceof ApiError ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  // Nothing is fetched until the user presses Run — opening the page is free.
  useEffect(() => {
    if (tick === 0) return;
    if (ticker) load(ticker, engine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // Live Mode auto-refresh, exactly like the Streamlit refresh timer.
  useEffect(() => {
    if (!engine.live) return;
    const id = setInterval(() => setTick((n) => n + 1), engine.refreshSeconds * 1000);
    return () => clearInterval(id);
  }, [engine.live, engine.refreshSeconds]);

  const last = rows.at(-1);
  const prev = rows.at(-2);
  const chg = last && prev ? ((last.Close - prev.Close) / prev.Close) * 100 : null;
  const recent = useMemo(() => rows.slice(-30).reverse(), [rows]);
  const m = (k: string) => metrics?.[k] ?? "—";
  const tone = (k: string, good = 0): "pos" | "neg" => ((toNumber(metrics?.[k]) ?? 0) >= good ? "pos" : "neg");

  return (
    <>
      <ModuleHeader
        n="05"
        title="Dashboard"
        accent={ACCENT}
        subtitle="Price action, momentum and the full risk picture for a single instrument — every figure computed by the AlphaForge Python engine."
        right={
          meta && (
            <span
              className="rounded-full border px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-widest"
              style={
                meta.source === "real"
                  ? { color: ACCENT, borderColor: `${ACCENT}55`, background: `${ACCENT}0f` }
                  : { color: "#ffd700", borderColor: "#ffd70055", background: "#ffd7000f" }
              }
            >
              ● {meta.badge}
            </span>
          )
        }
      />

      <section className="mx-auto max-w-6xl px-6 py-10">
        {/* Data Engine — ticker input + Static/Live mode */}
        <DataEngineBar
          ticker={ticker}
          onTicker={setTicker}
          engine={engine}
          onEngine={setEngine}
          meta={meta}
          loading={loading}
          onRefresh={() => setTick((n) => n + 1)}
        />

        {error && <div className="mt-6"><ApiDown message={error} /></div>}

        {tick === 0 ? (
          <IdleState onRun={() => setTick((n) => n + 1)} accent={ACCENT}
            label="Load dashboard"
            note="Pick a ticker and load it. Nothing is fetched until you ask." />
        ) : (
        <>

        {/* live strip */}
        <motion.div {...revealProps()} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {loading && !last
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={74} />)
            : last && (
                <>
                  <Tile label="Last close" value={`$${last.Close.toFixed(2)}`}
                    sub={chg != null ? `${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(2)}%` : undefined}
                    tone={chg != null && chg >= 0 ? "pos" : "neg"} />
                  <Tile label="Volume" value={fmtVolume(last.Volume)} />
                  <Tile label="RSI (14)" value={last.RSI != null ? last.RSI.toFixed(1) : "—"}
                    sub={last.RSI == null ? undefined : last.RSI < 30 ? "oversold" : last.RSI > 70 ? "overbought" : "neutral"}
                    tone={last.RSI == null ? undefined : last.RSI < 30 ? "pos" : last.RSI > 70 ? "neg" : undefined} />
                  <Tile label="MACD" value={last.MACD != null ? last.MACD.toFixed(3) : "—"}
                    sub={last.MACD != null && last.Signal != null ? (last.MACD > last.Signal ? "above signal" : "below signal") : undefined}
                    tone={last.MACD != null && last.Signal != null ? (last.MACD > last.Signal ? "pos" : "neg") : undefined} />
                  <Tile label="Ann. volatility" value={m("Ann. Volatility")} />
                </>
              )}
        </motion.div>

        {/* Row 1 */}
        <motion.div {...revealProps(0.05)} className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="Price Chart" sub="Candles · Moving averages · Volume">
            {loading && !rows.length ? <Skeleton h={260} /> : (
              <>
                <PriceChart rows={rows} />
                <div className="mt-2">
                  <Legend items={[{ c: "#0be0ff", l: "MA 20" }, { c: "#a55efd", l: "MA 50" }, { c: "#00f5a0", l: "up" }, { c: "#ff5470", l: "down" }]} />
                </div>
              </>
            )}
          </Panel>

          <Panel title="RSI & MACD Indicators" sub="Momentum · Trend divergence · Histogram">
            {loading && !rows.length ? <Skeleton h={260} /> : (
              <>
                <RsiMacdChart rows={rows} />
                <div className="mt-2">
                  <Legend items={[{ c: "#ffd700", l: "RSI" }, { c: "#0be0ff", l: "MACD" }, { c: "#a55efd", l: "Signal" }]} />
                </div>
              </>
            )}
          </Panel>
        </motion.div>

        {/* Row 2 */}
        <motion.div {...revealProps(0.1)} className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="Key Metrics" sub="Core performance numbers">
            {loading && !metrics ? <Skeleton h={180} /> : (
              <div>
                <StatRow label="Sharpe" desc="Risk-adjusted return" value={m("Sharpe")} tone={tone("Sharpe")} />
                <StatRow label="Sortino" desc="Downside-risk adjusted return" value={m("Sortino")} tone={tone("Sortino")} />
                <StatRow label="Max Drawdown" desc="Largest peak-to-trough decline" value={m("Max Drawdown")} tone="neg" />
                <StatRow label="Win Rate" desc="Share of positive periods" value={m("Win Rate")} tone="neutral" />
              </div>
            )}
          </Panel>

          <Panel title="Risk & Return Snapshot" sub="Return · Drawdown · VaR · CVaR">
            {loading && !metrics ? <Skeleton h={180} /> : (
              <div>
                <StatRow label="CAGR" desc="Compound annual growth rate" value={m("CAGR")} tone={tone("CAGR")} />
                <StatRow label="Ann. Return" desc="Arithmetic annual return" value={m("Ann. Return")} tone={tone("Ann. Return")} />
                <StatRow label="Ann. Volatility" desc="Annualised standard deviation" value={m("Ann. Volatility")} tone="neutral" />
                <StatRow label="Calmar" desc="CAGR divided by max drawdown" value={m("Calmar")} tone={tone("Calmar")} />
                <StatRow label="VaR 95%" desc="One-day 95% value at risk" value={m("VaR 95% (Hist)")} tone="neg" />
                <StatRow label="CVaR 95%" desc="Expected shortfall beyond VaR" value={m("CVaR 95% (Hist)")} tone="neg" />
              </div>
            )}
          </Panel>
        </motion.div>

        {/* Row 3 */}
        <motion.div {...revealProps(0.15)} className="mt-4">
          <Panel title="Recent OHLCV Data" sub="Latest 30 sessions — colour-coded by session direction">
            {loading && !rows.length ? <Skeleton h={240} /> : (
              <div className="max-h-[320px] overflow-auto rounded-lg border border-white/8">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead className="sticky top-0 bg-ink/90 backdrop-blur">
                    <tr>
                      {["Date", "Open", "High", "Low", "Close", "Volume"].map((h) => (
                        <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => {
                      const up = r.Close >= r.Open;
                      const c = up ? "#4ade80" : "#f87171";
                      return (
                        <tr key={r.Date} className="transition-colors hover:bg-white/[0.03]">
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[12px] text-hazedim">{r.Date}</td>
                          {[r.Open, r.High, r.Low, r.Close].map((v, i) => (
                            <td key={i} className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[12px]" style={{ color: c }}>
                              ${v.toFixed(2)}
                            </td>
                          ))}
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[12px] text-white/70">
                            {fmtVolume(r.Volume)}
                          </td>
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
          {meta
            ? `${meta.badge} · ${meta.mode}${meta.last_bar ? ` · dataset through ${meta.last_bar}` : ""}`
            : "Connecting to the AlphaForge engine…"}
        </p>
      </section>
    </>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "#00f5a0" : tone === "neg" ? "#ff5470" : "#e8f4fd";
  return (
    <div className="hv rounded-xl border border-white/10 bg-panel/45 px-4 py-3 backdrop-blur">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-hazedim">{label}</div>
      <div className="mt-1 text-[18px] font-semibold" style={{ color }}>{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[10.5px]" style={{ color: tone ? color : "#8aa6c8" }}>{sub}</div>}
    </div>
  );
}
