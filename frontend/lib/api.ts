/* ──────────────────────────────────────────────────────────────────────────
   Typed client for the AlphaForge Python API.

   Requests go to relative /api/* paths, which next.config.mjs proxies to the
   FastAPI service — so the browser stays same-origin and no backend host is
   baked into the client bundle. This layer only reads; all computation stays
   in the Python core.
   ────────────────────────────────────────────────────────────────────────── */

export type Config = {
  tickers: string[];
  demo_mode: boolean;
  risk_free_rate: number;
  initial_capital: number;
  default_start: string;
};

/** /api/metrics returns pre-formatted display strings, e.g. "1.52%" / "-0.00". */
export type Metrics = Record<string, string>;

export type Candle = {
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  "Adj Close"?: number;
};

/** OHLCV plus every indicator column produced by core.indicators. */
export type IndicatorRow = Candle & {
  RSI: number | null;
  MACD: number | null;
  Signal: number | null;
  Histogram: number | null;
  BB_Mid: number | null;
  BB_Upper: number | null;
  BB_Lower: number | null;
  ATR: number | null;
};

/** Data-source badge returned alongside a frame (mirrors data_engine_status). */
export type FrameMeta = {
  source: string;
  badge: string;
  mode: string;
  interval: string;
  last_bar: string | null;
};

export type OhlcvResponse = { data: Candle[]; rows: number; meta?: FrameMeta };
export type IndicatorResponse = { data: IndicatorRow[]; rows: number; meta?: FrameMeta };

/** The Data Engine settings, matching the Streamlit sidebar. */
export type DataEngine = {
  live: boolean;
  start: string;
  interval: string;
  lookback: string;
  refreshSeconds: number;
};

export const LIVE_INTERVALS = ["1m", "2m", "5m", "15m", "30m", "60m"] as const;
export const LIVE_LOOKBACKS = ["1d", "2d", "5d"] as const;

/** Same rule as data_engine.normalize_ticker(). */
export function normalizeTicker(raw: string): string {
  return (raw || "")
    .trim()
    .toUpperCase()
    .split("")
    .filter((ch) => /[A-Z0-9]/.test(ch) || [".", "-", "_", "^", "="].includes(ch))
    .join("");
}

function engineQuery(e: DataEngine): string {
  const p = new URLSearchParams({ start: e.start });
  if (e.live) {
    p.set("live", "true");
    p.set("interval", e.interval);
    p.set("lookback", e.lookback);
  }
  return p.toString();
}

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { signal, cache: "no-store" });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(
      "Can't reach the AlphaForge API. Is the Python service running on port 8000?"
    );
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

/* ── payload types for the remaining modules ─────────────────────────────── */
export type RiskResponse = {
  var_historical: number; cvar_historical: number; var_parametric: number;
  annualised_vol: number; return_distribution: number[];
  rolling_var: Record<string, unknown>[]; returns_ts: Record<string, unknown>[];
  cumulative_return: Record<string, unknown>[];
  stress_tests: RiskStressRow[];
  tail_events: number; worst_day: number; best_day: number;
};

/** A {date, value} record as emitted by series_to_records — the index key
 *  is "index" or the frame's index name ("Date"), so readers accept both. */
export type Point = Record<string, unknown>;

export type RiskStressRow = {
  scenario: string; period: string; total_return: number; max_drawdown: number;
  var_95: number; var_t_95: number; worst_day: number; volatility: number;
};

export type RiskMethodsResponse = {
  confidence: number;
  var_historical: number; var_parametric: number; var_t_dist: number; var_garch: number;
  cvar_historical: number; annualised_vol: number;
  methods: { method: string; var: number; note: string }[];
  return_distribution: number[];
  tail_events: number; worst_day: number; best_day: number;
  kurtosis: number; skewness: number; max_drawdown: number; observations: number;
};

