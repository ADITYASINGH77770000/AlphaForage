"""
api/server.py
──────────────────────────────────────────────────────────────────────────────
Thin FastAPI wrapper around existing AlphaForge core modules.
NO backend logic is duplicated — every endpoint calls core/ directly.

Run:  uvicorn api.server:app --reload --port 8000
"""

import math
import sys
import threading
from pathlib import Path

# Ensure project root is on sys.path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import api.auth as auth

# ── Core imports (UNTOUCHED backend) ─────────────────────────────────────────
from core.data import get_ohlcv, get_live_data, returns, get_multi_ohlcv, align_returns
from core.graph_features import DEFAULT_GRAPH_BENCHMARK, build_graph_feature_payload
from core.metrics import (
    summary_table, var_historical, cvar_historical,
    var_parametric, annualised_vol, sharpe, information_coefficient, icir,
    var_t_dist, var_garch, portfolio_var, kupiec_test, max_drawdown,
)
from core.models import lstm_forecast, arima_forecast, garch_forecast
from core.indicators import add_all_indicators, rsi, macd, bollinger_bands
from core.indicators import (
    signal_rsi, signal_macd_crossover,
    signal_bb_mean_reversion, signal_dual_ma,
)
from core.backtest_engine import (
    run_backtest, BacktestConfig,
    momentum_strategy, mean_reversion_strategy, rsi_strategy,
)
from core import honesty as honesty_engine
from core.alpha_engine import (
    compute_ofi, ofi_signal, compute_iv_skew_proxy, iv_skew_signal,
    compute_crowding_score, crowding_weight, crowding_signal,
    compute_signal_health, monitor_all_signals, combine_signals,
    get_macro_data, compute_macro_regime_score, macro_regime_label,
)
from core.portfolio_opt import monte_carlo_frontier, risk_parity_weights, portfolio_stats
from core.regime_detector import (
    fit_hmm, regime_conditional_sharpe, full_regime_analysis,
    rolling_regime_proba, REGIME_FACTOR_WEIGHTS,
)
from core.factor_engine import (
    build_factor_matrix, momentum_factor, low_vol_factor,
    size_factor, quality_factor, value_factor, quintile_returns, factor_decay,
    FACTOR_FNS, compute_timeseries_ic, factor_summary_stats,
    cost_adjusted_quintile_bt, regime_factor_ic, ic_weighted_composite,
    factor_attribution, detect_factor_crowding, cross_sectional_decay,
)
# RL environment removed
from utils.config import cfg
from utils.notifications import build_alert_body, send_email

# ── Remove Streamlit cache decorators for API usage ──────────────────────────
# We patch out st.cache_data since we're not in streamlit context
import streamlit as st
st.cache_data = lambda *a, **kw: (lambda f: f)  # no-op decorator

