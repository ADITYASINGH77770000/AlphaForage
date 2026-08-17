"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  api, ApiError, STUDIO_MODELS,
  type DangerFlag, type StudioJob, type StudioResult,
} from "@/lib/api";
import { revealProps } from "../motion";
import { ApiDown, ModuleHeader, Panel } from "./Shell";
import { Legend, LineChart, type Series } from "./charts";
import { TickerBar, yearsAgo } from "./TickerBar";

/* ──────────────────────────────────────────────────────────────────────────
   PREDICTION STUDIO — full parity with the Streamlit Prediction page.

   Trains XGBoost + LSTM (TensorFlow) + Transformer (PyTorch) through
   core.prediction.run_multi_model_prediction, scores them on a chronological
   validation split, and ensembles by inverse-error weights.

   A full train takes minutes, so it runs as a background job and this module
   polls it — no request ever sits on the dev proxy's 30s ceiling.

   Layout mirrors the Streamlit page:
     Controls → Summary (4 metrics + forecast stack) → scorecard & weights
     → Overview / LSTM / XGBoost / Transformer tabs → pre-flight danger flags
   ────────────────────────────────────────────────────────────────────────── */

const ACCENT = "#a55efd";
const GREEN = "#00f5a0";
const RED = "#ff5470";
const GOLD = "#ffd700";
const CYAN = "#00f5ff";

/** Same colours the Streamlit forecast-stack chart uses. */
const MODEL_COLOR: Record<string, string> = {
  LSTM: CYAN, XGBoost: GOLD, Transformer: "#ff6b6b",
};
const ENSEMBLE_COLOR = "#00ff88";

const TABS = ["Overview", "LSTM", "XGBoost", "Transformer"] as const;
type Tab = (typeof TABS)[number];

/** Rough guide for the progress bar — a full 3-model train is minutes, not seconds. */
const ETA_SECONDS = 380;

const currency = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v)
    ? "N/A"
    : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percent = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "N/A" : `${(v * 100).toFixed(2)}%`;
const dec = (v: number | null | undefined, d = 4) =>
  v == null || !Number.isFinite(v) ? "N/A" : v.toFixed(d);

const FLAG_STYLE = {
  DANGER: { color: "#dc3232", bg: "rgba(220,50,50,0.08)", icon: "⛔" },
  WARNING: { color: "#e67e00", bg: "rgba(230,126,0,0.08)", icon: "⚠️" },
  INFO: { color: "#1a6fa0", bg: "rgba(26,111,160,0.08)", icon: "ℹ️" },
} as const;

function Metric({ l, v, c = "#fff", note }: { l: string; v: string; c?: string; note?: string }) {
  return (
    <div className="hv rounded-xl border border-white/10 bg-panel/45 px-4 py-3 backdrop-blur">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-hazedim">{l}</div>
      <div className="mt-1 text-[19px] font-semibold" style={{ color: c }}>{v}</div>
      {note && <div className="mt-0.5 font-mono text-[9.5px] text-hazedim">{note}</div>}
    </div>
  );
}