export type RiskGarchResponse = {
  window: number; confidence: number; fit_ok: boolean; fit_error: string | null;
  returns: Point[]; rolling_var: Point[]; garch_var: Point[];
  rolling_vol: Point[]; garch_vol: Point[];
};

export type RiskPortfolioResponse = {
  tickers: string[]; weights: number[]; method: string; confidence: number;
  portfolio_var: number; portfolio_cvar: number; portfolio_vol: number;
  portfolio_max_drawdown: number;
  individual_var: Record<string, number>;
  correlation: Record<string, Record<string, number>>;
  portfolio_cumulative: Point[];
  component_cumulative: Record<string, Point[]>;
  observations: number;
};

export type RiskKupiecResponse = {
  window: number; confidence: number; observations: number; violations: number;
  expected_rate: number; actual_rate: number | null; p_value: number | null; result: string;
  returns: Point[]; var_series: Point[];
  violation_points: { date: string; ret: number }[];
};

export type SignalRow = {
  date: string; close: number | null; rsi: number | null; macd: number | null;
  signal_line: number | null; histogram: number | null;
  bb_upper: number | null; bb_lower: number | null;
  combined: number; rsi_signal: number; macd_signal: number;
  bb_signal: number; dual_ma_signal: number;
};
export type SignalsResponse = {
  data: SignalRow[]; rows: number; latest: SignalRow; stance: string; meta?: FrameMeta;
};

/* ── alpha-signal sub-features (Streamlit Signals page) ──────────────────── */

export type AlphaSignalsResponse = {
  ticker: string; fwd_days: number; ofi_threshold: number; skew_threshold: number;
  series: Point[];
  ic_weights: Record<string, number>;
  signal_ic: { signal: string; ic: number; used: boolean }[];
  latest: {
    combined: number; ofi: number; skew: number; crowd: number;
    crowd_weight: number; active_signals: number; best_ic_weight: number; n_signals: number;
  };
  crowd_status: string;
  crowd_action: string;
};

export type SignalHealthRow = {
  Signal: string; Health: number; Status: string;
  "IC Mean": number; "IC Std": number; "IC Trend": number; Weight: number;
};

export type SignalHealthResponse = {
  row: SignalHealthRow;
  rolling_ic: { i: number; v: number | null }[];
  ic_trend: { i: number; v: number }[];
};

export type SignalCrowdingResponse = { rows: Record<string, unknown>[] };

export type MacroRegimeResponse = {
  available: boolean; note: string | null;
  score?: number; label?: string; position_scalar?: number;
  vix?: number | null; series?: Point[];
};

/** The six signals the health monitor covers. */
export const HEALTH_SIGNALS = ["RSI", "MACD", "BB Reversion", "Dual MA", "OFI", "IV Skew"] as const;

export type Honesty = {
  verdict: string; headline: string; subtext: string;
  dsr: number | null; psr: number | null; pbo: number | null;
  sharpe_ann: number; sr_benchmark_ann: number; n_trials: number; n_obs: number;
  max_drawdown: number; blew_up: boolean; beats_buy_hold: boolean;
  strategy_return: number; buy_hold_return: number; reasons: string[];
  ticker?: string; strategy?: string;
};

export type BacktestResponse = {
  metrics: Metrics;
  equity_curve: { index: string; equity: number }[];
  trade_log: Record<string, unknown>[];
  rolling_sharpe: { index: string; sharpe: number }[];
  buy_hold_cumulative: { index: string; cumulative: number }[];
  strategy_cumulative: { index: string; cumulative: number }[];
};

export type CostProfile = {
  name: string; round_trip: number; slippage_bps: number; breakdown: Record<string, string>;
};