app = FastAPI(title="AlphaForge API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALERT_INSIGHTS = {
    "GOOG": {
        "Open": "Opening price reflects initial market sentiment.",
        "Close": "Closing price is the day's final market consensus.",
        "High": "New highs signal bullish momentum.",
        "Low": "New lows suggest selling pressure.",
    },
    "NVDA": {
        "Open": "Higher open can reflect strong pre-market demand.",
        "Close": "Closing strength is useful for trend confirmation.",
        "High": "Breaking highs often attracts additional momentum buyers.",
        "Low": "Sharp lows can reflect stop-loss cascades.",
    },
    "META": {
        "Open": "The open often reacts quickly to platform and ad-market sentiment.",
        "Close": "Closing price helps confirm the market's end-of-day view.",
        "High": "Fresh highs can indicate strong support for growth expectations.",
        "Low": "Lower lows can signal pressure on risk appetite.",
    },
    "AMZN": {
        "Open": "The open often reflects retail and cloud expectations.",
        "Close": "The close is useful for daily trend confirmation.",
        "High": "Higher highs can show confidence in execution.",
        "Low": "Lower lows may signal concern around margin or demand.",
    },
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def df_to_records(df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to JSON-serialisable records."""
    df = df.copy()
    if isinstance(df.index, pd.DatetimeIndex):
        df.index = df.index.strftime("%Y-%m-%d")
    df = df.reset_index()
    # Convert numpy types
    for col in df.columns:
        if df[col].dtype == np.float64:
            df[col] = df[col].round(6)
    # NaN/inf are not valid JSON. Rolling indicators (RSI, MACD, Bollinger…)
    # legitimately produce NaN during their warm-up window, so emit null there
    # instead of letting the response fail to serialise. No value is altered.
    records = df.to_dict(orient="records")
    for row in records:
        for key, value in row.items():
            if isinstance(value, float) and not math.isfinite(value):
                row[key] = None
    return records


def series_to_records(s: pd.Series, name: str = "value") -> list[dict]:
    """Convert Series to JSON-serialisable records."""
    df = s.rename(name).to_frame()
    return df_to_records(df)


def _metric_to_float(value):
    """Normalise string-formatted metric values into numeric floats."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text or text.upper() == "N/A":
        return 0.0
    if text.endswith("%"):
        return float(text[:-1]) / 100.0
    return float(text)


def _lowercase_ohlcv(df: pd.DataFrame) -> list[dict]:
    """Return lowercase OHLCV records expected by the React client."""
    frame = df.copy()
    frame.index = frame.index.strftime("%Y-%m-%d")
    frame = frame.reset_index().rename(columns={
        frame.index.name or "index": "date",
        "Open": "open",
        "High": "high",
        "Low": "low",
        "Close": "close",
        "Volume": "volume",
    })
    cols = ["date", "open", "high", "low", "close", "volume"]
    return frame[cols].to_dict(orient="records")


def _strategy_signal(strategy: str, df: pd.DataFrame, df_ind: pd.DataFrame,
                     fast_window: int = 20, slow_window: int = 50) -> pd.Series:
    """Map frontend strategy names to existing backend signal generators."""
    if strategy == "Momentum":
        return momentum_strategy(df, lookback=fast_window)
    if strategy == "Mean Reversion":
        return mean_reversion_strategy(df, window=fast_window, z_thresh=slow_window / 10)
    if strategy == "RSI":
        return rsi_strategy(df, oversold=30, overbought=70)
    if strategy == "MACD Crossover":
        return signal_macd_crossover(df_ind)
    return signal_dual_ma(df_ind, fast=fast_window, slow=slow_window)


# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════════════════
#  AUTH — accounts, sessions, logout.
#
#  The session token rides in an httpOnly cookie so page JavaScript can't read
#  it. Requests are same-origin (the Next rewrite proxies /api/*), so no CORS
#  dance is needed. See api/auth.py for the storage model and its limits.
# ══════════════════════════════════════════════════════════════════════════════

COOKIE = "alphaforge_session"


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE, token,
        max_age=auth.SESSION_TTL,
        httponly=True,
        samesite="lax",
        path="/",
        # secure=True once this is served over HTTPS.
    )


def current_user(request: Request) -> dict | None:
    token = request.cookies.get(COOKIE)
    if not token:
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            token = header[7:].strip()
    return auth.user_for_token(token)


def require_user(request: Request) -> dict:
    user = current_user(request)
    if not user:
        raise HTTPException(401, "Not signed in.")
    return user


@app.post("/api/auth/signup")
def api_signup(req: SignupRequest, response: Response):
    user, err = auth.create_user(req.email, req.password, req.name)
    if err:
        raise HTTPException(400, err)
    token = auth.create_session(user["id"])
    _set_session_cookie(response, token)
    return {"user": user, "token": token}


@app.post("/api/auth/login")
def api_login(req: LoginRequest, response: Response):
    user, err = auth.verify_credentials(req.email, req.password)
    if err:
        raise HTTPException(401, err)
    token = auth.create_session(user["id"])
    _set_session_cookie(response, token)
    return {"user": user, "token": token}


@app.post("/api/auth/logout")
def api_logout(request: Request, response: Response):
    auth.revoke_session(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def api_me(request: Request):
    user = current_user(request)
    return {"user": user}


@app.post("/api/auth/onboarded")
def api_onboarded(request: Request):
    """The guided tour finished — don't auto-run it for this account again."""
    user = require_user(request)
    auth.mark_onboarded(user["id"])
    return {"ok": True}


@app.get("/api/config")
def get_config():
    return {
        "tickers": cfg.DEFAULT_TICKERS,
        "demo_mode": cfg.DEMO_MODE,
        "risk_free_rate": cfg.RISK_FREE_RATE,
        "initial_capital": cfg.INITIAL_CAPITAL,
        "default_start": cfg.DEFAULT_START,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  DATA
# ══════════════════════════════════════════════════════════════════════════════

def _load_frame(ticker: str, start: str, live: bool, interval: str, lookback: str):
    """
    Static vs Live loader — the same split the Streamlit Data Engine uses.
    Both branches call the existing core.data functions unchanged.
    """
    if live:
        return get_live_data(
            ticker,
            time_interval=interval,
            start=start,
            lookback_period=lookback,
        )
    return get_ohlcv(ticker, start)


def _frame_meta(df: pd.DataFrame, live: bool, interval: str) -> dict:
    """Mirror of utils' data_engine_status(): source badge + last bar."""
    source = str(df.attrs.get("data_source", "demo" if cfg.DEMO_MODE else "real")).lower()
    badge = {
        "real": "LIVE REAL DATA",
        "demo": "DEMO DATA",
        "mixed": "MIXED DATA (REAL + DEMO)",
    }.get(source, "UNKNOWN DATA SOURCE")
    last = df.index[-1].strftime("%Y-%m-%d %H:%M") if len(df) else None
    return {
        "source": source,
        "badge": badge,
        "mode": "Live Mode" if live else "Static Mode",
        "interval": interval if live else "1d",
        "last_bar": last,
    }


@app.get("/api/ohlcv/{ticker}")
def api_ohlcv(
    ticker: str,
    start: str = "2020-01-01",
    live: bool = False,
    interval: str = "1m",
    lookback: str = "1d",
):
    try:
        df = _load_frame(ticker, start, live, interval, lookback)
        return {
            "data": df_to_records(df),
            "rows": len(df),
            "meta": _frame_meta(df, live, interval),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/returns/{ticker}")
def api_returns(ticker: str, start: str = "2020-01-01"):
    try:
        df = get_ohlcv(ticker, start)
        ret = returns(df)
        return {"data": series_to_records(ret, "return"), "rows": len(ret)}
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  METRICS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/metrics/{ticker}")
def api_metrics(
    ticker: str,
    start: str = "2020-01-01",
    live: bool = False,
    interval: str = "1m",
    lookback: str = "1d",
):
    try:
        df = _load_frame(ticker, start, live, interval, lookback)
        ret = returns(df)
        met = summary_table(ret, cfg.RISK_FREE_RATE)
        return met
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  RISK
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/risk/{ticker}")
def api_risk(ticker: str, start: str = "2015-01-01", confidence: float = 0.95):
    try:
        df = get_ohlcv(ticker, start)
        ret = returns(df)
        var_h = var_historical(ret, confidence)
        cvar_h = cvar_historical(ret, confidence)
        var_p = var_parametric(ret, confidence)
        vol_a = annualised_vol(ret)

        # Return distribution data
        hist_data = ret.dropna().tolist()

        # Rolling VaR
        roll_var = ret.rolling(63).quantile(1 - confidence).dropna()

        # Stress tests
        scenarios = {
            "2008 Financial Crisis": ("2008-09-01", "2009-03-01"),
            "COVID-19 Crash": ("2020-02-01", "2020-04-01"),
            "2022 Rate Shock": ("2022-01-01", "2022-10-01"),
            "2020 Tech Rally": ("2020-04-01", "2021-01-01"),
            "2018 Q4 Selloff": ("2018-10-01", "2018-12-31"),
        }
        stress_rows = []
        for name, (s, e) in scenarios.items():
            # Mask off ret.index, not df.index — returns() drops the first row,
            # so a df-length boolean would be one element too long.
            mask = (ret.index >= s) & (ret.index <= e)
            if mask.sum() < 10:
                continue
            r = ret[mask]
            pnl = float((1 + r).prod() - 1)
            mv = var_historical(r, 0.95)
            stress_rows.append({
                "scenario": name, "period": f"{s} → {e}",
                "total_return": round(pnl, 4),
                # Peak-to-trough drawdown, same definition the Streamlit page uses.
                "max_drawdown": round(max_drawdown(r), 4),
                "var_95": round(mv, 4),
                "var_t_95": round(var_t_dist(r, 0.95), 4),
                "worst_day": round(float(r.min()), 4),
                "volatility": round(float(r.std() * np.sqrt(252)), 4),
            })

        # Cumulative return
        cum = ((1 + ret).cumprod()).dropna()

        return {
            "var_historical": round(var_h, 6),
            "cvar_historical": round(cvar_h, 6),
            "var_parametric": round(var_p, 6),
            "annualised_vol": round(vol_a, 6),
            "return_distribution": hist_data[:500],
            "rolling_var": series_to_records(roll_var, "rolling_var"),
            "returns_ts": series_to_records(ret, "return"),
            "stress_tests": stress_rows,
            "cumulative_return": series_to_records(cum, "cumulative"),
            "tail_events": int((ret <= var_h).sum()),
            "worst_day": round(float(ret.min()), 6),
            "best_day": round(float(ret.max()), 6),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  INDICATORS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/indicators/{ticker}")
def api_indicators(
    ticker: str,
    start: str = "2020-01-01",
    live: bool = False,
    interval: str = "1m",
    lookback: str = "1d",
):
    try:
        df = _load_frame(ticker, start, live, interval, lookback)
        df_ind = add_all_indicators(df)
        return {
            "data": df_to_records(df_ind),
            "rows": len(df_ind),
            "meta": _frame_meta(df, live, interval),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  BACKTEST
# ══════════════════════════════════════════════════════════════════════════════

class BacktestRequest(BaseModel):
    ticker: str = "GOOG"
    start: str = "2020-01-01"
    strategy: str = "Momentum"
    fast_window: int = 20
    slow_window: int = 50
    capital: float = 100_000.0
    commission: float = 0.0003
    slippage_bps: float = 5.0


@app.post("/api/backtest")
def api_backtest(req: BacktestRequest):
    try:
        df = get_ohlcv(req.ticker, req.start)
        df_ind = add_all_indicators(df)

        if req.strategy == "Momentum":
            signal = momentum_strategy(df, lookback=req.fast_window)
        elif req.strategy == "Mean Reversion":
            signal = mean_reversion_strategy(df, window=req.fast_window, z_thresh=req.slow_window / 10)
        elif req.strategy == "RSI":
            signal = rsi_strategy(df, oversold=req.fast_window, overbought=req.slow_window)
        elif req.strategy == "MACD Crossover":
            signal = signal_macd_crossover(df_ind)
        else:
            signal = signal_dual_ma(df_ind, fast=req.fast_window, slow=req.slow_window)

        bcfg = BacktestConfig(
            initial_capital=req.capital,
            commission_pct=req.commission,
            slippage_bps=req.slippage_bps,
            risk_free_rate=cfg.RISK_FREE_RATE,
        )
        result = run_backtest(df["Close"], signal, bcfg)

        ret = returns(df)
        bh_cum = ((1 + ret).cumprod()).dropna()

        return {
            "metrics": result.metrics,
            "equity_curve": series_to_records(result.equity_curve, "equity"),
            "daily_returns": series_to_records(result.daily_returns, "return"),
            "trade_log": result.trade_log.to_dict(orient="records") if len(result.trade_log) else [],
            "rolling_sharpe": series_to_records(result.rolling_sharpe, "sharpe"),
            "buy_hold_cumulative": series_to_records(bh_cum, "cumulative"),
            "strategy_cumulative": series_to_records(
                (1 + result.daily_returns).cumprod().dropna(), "cumulative"
            ),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  PREDICTION
# ══════════════════════════════════════════════════════════════════════════════

class PredictionRequest(BaseModel):
    ticker: str = "GOOG"
    steps: int = 5
    start: str = "2018-01-01"
    features: list[str] = ["Close"]
    epochs: int = 10
    look_back: int = 60


@app.post("/api/prediction/arima")
def api_arima(req: PredictionRequest):
    try:
        df = get_ohlcv(req.ticker, req.start)
        ret = returns(df)
        result = arima_forecast(ret, req.steps)
        if result.empty:
            return {"data": [], "historical": series_to_records(ret.tail(60), "return")}
        return {
            "data": df_to_records(result),
            "historical": series_to_records(ret.tail(60), "return"),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/prediction/garch")
def api_garch(req: PredictionRequest):
    try:
        df = get_ohlcv(req.ticker, req.start)
        ret = returns(df)
        result = garch_forecast(ret, req.steps)
        hist_vol = (ret.rolling(21).std().dropna() * (252 ** 0.5)).tail(60)
        if result.empty:
            return {"data": [], "historical_vol": series_to_records(hist_vol, "vol")}
        return {
            "data": df_to_records(result),
            "historical_vol": series_to_records(hist_vol, "vol"),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/prediction/lstm")
def api_lstm(req: PredictionRequest):
    try:
        df = get_ohlcv(req.ticker, req.start)
        result = lstm_forecast(df, req.features, req.steps, req.look_back, req.epochs)
        hist = df["Close"].tail(60)
        return {
            "data": df_to_records(result),
            "historical": series_to_records(hist, "close"),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  PREDICTION STUDIO — multi-model (XGBoost + LSTM + Transformer) with ensembling.
#
#  A full train is ~380s on 2,200 rows, so this runs as a background job the
#  client polls. All forecasting is core.prediction's; api.prediction_jobs only
#  orchestrates threads and serialises. Trained models are retained per job so
#  "Refresh Forecast" can re-run inference without retraining.
# ══════════════════════════════════════════════════════════════════════════════

class PredictionStudioRequest(BaseModel):
    ticker: str = "GOOG"
    start: str = "2018-01-01"
    steps: int = 10            # Forecast Days   (Streamlit: 1–30, default 10)
    look_back: int = 60        # Look-back       (20–120, default 60)
    epochs: int = 10           # Epochs          (5–50, default 10)
    include_transformer: bool = True
    ensemble_method: str = "weighted"   # weighted | simple


def _studio_params(req: PredictionStudioRequest) -> dict:
    return {
        "ticker": req.ticker.strip().upper(),
        "start": req.start,
        "steps": max(1, min(30, int(req.steps))),
        "look_back": max(20, min(120, int(req.look_back))),
        "epochs": max(1, min(50, int(req.epochs))),
        "include_transformer": bool(req.include_transformer),
        "ensemble_method": ("simple" if req.ensemble_method == "simple" else "weighted"),
    }


@app.post("/api/prediction/studio/train")
def api_prediction_studio_train(req: PredictionStudioRequest):
    """Kick off a training run. Returns immediately with a job id to poll."""
    try:
        import api.prediction_jobs as pj

        params = _studio_params(req)
        df = get_ohlcv(params["ticker"], params["start"])
        data_source = str(df.attrs.get("data_source", "unknown")) if hasattr(df, "attrs") else "unknown"

        job_id = pj.create_job("train", params)
        threading.Thread(
            target=pj.run_training_job,
            args=(job_id, df, params, data_source),
            daemon=True,
        ).start()
        return {"job_id": job_id, "status": "queued", "params": params}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/prediction/studio/refresh/{source_job_id}")
def api_prediction_studio_refresh(source_job_id: str, req: PredictionStudioRequest):
    """Re-run inference against fresh data using an existing run's trained models."""
    try:
        import api.prediction_jobs as pj

        if pj.get_raw(source_job_id) is None:
            raise HTTPException(404, "No trained models for that run — train again first.")

        params = _studio_params(req)
        df = get_ohlcv(params["ticker"], params["start"])
        data_source = str(df.attrs.get("data_source", "unknown")) if hasattr(df, "attrs") else "unknown"

        job_id = pj.create_job("refresh", params)
        threading.Thread(
            target=pj.run_refresh_job,
            args=(job_id, source_job_id, df, params, data_source),
            daemon=True,
        ).start()
        return {"job_id": job_id, "status": "queued", "params": params}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/prediction/studio/jobs/{job_id}")
def api_prediction_studio_job(job_id: str):
    """Poll a job. Carries the full serialised result once status is 'done'."""
    import api.prediction_jobs as pj

    job = pj.get_job(job_id)
    if job is None:
        raise HTTPException(404, "Unknown job id — it may have expired after an API restart.")
    return _json_safe(job)


@app.get("/api/prediction/studio/jobs")
def api_prediction_studio_jobs():
    import api.prediction_jobs as pj
    return {"jobs": pj.list_jobs()}


@app.delete("/api/prediction/studio/jobs/{job_id}")
def api_prediction_studio_delete(job_id: str):
    import api.prediction_jobs as pj
    return {"deleted": pj.delete_job(job_id)}


# ══════════════════════════════════════════════════════════════════════════════
#  PORTFOLIO
# ══════════════════════════════════════════════════════════════════════════════

class PortfolioRequest(BaseModel):
    tickers: list[str] = ["GOOG", "NVDA", "META", "AMZN"]
    n_portfolios: int = 1000
    start: str = "2018-01-01"


@app.post("/api/portfolio/frontier")
def api_frontier(req: PortfolioRequest):
    try:
        prices = get_multi_ohlcv(req.tickers, req.start)
        ret_df = align_returns(prices)
        if ret_df.empty or len(ret_df) < 30:
            raise HTTPException(400, "Not enough data for portfolio optimisation")

        result = monte_carlo_frontier(ret_df, req.n_portfolios, cfg.RISK_FREE_RATE)
        ms = result["max_sharpe"]
        mv = result["min_vol"]

        return {
            "frontier": {
                "returns": result["returns"].tolist(),
                "vols": result["vols"].tolist(),
                "sharpes": result["sharpes"].tolist(),
            },
            "max_sharpe": {
                "weights": ms["weights"].tolist(),
                "ret": round(ms["ret"], 4),
                "vol": round(ms["vol"], 4),
                "sharpe": round(ms["sharpe"], 4),
            },
            "min_vol": {
                "weights": mv["weights"].tolist(),
                "ret": round(mv["ret"], 4),
                "vol": round(mv["vol"], 4),
                "sharpe": round(mv["sharpe"], 4),
            },
            "tickers": req.tickers,
            "correlation": ret_df.corr().round(4).to_dict(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


class PortfolioFullRequest(BaseModel):
    tickers: list[str] = ["GOOG", "NVDA", "META", "AMZN"]
    start: str = "2018-01-01"
    max_weight: float = 0.40
    cost_bps: float = 10.0
    rebal_days: int = 21


@app.post("/api/portfolio/full")
def api_portfolio_full(req: PortfolioFullRequest):
    """
    The full Portfolio page: live signals (covariance health, regime, timeline),
    the analytic efficient frontier, the regime-adaptive strategy, risk parity
    with risk contributions, and the correlation matrix.

    Optimiser maths comes from api.portfolio_analytics, which replicates the
    helpers defined inline in the Streamlit page (they are not in core/).
    """
    try:
        import api.portfolio_analytics as pa

        tickers = [t.strip().upper() for t in req.tickers if t and t.strip()]
        if len(tickers) < 2:
            raise HTTPException(400, "Enter at least 2 tickers.")

        prices = get_multi_ohlcv(tickers, start=req.start)
        ret_df = align_returns(prices).dropna()
        if ret_df.empty or ret_df.shape[1] < 2:
            raise HTTPException(400, "Could not load data for these tickers.")

        tickers = list(ret_df.columns)
        n = len(tickers)
        equal_weights = np.ones(n) / n
        rf = cfg.RISK_FREE_RATE

        health = pa.covariance_health(ret_df)
        regime_info = pa.detect_market_regime(ret_df)

        cov = pa.ledoit_wolf_cov(ret_df)
        mu = ret_df.mean().values * pa.TRADING_DAYS

        ms_w = pa.analytic_max_sharpe(mu, cov, rf, req.max_weight)
        mv_w = pa.analytic_min_vol(mu, cov, req.max_weight)
        rp_w = pa.risk_parity_weights_lw(cov)

        def pack(w):
            return {
                "weights": [float(x) for x in w],
                "stats": pa.portfolio_stats_full(w, ret_df, mu, cov, rf),
                "cost": pa.net_of_cost_sharpe(w, equal_weights, ret_df,
                                              req.cost_bps, req.rebal_days, rf),
                "concentration": pa.concentration_signal(w, tickers),
                "point": {"vol": float(np.sqrt(w @ cov @ w)), "ret": float(w @ mu)},
            }

        strategies = {
            "Max Sharpe": pack(ms_w),
            "Min Variance": pack(mv_w),
            "Risk Parity": pack(rp_w),
            "Equal Weight": pack(equal_weights),
        }

        # Regime timeline — mapped to -1 / 0 / +1 like the Streamlit sparkline.
        eq_ret = ret_df.mean(axis=1).tail(252)
        try:
            if len(eq_ret) >= 120:
                _, reg_s, _ = pa.safe_fit_hmm(eq_ret, n_states=3)
                reg_map = {r: (1 if "Bull" in str(r) else -1 if "Bear" in str(r) else 0)
                           for r in reg_s.unique()}
                timeline = reg_s.map(reg_map)
            else:
                timeline = np.sign(eq_ret.rolling(21).sum().fillna(0)).rename("Regime")
        except Exception:
            timeline = pd.Series(dtype=float)

        corr = ret_df.corr()

        return _json_safe({
            "tickers": tickers,
            "settings": {"max_weight": req.max_weight, "cost_bps": req.cost_bps,
                         "rebal_days": req.rebal_days, "risk_free_rate": rf},
            "covariance_health": health,
            "regime": {
                "current": regime_info["current"],
                "strategy": regime_info["strategy"],
                "reason": regime_info["reason"],
                "color": regime_info["color"],
                "regime_pct": {str(k): float(v) for k, v in (regime_info["regime_pct"] or {}).items()},
            },
            "regime_timeline": series_to_records(timeline.dropna(), "v") if len(timeline) else [],
            "strategies": strategies,
            "risk_contributions": {
                "Risk Parity": [float(x) for x in pa.risk_contributions(rp_w, cov)],
                "Equal Weight": [float(x) for x in pa.risk_contributions(equal_weights, cov)],
            },
            "correlation": {r: {c: float(corr.loc[r, c]) for c in tickers} for r in tickers},
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/portfolio/frontier-analytic")
def api_portfolio_frontier_analytic(req: PortfolioFullRequest):
    """
    The analytic efficient frontier only — a convex solve per target return.
    Its own route because ~50 SLSQP solves take longer than everything else on
    the page combined and would push a bundled response past the proxy timeout.
    """
    try:
        import api.portfolio_analytics as pa

        tickers = [t.strip().upper() for t in req.tickers if t and t.strip()]
        if len(tickers) < 2:
            raise HTTPException(400, "Enter at least 2 tickers.")
        prices = get_multi_ohlcv(tickers, start=req.start)
        ret_df = align_returns(prices).dropna()
        if ret_df.empty or ret_df.shape[1] < 2:
            raise HTTPException(400, "Could not load data for these tickers.")

        cov = pa.ledoit_wolf_cov(ret_df)
        mu = ret_df.mean().values * pa.TRADING_DAYS
        frontier = pa.build_analytic_frontier(mu, cov, cfg.RISK_FREE_RATE)
        return _json_safe({
            "vols": [float(v) for v in frontier["vols"]],
            "rets": [float(r) for r in frontier["rets"]],
            "risk_free_rate": cfg.RISK_FREE_RATE,
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/portfolio/risk-parity")
def api_risk_parity(req: PortfolioRequest):
    try:
        prices = get_multi_ohlcv(req.tickers, req.start)
        ret_df = align_returns(prices)
        rp_w = risk_parity_weights(ret_df)
        stats = portfolio_stats(rp_w, ret_df, cfg.RISK_FREE_RATE)
        return {
            "weights": rp_w.tolist(),
            "tickers": req.tickers,
            "stats": {k: round(v, 4) for k, v in stats.items()},
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# Sentiment API removed


# ══════════════════════════════════════════════════════════════════════════════
#  FACTORS
# ══════════════════════════════════════════════════════════════════════════════

class FactorRequest(BaseModel):
    tickers: list[str] = ["GOOG", "NVDA", "META", "AMZN"]
    fwd_days: int = 5
    start: str = "2015-01-01"
    # Deep-analysis settings, mirroring the Streamlit page's advanced controls.
    factor: str = "Momentum"
    cost_bps: float = 40.0
    rebal_freq: int = 21
    n_quintiles: int = 5


@app.post("/api/factors")
def api_factors(req: FactorRequest):
    try:
        prices = get_multi_ohlcv(req.tickers, req.start)
        factor_df = build_factor_matrix(prices)
        # The matrix is indexed by ticker — name it so reset_index keeps a
        # labelled column instead of an anonymous "index".
        factor_df.index.name = "Ticker"

        # IC per factor
        fwd_map = {}
        for t in req.tickers:
            ret = returns(prices[t])
            fwd_map[t] = ret.shift(-req.fwd_days).dropna()

        factor_names = ["Momentum", "LowVol", "Size", "Quality", "Value"]
        factor_fns = [momentum_factor, low_vol_factor, size_factor, quality_factor, value_factor]

        ic_rows = []
        for fname, ffn in zip(factor_names, factor_fns):
            scores = ffn(prices).dropna()
            fwd_latest = pd.Series({
                t: fwd_map[t].iloc[-1] if len(fwd_map[t]) > 0 else np.nan
                for t in req.tickers
            })
            ic = information_coefficient(scores, fwd_latest)
            ic_rows.append({"factor": fname, "ic": round(ic, 4)})

        # Decay curve
        decay = factor_decay(prices, momentum_factor, horizons=[1, 5, 10, 21, 63, 126])

        # ── IC-weighted composite + full time-series IC per factor ───────────
        ts_ic_all = {
            name: compute_timeseries_ic(prices, factor_name=name,
                                        fwd_days=req.fwd_days,
                                        rebalance_freq=req.rebal_freq)
            for name in FACTOR_FNS
        }
        composite_scores, weights = ic_weighted_composite(prices, ts_ic_all)

        ic_summary = []
        for name, ts_df in ts_ic_all.items():
            row = dict(factor_summary_stats(ts_df))
            row["Factor"] = name
            ic_summary.append(row)

        comp = composite_scores.sort_values(ascending=False)
        composite_rows = [
            {"ticker": str(t), "score": float(v), "rank": i + 1}
            for i, (t, v) in enumerate(comp.items())
        ]

        return _json_safe({
            # ── existing shape, unchanged ────────────────────────────────────
            "factor_matrix": df_to_records(factor_df),
            "ic_scores": ic_rows,
            "decay_curve": df_to_records(decay),
            "tickers": req.tickers,
            # ── sub-features ────────────────────────────────────────────────
            "factors": list(FACTOR_FNS.keys()),
            "primary_factor": req.factor if req.factor in FACTOR_FNS else list(FACTOR_FNS)[0],
            "ic_summary": ic_summary,
            "composite": {
                "weights": {k: float(v) for k, v in weights.items()},
                "scores": composite_rows,
            },
            "ts_ic": {
                name: df_to_records(ts_df) if not ts_df.empty else []
                for name, ts_df in ts_ic_all.items()
            },
            "settings": {
                "fwd_days": req.fwd_days, "cost_bps": req.cost_bps,
                "rebal_freq": req.rebal_freq, "n_quintiles": req.n_quintiles,
            },
        })
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  FACTOR SUB-FEATURES — the Streamlit Factor Lab's deep-analysis sections.
#  One route per panel: the quintile backtest, regime IC sweep and crowding
#  scan each walk the full history, so bundling them would risk the timeout.
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/factors/quintile")
def api_factors_quintile(req: FactorRequest):
    """Cost-adjusted quintile backtest — Novy-Marx & Velikov (2016)."""
    try:
        prices = get_multi_ohlcv(req.tickers, req.start)
        qbt = cost_adjusted_quintile_bt(
            prices, factor_name=req.factor, fwd_days=req.fwd_days,
            round_trip_cost_bps=float(req.cost_bps),
            n_quintiles=int(req.n_quintiles),
            rebalance_freq=int(req.rebal_freq),
        )
        if "error" in qbt:
            return {"error": qbt["error"]}
        table = qbt.get("table")
        return _json_safe({
            "ls_gross_cagr": qbt.get("ls_gross_cagr"),
            "ls_net_cagr": qbt.get("ls_net_cagr"),
            "avg_turnover": qbt.get("avg_turnover"),
            "cost_bps": qbt.get("cost_bps"),
            "rebalance_freq_days": qbt.get("rebalance_freq_days"),
            "table": table.to_dict(orient="records") if table is not None and not table.empty else [],
            "error": None,
        })
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/factors/regime")
def api_factors_regime(req: FactorRequest):
    """Regime-conditioned factor IC — Daniel & Moskowitz (2016)."""
    try:
        prices = get_multi_ohlcv(req.tickers, req.start)
        reg = regime_factor_ic(prices, fwd_days=req.fwd_days)
        if reg.empty:
            return {"rows": [], "pivot": {}, "best": None, "worst": None}
        rows = reg.to_dict(orient="records")
        piv = reg.pivot_table(index="Factor", columns="Regime",
                              values="Mean IC", aggfunc="mean")
        pivot = {str(i): {str(c): float(piv.loc[i, c]) for c in piv.columns
                          if pd.notna(piv.loc[i, c])} for i in piv.index}
        srt = reg.sort_values("Mean IC", ascending=False)
        return _json_safe({
            "rows": rows,
            "pivot": pivot,
            "regimes": [str(c) for c in piv.columns],
            "best": srt.iloc[0].to_dict(),
            "worst": srt.iloc[-1].to_dict(),
        })
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/factors/attribution")
def api_factors_attribution(req: FactorRequest):
    """Carhart (1997) attribution of the equal-weight universe return."""
    try:
        prices = get_multi_ohlcv(req.tickers, req.start)
        rets = [prices[t]["Close"].pct_change().dropna().rename(t)
                for t in req.tickers if t in prices]
        if not rets:
            return {"error": "No return data available."}
        strat_ret = pd.concat(rets, axis=1).dropna().mean(axis=1)
        attr = factor_attribution(strat_ret, prices, rf=cfg.RISK_FREE_RATE)
        if "error" in attr:
            return {"error": attr["error"]}
        table = attr.get("table")
        return _json_safe({
            "alpha_pct": attr.get("alpha_pct"),
            "alpha_tstat": attr.get("alpha_tstat"),
            "r_squared": attr.get("r_squared"),
            "n_obs": attr.get("n_obs"),
            "table": table.to_dict(orient="records") if table is not None and not table.empty else [],
            "error": None,
        })
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/factors/crowding")
def api_factors_crowding(req: FactorRequest):
    """Factor crowding via collapse in score dispersion — Khandani & Lo (2007)."""
    try:
        prices = get_multi_ohlcv(req.tickers, req.start)
        crowd = detect_factor_crowding(prices, factor_name=req.factor)
        if "error" in crowd:
            return {"error": crowd["error"]}
        series = crowd.get("crowding_series")
        rows = series.to_dict(orient="records") if series is not None and not series.empty else []
        lo_pct = float(series["Dispersion"].quantile(0.25)) if rows else None
        return _json_safe({
            "is_crowded": bool(crowd.get("is_crowded")),
            "crowding_level": crowd.get("crowding_level"),
            "current_pctile": crowd.get("current_pctile"),
            "current_dispersion": crowd.get("current_dispersion"),
            "avg_autocorr": crowd.get("avg_autocorr"),
            "series": rows,
            "crowding_zone": lo_pct,
            "error": None,
        })
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/factors/decay")
def api_factors_decay(req: FactorRequest):
    """Cross-sectional IC decay across horizons — Grinold & Kahn (1999)."""
    try:
        prices = get_multi_ohlcv(req.tickers, req.start)
        dec = cross_sectional_decay(prices, factor_name=req.factor,
                                    horizons=[1, 5, 10, 21, 63, 126])
        if dec.empty:
            return {"rows": [], "optimal_horizon": None}
        rows = dec.to_dict(orient="records")
        pos = dec[dec["IC"] > 0.02]
        optimal = int(pos["Horizon (days)"].max()) if not pos.empty else None
        return _json_safe({"rows": rows, "optimal_horizon": optimal})
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  REGIME
# ══════════════════════════════════════════════════════════════════════════════

class RegimeRequest(BaseModel):
    n_states: int = 2


def _regime_episodes(regimes: pd.Series) -> list[dict]:
    """Consecutive same-regime runs — the duration distribution."""
    if regimes.empty:
        return []
    out, cur, run = [], regimes.iloc[0], 1
    for i in range(1, len(regimes)):
        if regimes.iloc[i] == cur:
            run += 1
        else:
            out.append({"regime": str(cur), "duration": run})
            cur, run = regimes.iloc[i], 1
    out.append({"regime": str(cur), "duration": run})
    return out


def _age_scalar_series(regimes: pd.Series) -> pd.Series:
    """
    core.regime_detector.regime_age_scalar evaluated at every point, in one pass.
    The Streamlit page calls that function once per prefix (O(n²)); this produces
    the identical series using the same thresholds.
    """
    vals, prev, run = [], None, 0
    for r in regimes.values:
        run = run + 1 if r == prev else 1
        prev = r
        if "Bull" in str(r):
            s = min(1.0, 0.5 + (run / 30) * 0.5)
        elif "Bear" in str(r):
            s = 0.4 if run > 180 else 0.1
        else:
            s = 0.5
        vals.append(round(float(s), 3))
    return pd.Series(vals, index=regimes.index)


def _fit_regimes(ret: pd.Series, df: pd.DataFrame, n_states: int):
    """
    Run the full analysis, falling back to fewer states when the Gaussian HMM
    can't reach a positive-definite covariance (data-dependent, not a bug).
    """
    last_err: Exception | None = None
    for n in [n_states] + [k for k in (3, 2) if k != n_states]:
        try:
            return full_regime_analysis(ret, df, n_states=n), n
        except Exception as err:  # noqa: BLE001 — try the next state count
            last_err = err
    raise RuntimeError(f"HMM could not fit this series ({last_err}). Try a longer date range.")


@app.post("/api/regime/{ticker}")
def api_regime(ticker: str, req: RegimeRequest, start: str = "2015-01-01"):
    """
    The full Regime page: HMM map, forward-pass probabilities (no lookahead),
    critical-slowing-down early warning, strategy router, and regime statistics.
    Everything is computed by core.regime_detector.full_regime_analysis.
    """
    try:
        df = get_ohlcv(ticker, start)
        ret = returns(df)

        R, n_used = _fit_regimes(ret, df, req.n_states)
        regimes = R["regimes"]
        fwd = R["fwd_proba"]
        ew = R["early_warning"]
        strategy = R["strategy"]

        cond_df = regime_conditional_sharpe(ret, regimes, cfg.RISK_FREE_RATE)
        counts = regimes.value_counts().to_dict()
        current = regimes.iloc[-1]

        recs = {
            "Bull 📈": "Momentum strategy — trend-following, long bias, wider stops.",
            "Sideways ↔": "Mean-reversion — Bollinger Band reversals, tighter range trading.",
            "Bear 📉": "Defensive / short bias — reduce position sizes, VIX hedges.",
        }

        # Price + regime data
        price_data = df[["Close"]].copy()
        price_data["regime"] = regimes.reindex(price_data.index).ffill()
        price_data["return"] = ret.reindex(price_data.index)

        bull_cols = [c for c in fwd.columns if "Bull" in str(c)]
        bear_cols = [c for c in fwd.columns if "Bear" in str(c)]
        bull_prob = float(fwd[bull_cols[0]].iloc[-1]) if bull_cols and len(fwd) else 0.5
        bear_prob = float(fwd[bear_cols[0]].iloc[-1]) if bear_cols and len(fwd) else 0.5

        # ── High-confidence periods: only the rows where the label flips ──────
        high_conf = []
        if bull_cols and bear_cols and len(fwd):
            prev_label = None
            for date in fwd.index:
                b, r_ = float(fwd.loc[date, bull_cols[0]]), float(fwd.loc[date, bear_cols[0]])
                lab = "Bull 📈" if b > 0.75 else "Bear 📉" if r_ > 0.75 else None
                if lab and lab != prev_label:
                    high_conf.append({
                        "date": date.strftime("%Y-%m-%d"),
                        "regime": lab,
                        "confidence": round(b if lab.startswith("Bull") else r_, 4),
                    })
                if lab:
                    prev_label = lab

        # ── Empirical transition matrix: P(next | current) ───────────────────
        uniq = list(regimes.unique())
        trans = {a: {b: 0.0 for b in uniq} for a in uniq}
        for i in range(1, len(regimes)):
            trans[regimes.iloc[i - 1]][regimes.iloc[i]] += 1
        transition = {
            a: {b: (v / tot if (tot := sum(row.values())) else 0.0) for b, v in row.items()}
            for a, row in trans.items()
        }

        episodes = _regime_episodes(regimes)
        dur_df = pd.DataFrame(episodes)
        duration_stats = [
            {
                "regime": str(name),
                "mean_days": round(float(g["duration"].mean()), 1),
                "median_days": float(g["duration"].median()),
                "max_days": int(g["duration"].max()),
                "min_days": int(g["duration"].min()),
                "episodes": int(len(g)),
            }
            for name, g in dur_df.groupby("regime")
        ] if not dur_df.empty else []

        # ── Return vs volatility by regime (scatter), thinned for transport ──
        rv = pd.DataFrame({
            "ret": ret,
            "vol": ret.rolling(21).std() * np.sqrt(252),
            "regime": regimes,
        }).dropna()
        step = max(1, len(rv) // 700)
        scatter = [
            {"vol": float(r.vol), "ret": float(r.ret), "regime": str(r.regime)}
            for r in rv.iloc[::step].itertuples()
        ]

        return _json_safe({
            # ── existing shape, unchanged ────────────────────────────────────
            "price_data": df_to_records(price_data),
            "regime_counts": {k: int(v) for k, v in counts.items()},
            # cond_df carries a RangeIndex — records, not df_to_records, so the
            # table doesn't gain a meaningless "index" column.
            "conditional_sharpe": cond_df.to_dict(orient="records"),
            "current_regime": current,
            "recommendation": recs.get(current, "Hold / analyse"),
            # ── sub-features ────────────────────────────────────────────────
            "n_states_used": n_used,
            "regime_age": R["regime_age"],
            "age_scalar": R["age_scalar"],
            "bull_prob": bull_prob,
            "bear_prob": bear_prob,
            "forward_proba": df_to_records(fwd),
            "high_confidence": high_conf[-20:],
            "early_warning": {
                "active": bool(ew["active"]),
                "latest_ac1": ew["latest_ac1"],
                "latest_var": ew["latest_var"],
                "lead_msg": ew["lead_msg"],
                "ac1": series_to_records(ew["ac1"].dropna(), "v"),
                "variance": series_to_records(ew["variance"].dropna(), "v"),
                "warning": series_to_records(ew["warning"].dropna().astype(int), "v"),
            },
            "strategy": {
                "regime": strategy["regime"],
                "weights": strategy["weights"],
                "recommendations": strategy["recommendations"],
            },
            "factor_weights_by_regime": REGIME_FACTOR_WEIGHTS,
            "age_scalar_series": series_to_records(_age_scalar_series(regimes), "v"),
            "transition_matrix": transition,
            "duration_episodes": episodes,
            "duration_stats": duration_stats,
            "return_vol_scatter": scatter,
        })
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/regime/rolling/{ticker}")
def api_regime_rolling(ticker: str, req: RegimeRequest, start: str = "2015-01-01"):
    """
    Rolling HMM — refit every 21 days on a 252-day window, always predicting the
    next 21 days out-of-sample. Its own route because the repeated refits take
    far longer than any other panel on the page.
    """
    try:
        df = get_ohlcv(ticker, start)
        ret = returns(df)
        roll = rolling_regime_proba(ret, df, n_states=req.n_states,
                                    fit_window=252, step=21)
        if roll.empty:
            return {"rows": [], "columns": [], "note": "Rolling HMM returned no results — try a longer date range."}
        return _json_safe({
            "rows": df_to_records(roll),
            "columns": [str(c) for c in roll.columns],
            "note": None,
        })
    except Exception as e:
        raise HTTPException(500, str(e))


# Microstructure endpoints removed


# RL trainer removed


# ══════════════════════════════════════════════════════════════════════════════
#  AUDITING
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/audit/{ticker}")
def api_audit(ticker: str, start: str = "2015-01-01"):
    try:
        from statsmodels.tsa.stattools import acf, adfuller, pacf

        df = get_ohlcv(ticker, start)
        ret = df["Close"].pct_change().dropna()
        thresh = 2 * ret.std()
        anomalies = ret[ret.abs() > thresh]
        all_dates = pd.date_range(df.index.min(), df.index.max(), freq="B")
        missing_dates = [dt.strftime("%Y-%m-%d") for dt in all_dates.difference(df.index)]

        close = df["Close"].dropna()
        adf_result = adfuller(close)
        max_lags = min(40, max(len(close) // 2 - 1, 1))
        acf_values = acf(close, nlags=max_lags)
        pacf_values = pacf(close, nlags=max_lags)

        return {
            "total_rows": len(df),
            "missing_values": int(df.isnull().sum().sum()),
            "duplicates": int(df.duplicated().sum()),
            "anomalies": len(anomalies),
            "integrity_issues": int((df["High"] < df["Low"]).sum()),
            "missing_dates": missing_dates,
            "correlation": df[["Open", "High", "Low", "Close", "Volume"]].corr().round(4).to_dict(),
            "statistics": df.describe().round(4).to_dict(),
            "anomaly_data": series_to_records(anomalies.head(20), "return"),
            "adf": {
                "statistic": round(float(adf_result[0]), 6),
                "p_value": round(float(adf_result[1]), 6),
                "critical_values": {k: round(float(v), 6) for k, v in adf_result[4].items()},
                "is_stationary": bool(adf_result[1] < 0.05),
            },
            "acf": [{"lag": idx, "value": round(float(value), 6)} for idx, value in enumerate(acf_values)],
            "pacf": [{"lag": idx, "value": round(float(value), 6)} for idx, value in enumerate(pacf_values)],
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  ALERTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/alerts/{ticker}")
def api_alerts(ticker: str,
               open_thresh: float = 150, close_thresh: float = 155,
               high_thresh: float = 160, low_thresh: float = 140,
               send_notifications: bool = False):
    try:
        df = get_ohlcv(ticker)
        latest = df.iloc[-1]
        date = str(df.index[-1].date())

        alerts = []
        emails_sent = 0
        thresholds = {"Open": open_thresh, "Close": close_thresh,
                      "High": high_thresh, "Low": low_thresh}
        for metric, threshold in thresholds.items():
            price = float(latest[metric])
            triggered = price > threshold
            insight = ALERT_INSIGHTS.get(ticker, {}).get(metric, "")
            email_sent = False
            if triggered and send_notifications:
                body = build_alert_body(ticker, metric, price, threshold, insight)
                _result = send_email(f"AlphaForge Alert: {ticker} {metric}", body)
                # send_email returns (bool, reason_str) — unpack safely
                email_sent = _result[0] if isinstance(_result, tuple) else bool(_result)
                emails_sent += int(email_sent)
            alerts.append({
                "metric": metric,
                "price": round(price, 2),
                "threshold": threshold,
                "triggered": triggered,
                "insight": insight,
                "email_sent": email_sent,
            })

        return {
            "ticker": ticker,
            "date": date,
            "latest": {k: round(float(latest[k]), 2) for k in ["Open", "Close", "High", "Low", "Volume"]},
            "alerts": alerts,
            "notifications_requested": send_notifications,
            "emails_sent": emails_sent,
            "email_configured": bool(cfg.GMAIL_SENDER and cfg.GMAIL_PASSWORD and cfg.GMAIL_RECEIVER),
            "receiver_configured": bool(cfg.GMAIL_RECEIVER),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  GRAPHS (multi-chart types)
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/graphs/{ticker}")
def api_graphs(ticker: str, start: str = "2020-01-01", benchmark: str = DEFAULT_GRAPH_BENCHMARK):
    try:
        df = get_ohlcv(ticker, start)
        benchmark_df = get_ohlcv(benchmark, start)
        return build_graph_feature_payload(
            df,
            ticker=ticker,
            benchmark_df=benchmark_df,
            benchmark_ticker=benchmark,
        )
    except Exception as e:
        raise HTTPException(500, str(e))


# -----------------------------------------------------------------------------
# Frontend compatibility routes
# -----------------------------------------------------------------------------

@app.get("/ohlcv")
def compat_ohlcv(ticker: str = Query("GOOG"), start: str = "2020-01-01", end: str | None = None):
    del end
    try:
        df = get_ohlcv(ticker, start)
        return _lowercase_ohlcv(df)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/metrics")
def compat_metrics(ticker: str = Query("GOOG"), start: str = "2020-01-01", end: str | None = None):
    del end
    try:
        df = get_ohlcv(ticker, start)
        ret = returns(df)
        met = summary_table(ret, cfg.RISK_FREE_RATE)
        return {
            "sharpe": _metric_to_float(met.get("Sharpe")),
            "sortino": _metric_to_float(met.get("Sortino")),
            "cagr": _metric_to_float(met.get("CAGR")),
            "max_drawdown": _metric_to_float(met.get("Max Drawdown")),
            "win_rate": _metric_to_float(met.get("Win Rate")),
            "var_95": _metric_to_float(met.get("VaR 95%")),
            "cvar_95": _metric_to_float(met.get("CVaR 95%")),
            "ann_vol": _metric_to_float(met.get("Ann. Volatility")),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/signals")
def compat_signals(ticker: str = Query("GOOG"), start: str = "2020-01-01", end: str | None = None):
    del end
    try:
        df = get_ohlcv(ticker, start)
        df_ind = add_all_indicators(df)
        rsi_sig = signal_rsi(df_ind).fillna(0)
        macd_sig = signal_macd_crossover(df_ind).fillna(0)
        bb_sig = signal_bb_mean_reversion(df_ind).fillna(0)
        combined = (rsi_sig + macd_sig + bb_sig).clip(-1, 1)

        rows = []
        for idx, row in df_ind.iterrows():
            rows.append({
                "date": idx.strftime("%Y-%m-%d"),
                "rsi": round(float(row.get("RSI", 0.0)), 6),
                "macd": round(float(row.get("MACD", 0.0)), 6),
                "signal": int(combined.get(idx, 0)),
                "histogram": round(float(row.get("MACD_Hist", 0.0)), 6),
                "rsi_signal": int(rsi_sig.get(idx, 0)),
                "macd_signal": int(macd_sig.get(idx, 0)),
                "bb_signal": int(bb_sig.get(idx, 0)),
            })
        return rows
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/backtest")
def compat_backtest(ticker: str = Query("GOOG"), start: str = "2018-01-01",
                    end: str | None = None, strategy: str = "Momentum"):
    del end
    try:
        df = get_ohlcv(ticker, start)
        df_ind = add_all_indicators(df)
        signal = _strategy_signal(strategy, df, df_ind)
        result = run_backtest(
            df["Close"],
            signal,
            BacktestConfig(
                initial_capital=cfg.INITIAL_CAPITAL,
                commission_pct=0.001,
                slippage_bps=5.0,
                risk_free_rate=cfg.RISK_FREE_RATE,
            ),
        )
        trade_rows = []
        if len(result.trade_log):
            for _, row in result.trade_log.iterrows():
                trade_rows.append({
                    "date": str(row.get("Date", row.get("date", "")))[:10],
                    "action": str(row.get("Action", row.get("action", ""))),
                    "price": float(row.get("Price", row.get("price", 0.0))),
                    "pnl": float(row.get("PnL", row.get("pnl", 0.0))),
                })
        met = result.metrics
        return {
            "equity_curve": [{"date": r["index"], "equity": r["equity"]} for r in series_to_records(result.equity_curve, "equity")],
            "trades": trade_rows,
            "metrics": {
                "sharpe": _metric_to_float(met.get("Sharpe")),
                "sortino": _metric_to_float(met.get("Sortino")),
                "cagr": _metric_to_float(met.get("CAGR")),
                "max_drawdown": _metric_to_float(met.get("Max Drawdown")),
                "win_rate": _metric_to_float(met.get("Win Rate")),
                "var_95": _metric_to_float(met.get("VaR 95%")),
                "cvar_95": _metric_to_float(met.get("CVaR 95%")),
                "ann_vol": _metric_to_float(met.get("Ann. Volatility")),
            },
        }
    except Exception as e:
        raise HTTPException(500, str(e))


def _fast_net_returns(price: pd.Series, signal: pd.Series, rt_cost: float) -> pd.Series:
    """
    Net daily returns for a signal, using the same fixed-sizing formula as
    core.backtest_engine.run_backtest (positions act on the previous bar, costs
    charged on turnover) — without the per-run metrics table. Used only to feed
    the DSR / PBO parameter sweep, where the return series is all that matters.
    """
    common = price.index.intersection(signal.index)
    p = price.reindex(common).ffill()
    pos = signal.reindex(common).fillna(0).shift(1).fillna(0)
    asset_ret = p.pct_change().fillna(0)
    cost = pos.diff().abs() * (rt_cost / 2.0)
    return (pos * asset_ret - cost).fillna(0)


@app.get("/api/honesty/{ticker}")
def api_honesty(ticker: str, start: str = "2018-01-01", strategy: str = "Momentum",
                fast_window: int = 20, slow_window: int = 50):
    """
    The Honesty Engine over the API. Grades a strategy's backtest for overfitting
    using the Deflated Sharpe Ratio and the Probability of Backtest Overfitting,
    then returns a plain verdict — 'PROBABLY REAL', 'LIKELY OVERFIT' or
    'INCONCLUSIVE' — alongside the account blow-up and beat-buy-and-hold checks.
    """
    try:
        df = get_ohlcv(ticker, start)
        df_ind = add_all_indicators(df)
        bcfg = BacktestConfig(
            initial_capital=cfg.INITIAL_CAPITAL, commission_pct=0.001,
            slippage_bps=5.0, risk_free_rate=cfg.RISK_FREE_RATE,
        )
        signal = _strategy_signal(strategy, df, df_ind, fast_window, slow_window)
        result = run_backtest(df["Close"], signal, bcfg)
        bh_ret = returns(df)

        # Build an honest candidate family (parameter sweep) so DSR sees the real
        # trial variance and PBO can cross-validate the in-sample winner.
        # Uses _fast_net_returns rather than a full run_backtest per trial: the
        # sweep only needs each candidate's return series, and run_backtest also
        # fits a GARCH model for its metrics table (~2s each). Same formula, same
        # verdict — just without the per-trial metrics work.
        rt_cost = bcfg.effective_round_trip_cost()
        trials: dict[str, pd.Series] = {}
        try:
            if strategy == "Momentum":
                for lb in range(8, 36, 2):
                    trials[f"lb{lb}"] = _fast_net_returns(df["Close"], momentum_strategy(df, lookback=lb), rt_cost)
            elif strategy == "Mean Reversion":
                for w in range(8, 36, 2):
                    trials[f"w{w}"] = _fast_net_returns(df["Close"], mean_reversion_strategy(df, window=w, z_thresh=slow_window / 10), rt_cost)
            elif strategy == "RSI":
                for os_ in range(18, 34):
                    trials[f"os{os_}"] = _fast_net_returns(df["Close"], rsi_strategy(df, oversold=os_, overbought=int(slow_window)), rt_cost)
        except Exception:
            trials = {}
        matrix = pd.DataFrame(trials).dropna(how="any") if len(trials) >= 2 else None

        rep = honesty_engine.honesty_report(
            result.daily_returns, buy_hold_returns=bh_ret,
            n_trials=6, returns_matrix=matrix,
        )
        payload = rep.to_dict()
        payload["ticker"] = ticker
        payload["strategy"] = strategy
        return _json_safe(payload)
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  SIGNALS  ·  AI STRATEGY LAB  ·  PAPER TRADING
#  Thin wrappers over existing core modules — no strategy logic lives here.
# ══════════════════════════════════════════════════════════════════════════════

def _safe(v):
    """Round a float for display, or None when it isn't JSON-safe."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, 6) if math.isfinite(f) else None


def _json_safe(obj):
    """
    Recursively replace NaN/inf with None so a payload can be serialised.
    Statistics legitimately return NaN (e.g. PBO without a trials matrix), and
    JSON has no representation for it. No value is otherwise altered.
    """
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, (np.floating, np.integer)):
        f = float(obj)
        return f if math.isfinite(f) else None
    return obj


@app.get("/api/signals/{ticker}")
def api_signals(
    ticker: str,
    start: str = "2020-01-01",
    live: bool = False,
    interval: str = "1m",
    lookback: str = "1d",
):
    """Current indicator signals, using the canonical core.indicators generators."""
    try:
        df = _load_frame(ticker, start, live, interval, lookback)
        ind = add_all_indicators(df)
        rsi_sig = signal_rsi(ind).fillna(0).astype(int)
        macd_sig = signal_macd_crossover(ind).fillna(0).astype(int)
        bb_sig = signal_bb_mean_reversion(ind).fillna(0).astype(int)
        dual_sig = signal_dual_ma(ind).fillna(0).astype(int)
        combined = (rsi_sig + macd_sig + bb_sig).clip(-1, 1)

        rows = []
        for idx, row in ind.iterrows():
            rows.append({
                "date": idx.strftime("%Y-%m-%d"),
                "close": _safe(row.get("Close")),
                "rsi": _safe(row.get("RSI")),
                "macd": _safe(row.get("MACD")),
                "signal_line": _safe(row.get("Signal")),
                "histogram": _safe(row.get("Histogram")),
                "bb_upper": _safe(row.get("BB_Upper")),
                "bb_lower": _safe(row.get("BB_Lower")),
                "combined": int(combined.get(idx, 0)),
                "rsi_signal": int(rsi_sig.get(idx, 0)),
                "macd_signal": int(macd_sig.get(idx, 0)),
                "bb_signal": int(bb_sig.get(idx, 0)),
                "dual_ma_signal": int(dual_sig.get(idx, 0)),
            })

        last = rows[-1] if rows else {}
        stance = "BUY" if last.get("combined", 0) > 0 else "SELL" if last.get("combined", 0) < 0 else "HOLD"
        return {
            "data": rows,
            "rows": len(rows),
            "latest": last,
            "stance": stance,
            "meta": _frame_meta(df, live, interval),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  SIGNAL SUB-FEATURES — the Streamlit Signals page's six tabs.
#  Every number comes from core.alpha_engine; these routes only select and
#  serialise. Split per panel because signal-health and the macro fetch are
#  much slower than the main signal stack.
# ══════════════════════════════════════════════════════════════════════════════

class AlphaSignalRequest(BaseModel):
    start: str = "2018-01-01"
    fwd_days: int = 5
    ofi_threshold: float = 0.8
    skew_threshold: float = 0.7
    tickers: list[str] = ["GOOG", "NVDA", "META", "AMZN"]


@app.post("/api/signals/alpha/{ticker}")
def api_signals_alpha(ticker: str, req: AlphaSignalRequest):
    """
    The master signal stack: Volume Pressure (OFI proxy), Realized Skew
    (IV proxy), crowding, and the IC-weighted combination of all six signals.
    """
    try:
        df = get_ohlcv(ticker, req.start)
        df_ind = add_all_indicators(df)
        ret = returns(df)
        fwd = ret.shift(-req.fwd_days)

        ofi_z = compute_ofi(df)
        ofi_sig = ofi_signal(df, threshold=req.ofi_threshold)
        skew_z = compute_iv_skew_proxy(df)
        skew_sig = iv_skew_signal(df, threshold=req.skew_threshold)
        crowd = compute_crowding_score(ret)
        crowd_w = crowding_weight(ret)

        all_signals = {
            "RSI": signal_rsi(df_ind),
            "MACD": signal_macd_crossover(df_ind),
            "BB Reversion": signal_bb_mean_reversion(df_ind),
            "Dual MA": signal_dual_ma(df_ind, 20, 50),
            "OFI": ofi_sig,
            "Realized Skew": skew_sig,
        }
        combined_sig, ic_weights = combine_signals(all_signals, ret, fwd_days=req.fwd_days)

        # Per-signal IC against forward returns (the tab-1 comparison table).
        fwd_clean = fwd.dropna()
        ic_vals = []
        for name, sig in all_signals.items():
            common = sig.dropna().index.intersection(fwd_clean.index)
            if len(common) > 20:
                ic = information_coefficient(sig[common].astype(float), fwd_clean[common])
                ic_vals.append({"signal": name, "ic": round(float(ic), 4), "used": bool(ic > 0)})

        latest = lambda s, d: (float(s.dropna().iloc[-1]) if not s.dropna().empty else d)  # noqa: E731
        latest_combined = int(combined_sig.dropna().iloc[-1]) if not combined_sig.dropna().empty else 0

        # Buy/sell volume split for the volume-pressure chart.
        buy_vol = df["Volume"].where(df["Close"] >= df["Open"], 0.0)
        sell_vol = df["Volume"].where(df["Close"] < df["Open"], 0.0)
        price = pd.DataFrame({
            "close": df["Close"],
            "combined": combined_sig.reindex(df.index).fillna(0).astype(int),
            "skew_sig": skew_sig.reindex(df.index).fillna(0).astype(int),
            "ofi_z": ofi_z.reindex(df.index),
            "skew_z": skew_z.reindex(df.index),
            "crowd": crowd.reindex(df.index),
            "buy_vol": buy_vol,
            "sell_vol": sell_vol,
        })

        lc = latest(crowd, 1.0)
        return _json_safe({
            "ticker": ticker,
            "fwd_days": req.fwd_days,
            "ofi_threshold": req.ofi_threshold,
            "skew_threshold": req.skew_threshold,
            "series": df_to_records(price),
            "ic_weights": {k: float(v) for k, v in ic_weights.items()},
            "signal_ic": ic_vals,
            "latest": {
                "combined": latest_combined,
                "ofi": latest(ofi_z, 0.0),
                "skew": latest(skew_z, 0.0),
                "crowd": lc,
                "crowd_weight": float(crowd_w),
                "active_signals": sum(1 for v in ic_weights.values() if v > 0),
                "best_ic_weight": float(max(ic_weights.values(), default=0.0)),
                "n_signals": len(all_signals),
            },
            "crowd_status": ("🔴 Overcrowded" if lc > 1.3 else "🟡 Elevated" if lc > 1.1 else "🟢 Normal"),
            "crowd_action": ("Reduce 75%" if lc > 1.3 else "Reduce 35%" if lc > 1.1 else "Full size"),
        })
    except Exception as e:
        raise HTTPException(500, str(e))


HEALTH_SIGNALS = ["RSI", "MACD", "BB Reversion", "Dual MA", "OFI", "IV Skew"]


def _health_signal_series(name: str, df: pd.DataFrame, df_ind: pd.DataFrame) -> pd.Series:
    """The same six signals monitor_all_signals covers."""
    if name == "MACD":
        return signal_macd_crossover(df_ind)
    if name == "BB Reversion":
        return signal_bb_mean_reversion(df_ind)
    if name == "Dual MA":
        return signal_dual_ma(df_ind, 20, 50)
    if name == "OFI":
        return ofi_signal(df)
    if name == "IV Skew":
        return iv_skew_signal(df)
    return signal_rsi(df_ind)


@app.post("/api/signals/health/{ticker}")
def api_signals_health(ticker: str, req: AlphaSignalRequest, signal: str = "RSI"):
    """
    Signal health for ONE signal, with its rolling IC and trend line.

    Deliberately per-signal: core's rolling-IC computation costs ~4s per signal,
    so monitoring all six in one request lands around 31s and trips the dev
    proxy's ~30s ceiling. The client fans these out in parallel and assembles
    the table. The health numbers are core's compute_signal_health, unchanged —
    only the row assembly (which monitor_all_signals does inline) is repeated.
    """
    try:
        name = signal if signal in HEALTH_SIGNALS else "RSI"
        df = get_ohlcv(ticker, req.start)
        df_ind = add_all_indicators(df)
        fwd = returns(df).shift(-req.fwd_days)

        h = compute_signal_health(_health_signal_series(name, df, df_ind), fwd, window=63)

        roll = h.get("rolling_ic")
        rolling_ic, trend = [], []
        if roll is not None and not roll.empty:
            raw = roll.values.astype(float)
            rolling_ic = [
                {"i": i, "v": (float(v) if np.isfinite(v) else None)}
                for i, v in enumerate(raw)
            ]
            # Same least-squares trend line the Streamlit page draws.
            x = np.arange(len(raw))
            slope, intercept = np.polyfit(x, np.nan_to_num(raw), 1)
            trend = [{"i": int(i), "v": float(slope * i + intercept)} for i in x]

        return _json_safe({
            "row": {
                "Signal": name,
                "Health": h["health_score"],
                "Status": h["status"],
                "IC Mean": h["ic_mean"],
                "IC Std": h["ic_std"],
                "IC Trend": h["ic_trend"],
                "Weight": h["weight"],
            },
            "rolling_ic": rolling_ic,
            "ic_trend": trend,
        })
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/signals/crowding")
def api_signals_crowding(req: AlphaSignalRequest):
    """Multi-ticker crowding comparison."""
    try:
        tickers = [t.strip().upper() for t in req.tickers if t and t.strip()]
        if len(tickers) < 2:
            raise HTTPException(400, "Enter at least 2 tickers.")
        multi = get_multi_ohlcv(tickers, start=req.start)
        crowd_df = crowding_signal(multi)
        return _json_safe({
            "rows": crowd_df.to_dict(orient="records") if not crowd_df.empty else []
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# Deliberately NOT /api/signals/macro — that path shape is already claimed by
# GET /api/signals/{ticker}, which is registered first and would swallow it.
@app.get("/api/macro/regime")
def api_signals_macro(start: str = "2018-01-01"):
    """
    Cross-Asset Macro Regime Signal (VIX, credit, dollar, rates).
    Needs network access to yfinance — returns available=false when offline
    or in demo mode, exactly as the Streamlit page degrades.
    """
    try:
        macro_df = get_macro_data(start=start)
        if macro_df is None or macro_df.empty:
            return {
                "available": False,
                "note": "Macro data unavailable — this needs live network access to "
                        "fetch VIX, HYG, IEF and dollar data.",
            }
        score = compute_macro_regime_score(macro_df)
        clean = score.dropna()
        latest = float(clean.iloc[-1]) if not clean.empty else 0.0
        label, scalar = macro_regime_label(latest)
        return _json_safe({
            "available": True,
            "note": None,
            "score": latest,
            "label": label,
            "position_scalar": scalar,
            "vix": float(macro_df["vix"].iloc[-1]) if "vix" in macro_df.columns else None,
            "series": series_to_records(clean, "v"),
        })
    except Exception as e:
        raise HTTPException(500, str(e))


class BacktestFullRequest(BaseModel):
    ticker: str = "GOOG"
    strategy: str = "Momentum"
    start: str = "2018-01-01"
    fast_window: int = 20
    slow_window: int = 50
    capital: float = 100_000.0
    cost_profile: str = "India – Delivery"
    train_months: int = 36
    test_months: int = 6
    n_simulations: int = 500
    walk_forward: bool = False
    monte_carlo: bool = False
    regime_matrix: bool = False


@app.get("/api/backtest/cost-profiles")
def api_cost_profiles():
    """The market cost models offered by core.backtest_engine, with full breakdowns."""
    try:
        import core.backtest_engine as be
        out = []
        for name, cm in be.COST_PROFILES.items():
            out.append({
                "name": name,
                "round_trip": cm.total_round_trip_cost(),
                "slippage_bps": cm.slippage_bps,
                "breakdown": cm.breakdown(),
            })
        return {"profiles": out}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/backtest/full")
def api_backtest_full(req: BacktestFullRequest):
    """
    The full Backtest page: base result + walk-forward overfit detection +
    Monte Carlo luck-vs-skill + strategy×regime matrix. Every calculation is
    core.backtest_engine's — this only selects and serialises.
    """
    try:
        import core.backtest_engine as be

        df = get_ohlcv(req.ticker, req.start)
        df_ind = add_all_indicators(df)
        cost_model = be.COST_PROFILES.get(req.cost_profile) or be.INDIA_DELIVERY
        bcfg = be.BacktestConfig(
            initial_capital=float(req.capital),
            commission_pct=cost_model.brokerage,
            slippage_bps=cost_model.slippage_bps,
            risk_free_rate=cfg.RISK_FREE_RATE,
            cost_model=cost_model,
        )

        signal = _strategy_signal(req.strategy, df, df_ind, req.fast_window, req.slow_window)
        result = be.run_backtest(df["Close"], signal, bcfg)
        bh_ret = returns(df)

        payload: dict = {
            "cost_model": {
                "name": req.cost_profile,
                "round_trip": cost_model.total_round_trip_cost(),
                "breakdown": cost_model.breakdown(),
            },
            "metrics": result.metrics,
            "equity_curve": series_to_records(result.equity_curve, "equity"),
            "rolling_sharpe": series_to_records(result.rolling_sharpe, "sharpe"),
            "strategy_cumulative": series_to_records((1 + result.daily_returns).cumprod().dropna(), "cumulative"),
            "buy_hold_cumulative": series_to_records((1 + bh_ret).cumprod().dropna(), "cumulative"),
            "trade_log": result.trade_log.to_dict(orient="records") if len(result.trade_log) else [],
        }

        # Walk-forward / Monte Carlo / regime matrix are each slow enough to
        # exceed a proxy timeout when bundled. They default to off here and have
        # their own endpoints below, so the UI can load them progressively.
        # ── Walk-forward: out-of-sample overfit detection ────────────────────
        if req.walk_forward:
            def _sig_fn(price_s):
                _df = pd.DataFrame({"Close": price_s})
                if req.strategy == "Momentum":
                    return be.momentum_strategy(_df, lookback=req.fast_window)
                if req.strategy == "Mean Reversion":
                    return be.mean_reversion_strategy(_df, window=req.fast_window, z_thresh=req.slow_window / 10)
                if req.strategy == "RSI":
                    return be.rsi_strategy(_df, oversold=req.fast_window, overbought=req.slow_window)
                if req.strategy == "MACD Crossover":
                    return be.macd_crossover_strategy(_df)
                return be.dual_ma_strategy(_df, fast=req.fast_window, slow=req.slow_window)

            try:
                wf = be.run_walk_forward(
                    df["Close"], _sig_fn, bcfg,
                    be.WalkForwardConfig(train_months=req.train_months, test_months=req.test_months),
                )
                payload["walk_forward"] = {
                    "efficiency_ratio": wf.efficiency_ratio,
                    "n_folds": wf.n_folds,
                    "overfit_warning": bool(wf.overfit_warning),
                    "oos_metrics": wf.oos_metrics,
                    "fold_metrics": wf.fold_metrics.to_dict(orient="records"),
                    "oos_equity": series_to_records(wf.oos_equity, "equity"),
                }
            except Exception as err:
                payload["walk_forward"] = {"error": str(err)}

        # ── Monte Carlo: luck vs skill ───────────────────────────────────────
        if req.monte_carlo:
            try:
                mc = be.run_monte_carlo(
                    daily_returns=result.daily_returns, bh_returns=bh_ret,
                    initial_capital=float(req.capital), n_simulations=int(req.n_simulations),
                )
                payload["monte_carlo"] = {
                    "n_simulations": mc.n_simulations,
                    "prob_profit": mc.prob_profit,
                    "prob_beat_bh": mc.prob_beat_bh,
                    "risk_of_ruin": mc.risk_of_ruin,
                    "sharpe_ci_low": mc.sharpe_ci_low,
                    "sharpe_ci_high": mc.sharpe_ci_high,
                    "final_values": [float(v) for v in mc.final_values],
                    "fan": {
                        "pct_5": series_to_records(mc.pct_5, "v"),
                        "pct_25": series_to_records(mc.pct_25, "v"),
                        "pct_50": series_to_records(mc.pct_50, "v"),
                        "pct_75": series_to_records(mc.pct_75, "v"),
                        "pct_95": series_to_records(mc.pct_95, "v"),
                    },
                }
            except Exception as err:
                payload["monte_carlo"] = {"error": str(err)}

        # ── Strategy × regime performance matrix ─────────────────────────────
        if req.regime_matrix:
            try:
                mat = be.regime_strategy_matrix(df, bcfg)
                payload["regime_matrix"] = mat.to_dict(orient="records") if not mat.empty else []
            except Exception as err:
                payload["regime_matrix"] = {"error": str(err)}

        return _json_safe(payload)
    except Exception as e:
        raise HTTPException(500, str(e))


def _bt_setup(req: "BacktestFullRequest"):
    """Shared setup for the per-panel backtest endpoints."""
    import core.backtest_engine as be
    df = get_ohlcv(req.ticker, req.start)
    df_ind = add_all_indicators(df)
    cost_model = be.COST_PROFILES.get(req.cost_profile) or be.INDIA_DELIVERY
    bcfg = be.BacktestConfig(
        initial_capital=float(req.capital),
        commission_pct=cost_model.brokerage,
        slippage_bps=cost_model.slippage_bps,
        risk_free_rate=cfg.RISK_FREE_RATE,
        cost_model=cost_model,
    )
    return be, df, df_ind, bcfg


@app.post("/api/backtest/walkforward")
def api_backtest_walkforward(req: BacktestFullRequest):
    """Walk-forward overfit detection only — its own route so it can't stall the page."""
    try:
        be, df, _df_ind, bcfg = _bt_setup(req)

        def _sig_fn(price_s):
            _df = pd.DataFrame({"Close": price_s})
            if req.strategy == "Momentum":
                return be.momentum_strategy(_df, lookback=req.fast_window)
            if req.strategy == "Mean Reversion":
                return be.mean_reversion_strategy(_df, window=req.fast_window, z_thresh=req.slow_window / 10)
            if req.strategy == "RSI":
                return be.rsi_strategy(_df, oversold=req.fast_window, overbought=req.slow_window)
            if req.strategy == "MACD Crossover":
                return be.macd_crossover_strategy(_df)
            return be.dual_ma_strategy(_df, fast=req.fast_window, slow=req.slow_window)

        wf = be.run_walk_forward(
            df["Close"], _sig_fn, bcfg,
            be.WalkForwardConfig(train_months=req.train_months, test_months=req.test_months),
        )
        return _json_safe({
            "efficiency_ratio": wf.efficiency_ratio,
            "n_folds": wf.n_folds,
            "overfit_warning": bool(wf.overfit_warning),
            "oos_metrics": wf.oos_metrics,
            "fold_metrics": wf.fold_metrics.to_dict(orient="records"),
            "oos_equity": series_to_records(wf.oos_equity, "equity"),
        })
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/backtest/montecarlo")
def api_backtest_montecarlo(req: BacktestFullRequest):
    """Monte Carlo luck-vs-skill only."""
    try:
        be, df, df_ind, bcfg = _bt_setup(req)
        signal = _strategy_signal(req.strategy, df, df_ind, req.fast_window, req.slow_window)
        result = be.run_backtest(df["Close"], signal, bcfg)
        mc = be.run_monte_carlo(
            daily_returns=result.daily_returns, bh_returns=returns(df),
            initial_capital=float(req.capital), n_simulations=int(req.n_simulations),
        )
        return _json_safe({
            "n_simulations": mc.n_simulations,
            "prob_profit": mc.prob_profit,
            "prob_beat_bh": mc.prob_beat_bh,
            "risk_of_ruin": mc.risk_of_ruin,
            "sharpe_ci_low": mc.sharpe_ci_low,
            "sharpe_ci_high": mc.sharpe_ci_high,
            "final_values": [float(v) for v in mc.final_values],
            "fan": {
                "pct_5": series_to_records(mc.pct_5, "v"),
                "pct_25": series_to_records(mc.pct_25, "v"),
                "pct_50": series_to_records(mc.pct_50, "v"),
                "pct_75": series_to_records(mc.pct_75, "v"),
                "pct_95": series_to_records(mc.pct_95, "v"),
            },
        })
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/backtest/regime-matrix")
def api_backtest_regime_matrix(req: BacktestFullRequest):
    """Strategy × regime performance matrix only."""
    try:
        be, df, _df_ind, bcfg = _bt_setup(req)
        mat = be.regime_strategy_matrix(df, bcfg)
        return _json_safe({"rows": mat.to_dict(orient="records") if not mat.empty else []})
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  RISK SUB-FEATURES — the Streamlit Risk page's tabs, one route per panel.
#  Each wraps core.metrics; the GARCH series replicates the computation that
#  lives inline in app/pages/09_⚠️_Risk.py. No core/ logic is duplicated or
#  altered. Split into separate routes because the GARCH fit and the
#  multi-ticker load are each slow enough to stall a bundled response.
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/risk/methods/{ticker}")
def api_risk_methods(ticker: str, start: str = "2015-01-01", confidence: float = 0.95):
    """VaR Method Comparison — all four estimators side by side, plus tail stats."""
    try:
        df = get_ohlcv(ticker, start)
        ret = returns(df).dropna()
        if ret.empty:
            raise HTTPException(400, f"No return data for {ticker}.")

        var_h = var_historical(ret, confidence)
        var_p = var_parametric(ret, confidence)
        var_t = var_t_dist(ret, confidence)
        var_g = var_garch(ret, confidence)
        cvar_h = cvar_historical(ret, confidence)
        kurt = float(ret.kurt())

        methods = [
            {"method": "Historical", "var": var_h,
             "note": "From past returns directly. No distribution assumption."},
            {"method": "Parametric (Gaussian)", "var": var_p,
             "note": f"Assumes normal dist. Kurtosis={kurt:.1f} — "
                     + ("⚠️ fat tails, prefer t-dist" if kurt > 1 else "✅ approx normal") + "."},
            {"method": "Student-t (fat-tail)", "var": var_t,
             "note": "Fits degrees-of-freedom from data. Better for equity fat tails."},
            {"method": "GARCH(1,1)", "var": var_g,
             "note": "Accounts for vol clustering. Most responsive to current regime."},
        ]

        return _json_safe({
            "confidence": confidence,
            "var_historical": var_h,
            "var_parametric": var_p,
            "var_t_dist": var_t,
            "var_garch": var_g,
            "cvar_historical": cvar_h,
            "annualised_vol": annualised_vol(ret),
            "methods": methods,
            "return_distribution": [float(v) for v in ret.tolist()],
            "tail_events": int((ret <= var_h).sum()),
            "worst_day": float(ret.min()),
            "best_day": float(ret.max()),
            "kurtosis": kurt,
            "skewness": float(ret.skew()),
            "max_drawdown": max_drawdown(ret),
            "observations": int(len(ret)),
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/risk/garch/{ticker}")
def api_risk_garch(ticker: str, start: str = "2015-01-01",
                   confidence: float = 0.95, window: int = 63):
    """
    GARCH conditional volatility vs rolling volatility.
    Mirrors the Streamlit tab: rolling-quantile VaR against GARCH(1,1)-t VaR,
    and rolling annualised vol against GARCH conditional vol.
    """
    try:
        df = get_ohlcv(ticker, start)
        ret = returns(df).dropna()
        if ret.empty:
            raise HTTPException(400, f"No return data for {ticker}.")

        roll_var = ret.rolling(window).quantile(1 - confidence)
        roll_vol = ret.rolling(window).std() * np.sqrt(252)

        garch_var = pd.Series(dtype=float)
        garch_vol = pd.Series(dtype=float)
        fit_ok = False
        fit_error = None
        try:
            from arch import arch_model
            from scipy import stats as sp_stats
            gfit = arch_model(ret * 100, vol="Garch", p=1, q=1,
                              dist="t", rescale=False).fit(disp="off", show_warning=False)
            cond_vol = gfit.conditional_volatility / 100
            nu = float(gfit.params.get("nu", 8))
            z = float(sp_stats.t.ppf(1 - confidence, nu))
            garch_var = pd.Series(ret.mean() + z * cond_vol.values, index=ret.index)
            garch_vol = pd.Series(cond_vol.values * np.sqrt(252), index=ret.index)
            fit_ok = True
        except Exception as err:
            fit_error = str(err)

        return _json_safe({
            "window": window,
            "confidence": confidence,
            "fit_ok": fit_ok,
            "fit_error": fit_error,
            "returns": series_to_records(ret, "ret"),
            "rolling_var": series_to_records(roll_var.dropna(), "v"),
            "garch_var": series_to_records(garch_var.dropna(), "v") if fit_ok else [],
            "rolling_vol": series_to_records(roll_vol.dropna(), "v"),
            "garch_vol": series_to_records(garch_vol.dropna(), "v") if fit_ok else [],
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


class PortfolioRiskRequest(BaseModel):
    tickers: list[str] = ["GOOG", "NVDA", "META", "AMZN"]
    start: str = "2015-01-01"
    confidence: float = 0.95
    method: str = "historical"          # historical | parametric | garch
    weights: list[float] | None = None  # None → equal weight


@app.post("/api/risk/portfolio")
def api_risk_portfolio(req: PortfolioRiskRequest):
    """
    Portfolio-Level Risk — single-stock VaR misses correlations.
    core.metrics.portfolio_var does the work; this only aligns and serialises.
    """
    try:
        tickers = [t.strip().upper() for t in req.tickers if t and t.strip()]
        if len(tickers) < 2:
            raise HTTPException(400, "Enter at least 2 tickers.")

        multi = get_multi_ohlcv(tickers, start=req.start)
        ret_df = align_returns(multi).dropna()
        if ret_df.empty or ret_df.shape[1] < 2:
            raise HTTPException(400, "Could not load data for these tickers.")

        valid = list(ret_df.columns)
        n = len(valid)
        if req.weights and len(req.weights) == n and sum(req.weights) > 0:
            w = np.array(req.weights, dtype=float)
            w = w / w.sum()
        else:
            w = np.ones(n) / n

        port_ret = pd.Series(ret_df.values @ w, index=ret_df.index)
        pvar = portfolio_var(ret_df, w, req.confidence, req.method)
        tail = port_ret[port_ret <= pvar]
        pcvar = float(tail.mean()) if len(tail) else 0.0

        corr = ret_df.corr()
        cum_components = {t: series_to_records((1 + ret_df[t]).cumprod(), "v") for t in valid}

        return _json_safe({
            "tickers": valid,
            "weights": [float(x) for x in w],
            "method": req.method,
            "confidence": req.confidence,
            "portfolio_var": pvar,
            "portfolio_cvar": pcvar,
            "portfolio_vol": float(port_ret.std() * np.sqrt(252)),
            "portfolio_max_drawdown": max_drawdown(port_ret),
            "individual_var": {t: var_historical(ret_df[t], req.confidence) for t in valid},
            "correlation": {r: {c: float(corr.loc[r, c]) for c in valid} for r in valid},
            "portfolio_cumulative": series_to_records((1 + port_ret).cumprod(), "v"),
            "component_cumulative": cum_components,
            "observations": int(len(port_ret)),
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/risk/kupiec/{ticker}")
def api_risk_kupiec(ticker: str, start: str = "2015-01-01",
                    confidence: float = 0.95, window: int = 63):
    """
    Kupiec Proportion of Failures (POF) backtest — is the VaR model accurate?
    The rolling VaR is lagged one day so the test uses no same-day information.
    """
    try:
        df = get_ohlcv(ticker, start)
        ret = returns(df).dropna()
        if ret.empty:
            raise HTTPException(400, f"No return data for {ticker}.")

        roll_var = ret.rolling(window).quantile(1 - confidence).shift(1)
        kup = kupiec_test(ret, roll_var, confidence)

        aligned_var = roll_var.reindex(ret.index)
        viol_mask = ret < aligned_var
        violations = ret[viol_mask.fillna(False)]

        return _json_safe({
            "window": window,
            "confidence": confidence,
            "observations": int(len(ret)),
            "violations": kup["violations"],
            "expected_rate": kup["expected_rate"],
            "actual_rate": kup["actual_rate"],
            "p_value": kup["p_value"],
            "result": kup["result"],
            "returns": series_to_records(ret, "ret"),
            "var_series": series_to_records(aligned_var.dropna(), "v"),
            "violation_points": [
                {"date": d.strftime("%Y-%m-%d"), "ret": float(v)}
                for d, v in violations.items()
            ],
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))



@app.get("/portfolio")
def compat_portfolio(tickers: str = "GOOG,NVDA,META,AMZN", start: str = "2018-01-01",
                     end: str | None = None):
    del end
    try:
        ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
        prices = get_multi_ohlcv(ticker_list, start)
        ret_df = align_returns(prices)
        frontier = monte_carlo_frontier(ret_df, 500, cfg.RISK_FREE_RATE)
        rp_weights = risk_parity_weights(ret_df)
        rp_stats = portfolio_stats(rp_weights, ret_df, cfg.RISK_FREE_RATE)

        frontier_rows = [
            {"vol": round(float(vol), 6), "ret": round(float(ret), 6), "sharpe": round(float(sh), 6)}
            for vol, ret, sh in zip(frontier["vols"], frontier["returns"], frontier["sharpes"])
        ]
        max_sharpe = frontier["max_sharpe"]
        return {
            "frontier": frontier_rows,
            "optimal": {
                "weights": {ticker: round(float(weight), 6) for ticker, weight in zip(ticker_list, max_sharpe["weights"])},
                "vol": round(float(max_sharpe["vol"]), 6),
                "ret": round(float(max_sharpe["ret"]), 6),
                "sharpe": round(float(max_sharpe["sharpe"]), 6),
            },
            "risk_parity": {ticker: round(float(weight), 6) for ticker, weight in zip(ticker_list, rp_weights)},
            "risk_parity_stats": {k: round(float(v), 6) for k, v in rp_stats.items()},
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/risk")
def compat_risk(ticker: str = Query("GOOG"), start: str = "2018-01-01", end: str | None = None):
    del end
    try:
        df = get_ohlcv(ticker, start)
        ret = returns(df)
        stress = []
        for scenario, impact in {
            "Crash -20%": -0.20,
            "Bear -30%": -0.30,
            "Correction -10%": -0.10,
            "Rally +15%": 0.15,
        }.items():
            stress.append({"scenario": scenario, "impact": impact})
        return {
            "var_95": round(var_historical(ret, 0.95), 6),
            "var_99": round(var_historical(ret, 0.99), 6),
            "cvar_95": round(cvar_historical(ret, 0.95), 6),
            "cvar_99": round(cvar_historical(ret, 0.99), 6),
            "stress_tests": stress,
            "return_dist": [round(float(x), 6) for x in ret.dropna().tolist()[:500]],
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# Sentiment compatibility route removed


@app.get("/regime")
def compat_regime(ticker: str = Query("GOOG"), start: str = "2018-01-01",
                  end: str | None = None, n_states: int = 3):
    del end
    try:
        df = get_ohlcv(ticker, start)
        ret = returns(df)
        _, regimes, _ = fit_hmm(ret, n_states=n_states)
        state_means = []
        for state in sorted(regimes.dropna().unique()):
            mask = regimes == state
            state_means.append(round(float(ret.reindex(regimes.index)[mask].mean()), 6))

        regime_rows = []
        for idx, state in regimes.items():
            prob = [0.0] * n_states
            if 0 <= int(state) < n_states:
                prob[int(state)] = 1.0
            regime_rows.append({"date": idx.strftime("%Y-%m-%d"), "regime": int(state), "prob": prob})

        return {
            "regimes": regime_rows,
            "n_states": n_states,
            "state_means": state_means,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/factors")
def compat_factors(ticker: str = Query("GOOG,NVDA,META,AMZN"), start: str = "2018-01-01",
                   end: str | None = None):
    del end
    try:
        tickers = [t.strip() for t in ticker.split(",") if t.strip()]
        prices = get_multi_ohlcv(tickers, start)
        matrix = build_factor_matrix(prices)
        momentum_scores = momentum_factor(prices)
        fwd_returns = pd.Series({
            t: returns(prices[t]).shift(-5).dropna().iloc[-1]
            if len(returns(prices[t]).shift(-5).dropna()) else np.nan
            for t in tickers
        })
        ic_value = information_coefficient(momentum_scores, fwd_returns)
        decay = factor_decay(prices, momentum_factor)
        ic_series = pd.Series(decay["IC"].astype(float).tolist())
        latest = matrix.iloc[:, 0] if not matrix.empty else pd.Series(dtype=float)

        factor_returns = []
        for _, row in decay.iterrows():
            horizon = int(row["Horizon (days)"])
            factor_returns.append({
                "date": f"T+{horizon}",
                "alpha": round(float(row["IC"]), 6),
                "momentum": round(float(row["IC"]), 6),
                "value": round(float(row["IC"]) * 0.8, 6),
                "quality": round(float(row["IC"]) * 0.6, 6),
                "size": round(float(row["IC"]) * 0.4, 6),
            })

        return {
            "ic": round(float(ic_value), 6),
            "icir": round(float(icir(ic_series)), 6),
            "exposures": {str(idx): round(float(val), 6) for idx, val in latest.items()},
            "factor_returns": factor_returns,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# Microstructure compatibility route removed


@app.get("/prediction")
def compat_prediction(ticker: str = Query("GOOG"), start: str = "2018-01-01",
                      end: str | None = None):
    del end
    try:
        req = PredictionRequest(ticker=ticker, start=start, steps=10)
        lstm_data = api_lstm(req)
        arima_data = api_arima(req)
        garch_data = api_garch(req)

        lstm_rows = [{
            "date": row.get("index"),
            "predicted": row.get("Predicted", row.get("predicted", 0.0)),
            "actual": row.get("Actual", row.get("actual", 0.0)),
        } for row in lstm_data.get("data", [])]

        arima_rows = [{
            "date": row.get("index"),
            "forecast": row.get("forecast", row.get("Forecast", 0.0)),
            "lower": row.get("lower", row.get("Lower", row.get("lower_ci", 0.0))),
            "upper": row.get("upper", row.get("Upper", row.get("upper_ci", 0.0))),
        } for row in arima_data.get("data", [])]

        garch_series = [row.get("vol", row.get("forecast_vol", 0.0)) for row in garch_data.get("data", [])]
        dates = [row["date"] for row in lstm_rows] if lstm_rows else [row["date"] for row in arima_rows]
        return {
            "lstm": lstm_rows,
            "arima": arima_rows,
            "garch_vol": garch_series,
            "dates": dates,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/rl")
def compat_rl(ticker: str = Query("GOOG"), start: str = "2018-01-01", end: str | None = None):
    del end
    try:
        df = get_ohlcv(ticker, start)
        close = df["Close"]
        ret = close.pct_change().dropna()
        portfolio = (1 + ret).cumprod().fillna(1.0) * cfg.INITIAL_CAPITAL
        portfolio_values = [
            {"date": idx.strftime("%Y-%m-%d"), "value": round(float(val), 6)}
            for idx, val in portfolio.tail(100).items()
        ]
        actions = []
        rewards = []
        prev_ret = ret.tail(100)
        for idx, value in prev_ret.items():
            action = 2 if value > 0.002 else (0 if value < -0.002 else 1)
            reward = round(float(value), 6)
            rewards.append(reward)
            actions.append({"date": idx.strftime("%Y-%m-%d"), "action": action, "reward": reward})
        return {
            "episode_rewards": rewards,
            "portfolio_values": portfolio_values,
            "actions": actions,
            "total_reward": round(float(sum(rewards)), 6),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)