/** Download any row set as CSV — mirrors the Streamlit download buttons. */
function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ForecastTable({ rows, maxH = 320 }: { rows: Record<string, unknown>[]; maxH?: number }) {
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-hazedim">No forecast rows.</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-auto rounded-lg border border-white/8" style={{ maxHeight: maxH }}>
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead className="sticky top-0 bg-ink/90"><tr>
          {cols.map((c) => (
            <th key={c} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{c}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/[0.03]">
              {cols.map((c) => {
                const v = r[c];
                const isNum = typeof v === "number";
                const col = c === "Confidence"
                  ? (Number(v) >= 0.65 ? GREEN : Number(v) >= 0.5 ? GOLD : RED)
                  : MODEL_COLOR[c] ?? (/Ensemble|Average/.test(c) ? ENSEMBLE_COLOR : "#cfe0f5");
                return (
                  <td key={c} className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]" style={{ color: col }}>
                    {isNum
                      ? (c === "Confidence" ? `${(Number(v) * 100).toFixed(2)}%` : Number(v).toFixed(2))
                      : String(v ?? "—")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PredictionModule() {
  const [ticker, setTicker] = useState("GOOG");
  const [start, setStart] = useState(yearsAgo(6));
  const [steps, setSteps] = useState(10);
  const [lookBack, setLookBack] = useState(60);
  const [epochs, setEpochs] = useState(10);
  const [ensembleMethod, setEnsembleMethod] = useState<"weighted" | "simple">("weighted");
  const [includeTransformer, setIncludeTransformer] = useState(true);
  const [tab, setTab] = useState<Tab>("Overview");

  const [job, setJob] = useState<StudioJob | null>(null);
  const [res, setRes] = useState<StudioResult | null>(null);
  /** Job whose trained models are still held server-side (enables Refresh). */
  const [trainedJobId, setTrainedJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const msg = (e: unknown) => (e instanceof ApiError ? e.message : String(e));
  const buildBody = () => ({
    ticker, start, steps, look_back: lookBack, epochs,
    include_transformer: includeTransformer, ensemble_method: ensembleMethod,
  });

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  /** Poll a job until it settles. Every poll is a fast request. */
  const watch = useCallback((jobId: string, kind: "train" | "refresh") => {
    stopPoll();
    setBusy(true);
    const tick = async () => {
      try {
        const j = await api.studioJob(jobId);
        setJob(j);
        if (j.status === "done") {
          stopPoll(); setBusy(false); setRes(j.result);
          if (kind === "train" && j.has_models) setTrainedJobId(jobId);
        } else if (j.status === "error") {
          stopPoll(); setBusy(false); setError(j.error ?? "Training failed.");
        }
      } catch (e) {
        stopPoll(); setBusy(false); setError(msg(e));
      }
    };
    tick();
    pollRef.current = setInterval(tick, 3000);
  }, []);

  useEffect(() => stopPoll, []);

  const train = useCallback(async () => {
    setError(null); setJob(null); setBusy(true);
    try {
      const r = await api.studioTrain(buildBody());
      watch(r.job_id, "train");
    } catch (e) { setBusy(false); setError(msg(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, start, steps, lookBack, epochs, includeTransformer, ensembleMethod, watch]);

  const refresh = useCallback(async () => {
    if (!trainedJobId) { setError("Train the models once before refreshing inference."); return; }
    setError(null); setBusy(true);
    try {
      const r = await api.studioRefresh(trainedJobId, buildBody());
      watch(r.job_id, "refresh");
    } catch (e) { setBusy(false); setError(msg(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainedJobId, ticker, start, steps, ensembleMethod, watch]);

  /* ── chart data: history stitched to the forward paths ── */
  const pad = (arr: (number | null)[], before: number, after: number): (number | null)[] =>
    [...Array(before).fill(null), ...arr, ...Array(after).fill(null)];

  const stack = useMemo<{ labels: string[]; series: Series[] }>(() => {
    if (!res) return { labels: [], series: [] };
    const hist = res.history.slice(-90);
    const fc = res.forecast_frame;
    const labels = [...hist.map((h) => String(h.date)), ...fc.map((f) => String(f.date))];
    const series: Series[] = [
      { label: "Historical Close", color: "rgba(255,255,255,0.9)", values: pad(hist.map((h) => Number(h.Close)), 0, fc.length) },
    ];
    for (const m of STUDIO_MODELS) {
      if (fc.length && m in fc[0]) {
        series.push({
          label: m, color: MODEL_COLOR[m], dashed: true,
          values: pad(fc.map((f) => (f[m] == null ? null : Number(f[m]))), hist.length, 0),
        });
      }
    }
    if (fc.length && res.ensemble_column in fc[0]) {
      series.push({
        label: res.ensemble_column, color: ENSEMBLE_COLOR,
        values: pad(fc.map((f) => Number(f[res.ensemble_column])), hist.length, 0),
      });
    }
    return { labels, series };
  }, [res]);

  const modelChart = useCallback((model: string): { labels: string[]; series: Series[] } => {
    if (!res) return { labels: [], series: [] };
    const rows = res.forecasts[model] ?? [];
    if (!rows.length) return { labels: [], series: [] };
    const hist = res.history.slice(-90);
    return {
      labels: [...hist.map((h) => String(h.date)), ...rows.map((r) => String(r.date))],
      series: [
        { label: "Historical Close", color: "rgba(255,255,255,0.9)", values: pad(hist.map((h) => Number(h.Close)), 0, rows.length) },
        { label: model, color: MODEL_COLOR[model] ?? CYAN, values: pad(rows.map((r) => Number(r["Predicted Close"])), hist.length, 0) },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res]);

  const flags = res?.danger_flags ?? [];
  const flagCounts = flags.reduce<Record<string, number>>((a, f) => {
    a[f.severity] = (a[f.severity] ?? 0) + 1; return a;
  }, {});
  const progress = job?.elapsed_seconds != null && job.kind === "train"
    ? Math.min(97, (job.elapsed_seconds / ETA_SECONDS) * 100) : null;
  const metricFor = (model: string) => res?.metrics.find((m) => m.model === model);

  return (
    <>
      <ModuleHeader
        n="11" title="Prediction Studio" accent={ACCENT}
        subtitle="Three models trained side by side — XGBoost, an LSTM and a Transformer — scored on a chronological validation split and blended by inverse-error weights, with a confidence score that falls when they disagree."
        right={res && (
          <span className="rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest"
            style={{ color: ACCENT, borderColor: `${ACCENT}55`, background: `${ACCENT}12` }}>
            ● {res.models.length} models
          </span>
        )}
      />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <TickerBar ticker={ticker} onTicker={setTicker} start={start} onStart={setStart}
          loading={busy} onRefresh={train} accent={ACCENT} />

        {/* ── controls ── */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-panel/45 p-5 backdrop-blur">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Forecast days — {steps}</div>
              <input type="range" min={1} max={30} value={steps} onChange={(e) => setSteps(+e.target.value)} className="w-full accent-[#a55efd]" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Look-back — {lookBack}</div>
              <input type="range" min={20} max={120} step={5} value={lookBack} onChange={(e) => setLookBack(+e.target.value)} className="w-full accent-[#a55efd]" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Epochs — {epochs}</div>
              <input type="range" min={5} max={50} value={epochs} onChange={(e) => setEpochs(+e.target.value)} className="w-full accent-[#a55efd]" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">Ensemble</div>
              <div className="flex gap-2">
                {(["weighted", "simple"] as const).map((m) => (
                  <button key={m} onClick={() => setEnsembleMethod(m)}
                    className="hv rounded-[10px] border px-3 py-1.5 font-mono text-[11.5px]"
                    style={m === ensembleMethod
                      ? { borderColor: ACCENT, background: `${ACCENT}1f`, color: ACCENT }
                      : { borderColor: "rgba(255,255,255,0.12)", color: "#adc6dd" }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
            <button onClick={() => setIncludeTransformer((v) => !v)}
              className="hv flex items-center gap-2.5 rounded-[10px] border px-3.5 py-2"
              style={includeTransformer
                ? { borderColor: `${ACCENT}80`, background: `${ACCENT}14` }
                : { borderColor: "rgba(255,255,255,0.12)" }}>
              <span className="relative inline-block h-4 w-7 rounded-full transition-colors"
                style={{ background: includeTransformer ? ACCENT : "rgba(255,255,255,0.18)" }}>
                <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all"
                  style={{ left: includeTransformer ? 14 : 2 }} />
              </span>
              <span className="font-mono text-[11.5px]" style={{ color: includeTransformer ? ACCENT : "#adc6dd" }}>
                Include Transformer
              </span>
            </button>

            <button onClick={train} disabled={busy}
              className="hv-btn rounded-[10px] border px-5 py-2 font-mono text-[12px] uppercase tracking-widest disabled:opacity-60"
              style={{ borderColor: `${ACCENT}80`, background: `${ACCENT}1a`, color: ACCENT }}>
              {busy && job?.kind === "train" ? "Training…" : "Train models"}
            </button>

            <button onClick={refresh} disabled={busy || !trainedJobId}
              title={trainedJobId ? "Re-run inference with the models already trained" : "Train once first"}
              className="hv-btn rounded-[10px] border px-5 py-2 font-mono text-[12px] uppercase tracking-widest disabled:opacity-40"
              style={{ borderColor: "rgba(255,255,255,0.18)", color: "#adc6dd" }}>
              {busy && job?.kind === "refresh" ? "Refreshing…" : "Refresh forecast"}
            </button>

            <span className="font-mono text-[10.5px] text-hazedim">
              Training runs in the background — a full three-model fit takes a few minutes.
            </span>
          </div>
        </div>

        {error && <div className="mt-6"><ApiDown message={error} /></div>}

        {/* ── job progress ── */}
        {busy && (
          <motion.div {...revealProps()} className="mt-4 rounded-2xl border border-white/10 bg-panel/45 p-5 backdrop-blur">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-[12.5px]" style={{ color: ACCENT }}>
                {job?.kind === "refresh" ? "Re-running inference…" : "Training XGBoost · LSTM · Transformer…"}
              </span>
              <span className="font-mono text-[11.5px] text-hazedim">
                {job?.elapsed_seconds != null ? `${job.elapsed_seconds.toFixed(0)}s elapsed` : "starting…"}
                {job?.stage ? ` · ${job.stage}` : ""}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
              <motion.div className="h-full rounded-full" style={{ background: ACCENT }}
                animate={progress != null ? { width: `${progress}%` } : { width: ["10%", "85%", "10%"] }}
                transition={progress != null ? { duration: 0.6 } : { duration: 3, repeat: Infinity }} />
            </div>
            <p className="mt-2 font-mono text-[10.5px] text-hazedim">
              The models train server-side; this page polls for the result, so nothing times out.
            </p>
          </motion.div>
        )}

        {!res && !busy && (
          <p className="mt-6 rounded-xl border border-dashed border-white/12 px-5 py-8 text-center text-[13.5px] text-hazedim">
            Set the parameters above and press <b className="text-white">Train models</b> to fit the prediction stack.
          </p>
        )}

        {res && (
          <>
            {/* ── summary ── */}
            <motion.div {...revealProps(0.03)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric l="Last close" v={currency(res.last_close)} />
              <Metric l="Ensemble forecast" v={currency(res.final_prediction)} c={ENSEMBLE_COLOR} note={res.ensemble_column} />
              <Metric l="Forecast delta" v={percent(res.forecast_delta)} c={(res.forecast_delta ?? 0) >= 0 ? GREEN : RED} />
              <Metric l="Confidence" v={percent(res.confidence_score)}
                c={(res.confidence_score ?? 0) >= 0.65 ? GREEN : (res.confidence_score ?? 0) >= 0.5 ? GOLD : RED}
                note="model agreement" />
            </motion.div>

            <motion.div {...revealProps(0.05)} className="mt-4">
              <Panel title="Forecast Stack" sub="Trailing 90 days of history stitched to every model's forward path, with the active ensemble drawn solid">
                <LineChart height={330} labels={stack.labels} yFormat={(v) => v.toFixed(0)} series={stack.series} />
                <Legend items={[
                  { color: "rgba(255,255,255,0.9)", label: "Historical close" },
                  ...res.models.map((m) => ({ color: MODEL_COLOR[m] ?? CYAN, label: m })),
                  { color: ENSEMBLE_COLOR, label: res.ensemble_column },
                ]} />
                {res.warnings.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {res.warnings.map((w, i) => (
                      <div key={i} className="rounded-lg border-l-[3px] px-4 py-2.5 text-[12.5px]"
                        style={{ borderColor: "#e67e00", background: "rgba(230,126,0,0.08)", color: "#cfe0f5" }}>
                        ⚠️ {w}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </motion.div>

            {/* ── scorecard + ensemble weights ── */}
            <motion.div {...revealProps(0.07)} className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <Panel title="Model scorecard" sub="Validation error on a chronological hold-out — no shuffling, so no lookahead">
                <div className="overflow-x-auto rounded-lg border border-white/8">
                  <table className="w-full min-w-[520px] border-collapse text-left">
                    <thead className="bg-ink/70"><tr>
                      {["Model", "Backend", "Status", "MSE", "MAE", "RMSE"].map((h) => (
                        <th key={h} className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-hazedim">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {res.metrics.map((m) => (
                        <tr key={m.model} className="hover:bg-white/[0.03]">
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                            style={{ color: MODEL_COLOR[m.model] ?? "#fff" }}>{m.model}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-hazedim">{m.backend ?? "—"}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px]"
                            style={{ color: m.status === "ok" ? GREEN : RED }}>{(m.status ?? "—").toUpperCase()}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-haze">{dec(m.mse)}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-white">{dec(m.mae)}</td>
                          <td className="border-b border-white/[0.05] px-3 py-1.5 font-mono text-[11.5px] text-white">{dec(m.rmse)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[12px] text-hazedim">
                  Lower MAE earns a larger ensemble weight — that is the whole basis of the blend.
                </p>
              </Panel>

              <Panel title="Ensemble weights" sub="Inverse validation error, normalised">
                {Object.keys(res.ensemble_weights).length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-hazedim">No ensemble weights were generated for this run.</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(res.ensemble_weights).map(([m, w]) => (
                      <div key={m}>
                        <div className="flex items-baseline justify-between">
                          <span className="font-mono text-[12px]" style={{ color: MODEL_COLOR[m] ?? "#fff" }}>{m}</span>
                          <span className="font-mono text-[12px] font-bold text-white">{percent(w)}</span>
                        </div>
                        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/8">
                          <motion.div className="h-full rounded-full" style={{ background: MODEL_COLOR[m] ?? ACCENT }}
                            initial={{ width: 0 }} animate={{ width: `${(w ?? 0) * 100}%` }} transition={{ duration: 0.8 }} />
                        </div>
                      </div>
                    ))}
                    <div className="mt-4 border-t border-white/10 pt-3">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-hazedim">Next-step prediction</div>
                      {Object.entries(res.next_step_predictions).map(([m, v]) => (
                        <div key={m} className="mt-1 flex justify-between font-mono text-[11.5px]">
                          <span className="text-hazedim">{m}</span>
                          <span style={{ color: MODEL_COLOR[m] ?? "#fff" }}>{currency(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            </motion.div>

            {/* ── tabs ── */}
            <motion.div {...revealProps(0.09)} className="mt-4">
              <div className="flex flex-wrap gap-2">
                {TABS.map((t) => {
                  const disabled = t !== "Overview" && !res.models.includes(t);
                  return (
                    <button key={t} onClick={() => !disabled && setTab(t)} disabled={disabled}
                      className="hv rounded-[10px] border px-4 py-1.5 font-mono text-[12px] disabled:opacity-35"
                      style={t === tab
                        ? { borderColor: ACCENT, background: `${ACCENT}1f`, color: ACCENT }
                        : { borderColor: "rgba(255,255,255,0.12)", color: "#adc6dd" }}>
                      {t}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3">
                {tab === "Overview" ? (
                  <Panel title="Ensemble forecast table" sub="Every model's path plus the simple average, the weighted ensemble and the per-day confidence">
                    <ForecastTable rows={res.forecast_frame} />
                    <button onClick={() => downloadCsv(res.forecast_frame, `${res.ticker.toLowerCase()}_prediction_ensemble.csv`)}
                      className="hv-btn mt-4 rounded-[10px] border px-4 py-2 font-mono text-[11.5px] uppercase tracking-widest"
                      style={{ borderColor: `${ACCENT}70`, background: `${ACCENT}14`, color: ACCENT }}>
                      ⬇ Download ensemble forecast
                    </button>
                    <p className="mt-3 text-[12px] text-hazedim">
                      {res.feature_columns.length} engineered features drive every model: {res.feature_columns.slice(0, 8).join(", ")}
                      {res.feature_columns.length > 8 ? ", …" : ""}
                    </p>
                  </Panel>
                ) : (() => {
                  const model = tab;
                  const mm = metricFor(model);
                  const rows = res.forecasts[model] ?? [];
                  const chart = modelChart(model);
                  if (!rows.length) {
                    return (
                      <Panel title={`${model} forecast`} sub="Model output">
                        <p className="py-6 text-center text-[13.5px] text-hazedim">
                          {mm?.warning ?? `${model} is unavailable for the current run.`}
                        </p>
                      </Panel>
                    );
                  }
                  return (
                    <Panel title={`${model} forecast`} sub="Validation scores, forward path and the raw predicted closes">
                      <div className="grid gap-3 sm:grid-cols-4">
                        <Metric l="Status" v={(mm?.status ?? "N/A").toUpperCase()} c={mm?.status === "ok" ? GREEN : RED} />
                        <Metric l="Backend" v={mm?.backend ?? "N/A"} c={ACCENT} />
                        <Metric l="MAE" v={dec(mm?.mae)} />
                        <Metric l="RMSE" v={dec(mm?.rmse)} />
                      </div>
                      <div className="mt-4">
                        <LineChart height={280} labels={chart.labels} yFormat={(v) => v.toFixed(0)} series={chart.series} />
                        <Legend items={[
                          { color: "rgba(255,255,255,0.9)", label: "Historical close" },
                          { color: MODEL_COLOR[model] ?? CYAN, label: `${model} forecast` },
                        ]} />
                      </div>
                      <div className="mt-4"><ForecastTable rows={rows} maxH={260} /></div>
                      <button onClick={() => downloadCsv(rows, `${res.ticker.toLowerCase()}_${model.toLowerCase()}_forecast.csv`)}
                        className="hv-btn mt-4 rounded-[10px] border px-4 py-2 font-mono text-[11.5px] uppercase tracking-widest"
                        style={{ borderColor: `${ACCENT}70`, background: `${ACCENT}14`, color: ACCENT }}>
                        ⬇ Download {model} forecast
                      </button>
                      {mm?.warning && <p className="mt-3 text-[12px]" style={{ color: "#e67e00" }}>⚠️ {mm.warning}</p>}
                    </Panel>
                  );
                })()}
              </div>
            </motion.div>

            {/* ── pre-flight checks ── */}
            <motion.div {...revealProps(0.11)} className="mt-4">
              <Panel title="Pre-flight checks" sub="Deterministic checks on the forecast — always computed, never AI-generated">
                {flags.length === 0 ? (
                  <p className="rounded-lg border-l-[3px] px-4 py-3 text-[13px]"
                    style={{ borderColor: GREEN, background: "rgba(0,245,160,0.06)", color: "#cfe0f5" }}>
                    ✅ Pre-flight checks passed — no critical flags detected for this prediction run.
                  </p>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {(["DANGER", "WARNING", "INFO"] as const).map((sev) =>
                        flagCounts[sev] ? (
                          <span key={sev} className="rounded px-2.5 py-1 font-mono text-[11px] font-bold text-white"
                            style={{ background: FLAG_STYLE[sev].color }}>
                            {FLAG_STYLE[sev].icon} {flagCounts[sev]} {sev}
                          </span>
                        ) : null
                      )}
                    </div>
                    <div className="space-y-2">
                      {flags.map((f: DangerFlag, i) => (
                        <div key={i} className="rounded-r-lg border-l-[3px] px-4 py-2.5"
                          style={{ borderColor: FLAG_STYLE[f.severity].color, background: FLAG_STYLE[f.severity].bg }}>
                          <div className="font-mono text-[11px] font-bold" style={{ color: FLAG_STYLE[f.severity].color }}>
                            {f.severity} · {f.code}
                          </div>
                          <div className="mt-1 text-[12.5px] leading-6 text-haze">{f.message}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Panel>
            </motion.div>
          </>
        )}

        <p className="mt-6 text-center font-mono text-[11px] text-hazedim/70">
          XGBoost · LSTM (TensorFlow) · Transformer (PyTorch), trained and ensembled by core.prediction.
          Short-series price forecasting overfits easily — treat these as one input among many, never a price target.
        </p>
      </section>
    </>
  );
}