export type BacktestFullResponse = {
  cost_model: { name: string; round_trip: number; breakdown: Record<string, string> };
  metrics: Metrics;
  equity_curve: { index: string; equity: number }[];
  rolling_sharpe: { index: string; sharpe: number }[];
  strategy_cumulative: { index: string; cumulative: number }[];
  buy_hold_cumulative: { index: string; cumulative: number }[];
  trade_log: Record<string, unknown>[];
  walk_forward?: {
    efficiency_ratio?: number; n_folds?: number; overfit_warning?: boolean;
    oos_metrics?: Metrics; fold_metrics?: Record<string, unknown>[];
    oos_equity?: { index: string; equity: number }[]; error?: string;
  };
  monte_carlo?: {
    n_simulations?: number; prob_profit?: number; prob_beat_bh?: number; risk_of_ruin?: number;
    sharpe_ci_low?: number; sharpe_ci_high?: number; final_values?: number[];
    fan?: Record<"pct_5" | "pct_25" | "pct_50" | "pct_75" | "pct_95", { index: string; v: number }[]>;
    error?: string;
  };
  regime_matrix?: Record<string, unknown>[] | { error: string };
};

export type FrontierResponse = {
  frontier: { returns: number[]; vols: number[]; sharpes: number[] };
  max_sharpe: { weights: number[]; ret: number; vol: number; sharpe: number };
  min_vol: { weights: number[]; ret: number; vol: number; sharpe: number };
  tickers: string[];
  correlation: Record<string, Record<string, number>>;
};
export type RiskParityResponse = {
  weights: number[]; tickers: string[];
  stats: { return: number; volatility: number; sharpe: number };
};

/* ── full portfolio page (Streamlit Portfolio parity) ────────────────────── */

export type PortfolioStrategy = {
  weights: number[];
  stats: Record<string, string>;
  cost: {
    gross_sharpe: number; net_sharpe: number;
    annual_cost_pct: number; turnover_pct: number; sharpe_drag: number;
  };
  concentration: {
    hhi: number; norm_hhi: number; status: string; color: string;
    max_weight: number; top_ticker: string; top2_pct: number;
  };
  point: { vol: number; ret: number };
};

export type PortfolioFullResponse = {
  tickers: string[];
  settings: { max_weight: number; cost_bps: number; rebal_days: number; risk_free_rate: number };
  covariance_health: { status: string; color: string; msg: string; ratio: number };
  regime: {
    current: string; strategy: string; reason: string; color: string;
    regime_pct: Record<string, number>;
  };
  regime_timeline: Point[];
  strategies: Record<string, PortfolioStrategy>;
  risk_contributions: Record<string, number[]>;
  correlation: Record<string, Record<string, number>>;
};

export type AnalyticFrontierResponse = {
  vols: number[]; rets: number[]; risk_free_rate: number;
};

export type FactorsResponse = {
  factor_matrix: Record<string, unknown>[];
  ic_scores: Record<string, unknown>[];
  decay_curve: Record<string, unknown>[];
  tickers: string[];
  /* sub-features mirroring the Streamlit Factor Lab */
  factors: string[];
  primary_factor: string;
  ic_summary: Record<string, unknown>[];
  composite: {
    weights: Record<string, number>;
    scores: { ticker: string; score: number; rank: number }[];
  };
  ts_ic: Record<string, Point[]>;
  settings: { fwd_days: number; cost_bps: number; rebal_freq: number; n_quintiles: number };
};

export type FactorQuintileResponse = {
  ls_gross_cagr: number | null; ls_net_cagr: number | null;
  avg_turnover: number | null; cost_bps: number | null;
  rebalance_freq_days: number | null;
  table: Record<string, unknown>[];
  error: string | null;
};

export type FactorRegimeResponse = {
  rows: Record<string, unknown>[];
  pivot: Record<string, Record<string, number>>;
  /** Column axis of `pivot` — the regimes. Rows are factors. */
  regimes?: string[];
  best: Record<string, unknown> | null;
  worst: Record<string, unknown> | null;
};

export type FactorAttributionResponse = {
  alpha_pct?: string; alpha_tstat?: number; r_squared?: number; n_obs?: number;
  table?: Record<string, unknown>[]; error: string | null;
};

