"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError, type Honesty } from "@/lib/api";
import { revealProps } from "../motion";
import { ApiDown, ModuleHeader, Panel, Skeleton, IdleState } from "./Shell";
import { TickerBar, yearsAgo } from "./TickerBar";

const ACCENT = "#00f5a0";
const STRATEGIES = ["Momentum", "Mean Reversion", "RSI", "MACD Crossover", "Dual MA"];

const PALETTE: Record<string, { c: string; bg: string; icon: string }> = {
  "PROBABLY REAL": { c: "#1f8f4e", bg: "rgba(31,143,78,0.12)", icon: "✅" },
  "LIKELY OVERFIT": { c: "#dc3232", bg: "rgba(220,50,50,0.12)", icon: "⛔" },
  INCONCLUSIVE: { c: "#e67e00", bg: "rgba(230,126,0,0.12)", icon: "⚠️" },
};

function Meter({ label, value, goodHigh, caption }: {
  label: string; value: number | null; goodHigh: boolean; caption: string;
}) {
  const has = value != null && Number.isFinite(value);
  const pct = has ? Math.max(0, Math.min(1, value!)) * 100 : 0;
  const score = goodHigh ? pct : 100 - pct;
  const color = !has ? "#546e8a" : score >= 70 ? "#1f8f4e" : score >= 40 ? "#e67e00" : "#dc3232";
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-semibold text-white/85">{label}</span>
        <span className="text-[14px] font-extrabold" style={{ color }}>{has ? `${pct.toFixed(0)}%` : "n/a"}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/8">
        <motion.div className="h-full rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}88` }}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9 }} />
      </div>
      <div className="mt-1 text-[11px] text-hazedim">{caption}</div>
    </div>
  );
}

function Answer({ q, a, detail, ok }: { q: string; a: string; detail: string; ok: boolean }) {
  const c = ok ? "#1f8f4e" : "#dc3232";
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${c}55`, background: `${c}14` }}>
      <div className="text-[12px] text-hazedim">{q}</div>
      <div className="mt-1 text-[20px] font-bold" style={{ color: c }}>{a}</div>
      <div className="mt-0.5 text-[11.5px] text-hazedim">{detail}</div>
    </div>
  );
}

export function HonestyModule() {
  const [ticker, setTicker] = useState("GOOG");
  const [start, setStart] = useState(yearsAgo(6));
  const [strategy, setStrategy] = useState("Momentum");
  const [rep, setRep] = useState<Honesty | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (t: string, s: string, strat: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null);
    try { setRep(await api.honesty(t, s, strat, ac.signal)); setLoading(false); }
    catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setError(e instanceof ApiError ? e.message : String(e)); setLoading(false);
    }
  }, []);

  // Nothing is fetched until the user presses Run — opening the page is free.
  useEffect(() => {
    if (tick === 0) return;
    load(ticker, start, strategy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const pal = rep ? PALETTE[rep.verdict] ?? PALETTE.INCONCLUSIVE : PALETTE.INCONCLUSIVE;

  return (
    <>
      <ModuleHeader
        n="01" title="Honesty Engine" accent={ACCENT}
        subtitle="The moat: Deflated Sharpe and Probability of Backtest Overfitting, corrected for how many strategies were tried — with a blunt verdict."
      />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <TickerBar ticker={ticker} onTicker={setTicker} start={start} onStart={setStart}
          loading={loading} onRefresh={() => setTick((n) => n + 1)} accent={ACCENT} />

        <div className="mt-3 flex flex-wrap gap-2">
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

        {error && <div className="mt-6"><ApiDown message={error} /></div>}

        {tick === 0 ? (
          <IdleState onRun={() => setTick((n) => n + 1)} accent={ACCENT}
            label="Run honesty check"
            note="Choose a ticker and strategy, then run the verdict. Nothing is computed until you ask." />
        ) : (
        <>

        {loading && !rep ? <div className="mt-4"><Skeleton h={260} /></div> : rep && (
          <>
            <motion.div {...revealProps()} className="mt-4 rounded-2xl border p-6"
              style={{ background: pal.bg, borderColor: pal.c, borderLeftWidth: 6 }}>
              <div className="font-mono text-[12px] font-extrabold tracking-[0.1em]" style={{ color: pal.c }}>
                {pal.icon} HONESTY VERDICT · {rep.verdict}
              </div>
              <div className="mt-1.5 text-[22px] font-bold text-white">{rep.headline}</div>
              <div className="mt-1 text-[13.5px] leading-6 text-haze">{rep.subtext}</div>
            </motion.div>

            <motion.div {...revealProps(0.05)} className="mt-4 grid gap-4 lg:grid-cols-2">
              <Panel title="Statistical confidence" sub="Corrected for luck and multiple testing">
                <Meter label="Confidence this edge is real" value={rep.dsr} goodHigh
                  caption={`Deflated Sharpe — after ${rep.n_trials} effective trial(s) on ${rep.n_obs} observations.`} />
                <Meter label="Risk it's just overfitting" value={rep.pbo} goodHigh={false}
                  caption="Probability of Backtest Overfitting — lower is better." />
                <div className="mt-4 rounded-lg border border-white/10 bg-ink/50 px-3 py-2.5 font-mono text-[11.5px] text-hazedim">
                  Headline Sharpe <span className="text-white">{rep.sharpe_ann.toFixed(2)}</span> vs a luck benchmark of{" "}
                  <span className="text-white">{rep.sr_benchmark_ann.toFixed(2)}</span>
                </div>
              </Panel>

              <Panel title="The blunt questions" sub="What actually decides whether you can trade it">
                <div className="space-y-3">
                  <Answer q="Would this have blown up your account?" a={rep.blew_up ? "YES" : "NO"}
                    detail={`${(rep.max_drawdown * 100).toFixed(0)}% worst peak-to-trough fall`} ok={!rep.blew_up} />
                  <Answer q="Does it beat just buying and holding?" a={rep.beats_buy_hold ? "YES" : "NO"}
                    detail={`${(rep.strategy_return * 100).toFixed(1)}% vs ${(rep.buy_hold_return * 100).toFixed(1)}% buy & hold`}
                    ok={rep.beats_buy_hold} />
                </div>
              </Panel>
            </motion.div>

            {rep.reasons?.length > 0 && (
              <motion.div {...revealProps(0.1)} className="mt-4">
                <Panel title="Why this verdict?" sub="In plain English">
                  <ul className="space-y-2.5">
                    {rep.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-3 text-[14px] leading-6 text-haze">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: pal.c }} />
                        {r}
                      </li>
                    ))}
                  </ul>
                </Panel>
              </motion.div>
            )}
          </>
        )}

        </>
        )}

        <p className="mt-6 text-center font-mono text-[11px] text-hazedim/70">
          Deflated Sharpe (Bailey &amp; López de Prado 2014) · PBO via CSCV (Bailey et al. 2017) — computed by core.honesty.
        </p>
      </section>
    </>
  );
}