export type FactorCrowdingResponse = {
  is_crowded?: boolean; crowding_level?: string; current_pctile?: number;
  current_dispersion?: number; avg_autocorr?: number;
  series?: Point[]; crowding_zone?: number | null; error: string | null;
};

export type FactorDecayResponse = {
  rows: Record<string, unknown>[];
  optimal_horizon: number | null;
};

export type RegimeResponse = {
  price_data: Record<string, unknown>[];
  regime_counts: Record<string, number>;
  conditional_sharpe: Record<string, unknown>[];
  current_regime: string;
  recommendation: string;
  /* sub-features mirroring the Streamlit Regime tabs */
  n_states_used: number;
  regime_age: number;
  age_scalar: number;
  bull_prob: number;
  bear_prob: number;
  forward_proba: Point[];
  high_confidence: { date: string; regime: string; confidence: number }[];
  early_warning: {
    active: boolean; latest_ac1: number; latest_var: number; lead_msg: string;
    ac1: Point[]; variance: Point[]; warning: Point[];
  };
  strategy: {
    regime: string;
    weights: Record<string, number>;
    recommendations: { primary: string; secondary: string; avoid: string; position: string; stops: string };
  };
  factor_weights_by_regime: Record<string, Record<string, number>>;
  age_scalar_series: Point[];
  transition_matrix: Record<string, Record<string, number>>;
  duration_episodes: { regime: string; duration: number }[];
  duration_stats: {
    regime: string; mean_days: number; median_days: number;
    max_days: number; min_days: number; episodes: number;
  }[];
  return_vol_scatter: { vol: number; ret: number; regime: string }[];
};

export type RegimeRollingResponse = {
  rows: Point[]; columns: string[]; note: string | null;
};

export type PredictionResponse = {
  data: Record<string, unknown>[];
  historical: Record<string, unknown>[];
};

/* ── Prediction Studio: multi-model (XGBoost + LSTM + Transformer) ─────────
   A full train takes minutes, so it runs as a background job the client polls. */

export const STUDIO_MODELS = ["XGBoost", "LSTM", "Transformer"] as const;
export type StudioModel = (typeof STUDIO_MODELS)[number];

export type StudioMetricRow = {
  model: string; backend: string | null; status: string | null;
  mse: number | null; mae: number | null; rmse: number | null; warning: string | null;
};

export type DangerFlag = { severity: "DANGER" | "WARNING" | "INFO"; code: string; message: string };

export type StudioResult = {
  ticker: string;
  data_source: string;
  ensemble_method: string;
  ensemble_column: string;
  models: string[];
  feature_columns: string[];
  last_close: number | null;
  final_prediction: number | null;
  forecast_delta: number | null;
  confidence_score: number | null;
  next_step_predictions: Record<string, number | null>;
  /** [{date, Close}] — trailing history for the chart. */
  history: Record<string, unknown>[];
  /** [{date, XGBoost, LSTM, Transformer, Simple Average, Weighted Ensemble, Confidence}] */
  forecast_frame: Record<string, unknown>[];
  /** Per-model [{date, "Predicted Close"}] */
  forecasts: Record<string, Record<string, unknown>[]>;
  metrics: StudioMetricRow[];
  model_metrics: Record<string, Record<string, unknown>>;
  ensemble_weights: Record<string, number | null>;
  warnings: string[];
  danger_flags: DangerFlag[];
};

export type StudioJob = {
  id: string;
  kind: "train" | "refresh";
  status: "queued" | "running" | "done" | "error";
  stage: string;
  params: Record<string, unknown>;
  elapsed_seconds: number | null;
  error: string | null;
  result: StudioResult | null;
  has_models: boolean;
};

export type StudioStartResponse = {
  job_id: string; status: string; params: Record<string, unknown>;
};

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError("Can't reach the AlphaForge API. Is the Python service running on port 8000?");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const b = await res.json();
      if (b?.detail) detail = String(b.detail);
    } catch { /* keep generic */ }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  config: (signal?: AbortSignal) => get<Config>("/api/config", signal),

  risk: (ticker: string, start: string, confidence = 0.95, signal?: AbortSignal) =>
    get<RiskResponse>(
      `/api/risk/${encodeURIComponent(ticker)}?start=${start}&confidence=${confidence}`, signal),

  // Risk sub-panels are separate calls: the GARCH fit and the multi-ticker load
  // are each slow enough that bundling them would risk the proxy timeout.
  riskMethods: (ticker: string, start: string, confidence: number, signal?: AbortSignal) =>
    get<RiskMethodsResponse>(
      `/api/risk/methods/${encodeURIComponent(ticker)}?start=${start}&confidence=${confidence}`, signal),

  riskGarch: (ticker: string, start: string, confidence: number, window: number, signal?: AbortSignal) =>
    get<RiskGarchResponse>(
      `/api/risk/garch/${encodeURIComponent(ticker)}?start=${start}&confidence=${confidence}&window=${window}`, signal),

  riskKupiec: (ticker: string, start: string, confidence: number, window: number, signal?: AbortSignal) =>
    get<RiskKupiecResponse>(
      `/api/risk/kupiec/${encodeURIComponent(ticker)}?start=${start}&confidence=${confidence}&window=${window}`, signal),

  riskPortfolio: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<RiskPortfolioResponse>("/api/risk/portfolio", body, signal),

  signals: (ticker: string, e: DataEngine, signal?: AbortSignal) =>
    get<SignalsResponse>(`/api/signals/${encodeURIComponent(ticker)}?${engineQuery(e)}`, signal),

  alphaSignals: (ticker: string, body: Record<string, unknown>, signal?: AbortSignal) =>
    post<AlphaSignalsResponse>(`/api/signals/alpha/${encodeURIComponent(ticker)}`, body, signal),

  // One request per signal: core's rolling-IC costs ~4s each, so all six in a
  // single call would land near the dev proxy's ~30s ceiling. Fan out instead.
  signalHealth: (ticker: string, name: string, body: Record<string, unknown>, signal?: AbortSignal) =>
    post<SignalHealthResponse>(
      `/api/signals/health/${encodeURIComponent(ticker)}?signal=${encodeURIComponent(name)}`, body, signal),

  signalCrowding: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<SignalCrowdingResponse>("/api/signals/crowding", body, signal),

  macroRegime: (start: string, signal?: AbortSignal) =>
    get<MacroRegimeResponse>(`/api/macro/regime?start=${start}`, signal),

  honesty: (ticker: string, start: string, strategy: string, signal?: AbortSignal) =>
    get<Honesty>(
      `/api/honesty/${encodeURIComponent(ticker)}?start=${start}&strategy=${encodeURIComponent(strategy)}`,
      signal
    ),

  backtest: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<BacktestResponse>("/api/backtest", body, signal),

  costProfiles: (signal?: AbortSignal) =>
    get<{ profiles: CostProfile[] }>("/api/backtest/cost-profiles", signal),

  backtestFull: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<BacktestFullResponse>("/api/backtest/full", body, signal),

  // Walk-forward / Monte Carlo / regime matrix are separate calls so each stays
  // well inside the proxy timeout and the UI can fill panels as they arrive.
  backtestWalkForward: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<NonNullable<BacktestFullResponse["walk_forward"]>>("/api/backtest/walkforward", body, signal),

  backtestMonteCarlo: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<NonNullable<BacktestFullResponse["monte_carlo"]>>("/api/backtest/montecarlo", body, signal),

  backtestRegimeMatrix: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<{ rows: Record<string, unknown>[] }>("/api/backtest/regime-matrix", body, signal),

  frontier: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<FrontierResponse>("/api/portfolio/frontier", body, signal),

  riskParity: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<RiskParityResponse>("/api/portfolio/risk-parity", body, signal),

  portfolioFull: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<PortfolioFullResponse>("/api/portfolio/full", body, signal),

  // ~50 convex solves — its own call so the rest of the page isn't held up.
  portfolioFrontierAnalytic: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<AnalyticFrontierResponse>("/api/portfolio/frontier-analytic", body, signal),

  factors: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<FactorsResponse>("/api/factors", body, signal),

  // The quintile backtest, regime IC sweep and crowding scan each walk the full
  // history — separate calls so each panel fills as soon as its own data lands.
  factorsQuintile: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<FactorQuintileResponse>("/api/factors/quintile", body, signal),

  factorsRegime: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<FactorRegimeResponse>("/api/factors/regime", body, signal),

  factorsAttribution: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<FactorAttributionResponse>("/api/factors/attribution", body, signal),

  factorsCrowding: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<FactorCrowdingResponse>("/api/factors/crowding", body, signal),

  factorsDecay: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<FactorDecayResponse>("/api/factors/decay", body, signal),

  regime: (ticker: string, start: string, nStates: number, signal?: AbortSignal) =>
    post<RegimeResponse>(`/api/regime/${encodeURIComponent(ticker)}?start=${start}`, { n_states: nStates }, signal),

  // Rolling HMM refits the model every 21 days — far slower than the rest of
  // the page, so it is opt-in and loads into its own panel.
  regimeRolling: (ticker: string, start: string, nStates: number, signal?: AbortSignal) =>
    post<RegimeRollingResponse>(
      `/api/regime/rolling/${encodeURIComponent(ticker)}?start=${start}`, { n_states: nStates }, signal),

  prediction: (model: string, body: Record<string, unknown>, signal?: AbortSignal) =>
    post<PredictionResponse>(`/api/prediction/${model}`, body, signal),

  // Prediction Studio — training runs in the background; poll studioJob for it.
  studioTrain: (body: Record<string, unknown>, signal?: AbortSignal) =>
    post<StudioStartResponse>("/api/prediction/studio/train", body, signal),

  studioRefresh: (sourceJobId: string, body: Record<string, unknown>, signal?: AbortSignal) =>
    post<StudioStartResponse>(
      `/api/prediction/studio/refresh/${encodeURIComponent(sourceJobId)}`, body, signal),

  studioJob: (jobId: string, signal?: AbortSignal) =>
    get<StudioJob>(`/api/prediction/studio/jobs/${encodeURIComponent(jobId)}`, signal),

  studioDelete: async (jobId: string) => {
    await fetch(`/api/prediction/studio/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
  },

  metrics: (ticker: string, e: DataEngine, signal?: AbortSignal) =>
    get<Metrics>(`/api/metrics/${encodeURIComponent(ticker)}?${engineQuery(e)}`, signal),

  ohlcv: (ticker: string, e: DataEngine, signal?: AbortSignal) =>
    get<OhlcvResponse>(`/api/ohlcv/${encodeURIComponent(ticker)}?${engineQuery(e)}`, signal),

  indicators: (ticker: string, e: DataEngine, signal?: AbortSignal) =>
    get<IndicatorResponse>(`/api/indicators/${encodeURIComponent(ticker)}?${engineQuery(e)}`, signal),
};

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** Turn "-33.20%" / "1.52" into a number. Returns null when unparseable. */
export function toNumber(v: string | undefined | null): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[%,\s$]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Evenly sample a series down to at most `max` points, always keeping the last. */
export function downsample<T>(arr: T[], max = 160): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out[out.length - 1] = arr[arr.length - 1];
  return out;
}

/** Simple moving average over closes, aligned to the input length (null warm-up). */
export function sma(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

export function fmtVolume(v: number): string {
  if (!Number.isFinite(v)) return "-";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
}
