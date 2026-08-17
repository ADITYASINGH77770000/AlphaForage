"""
api/portfolio_analytics.py
──────────────────────────────────────────────────────────────────────────────
Portfolio analytics used by the web frontend.

Everything here is a faithful REPLICA of helpers that live inline inside
`app/pages/08_🏦_Portfolio.py` rather than in `core/`. That page is a Streamlit
script — importing it would execute the whole UI — so the functions are
reproduced here verbatim instead. The maths is unchanged; `core/` is untouched.

If the Streamlit page's versions change, these must be updated to match.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from core.metrics import cagr, max_drawdown
from core.metrics import sharpe as calc_sharpe

TRADING_DAYS = 252


# ── HMM feature prep with positive-definiteness safeguards ───────────────────

def _prepare_hmm_features(returns: pd.Series, df=None, vol_window: int = 21) -> np.ndarray:
    vol = returns.rolling(vol_window, min_periods=5).std().bfill()
    trend = returns.rolling(5, min_periods=2).mean().bfill()

    if df is not None and "High" in df.columns and "Volume" in df.columns:
        rng_ratio = ((df["High"] - df["Low"]) / df["Close"].replace(0, np.nan)
                     ).reindex(returns.index).bfill().ffill()
        vol_trend = (df["Volume"].pct_change().rolling(5, min_periods=2).mean()
                     .reindex(returns.index).bfill().ffill())
        X = np.column_stack([returns.values, vol.values, trend.values,
                             rng_ratio.values, vol_trend.values])
    else:
        X = np.column_stack([returns.values, vol.values])

    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

    # Drop near-constant columns — they make the covariance singular.
    col_stds = X.std(axis=0)
    keep = col_stds >= 1e-8
    if keep.sum() < 2:
        keep = np.zeros(X.shape[1], dtype=bool)
        keep[0] = True
        keep[min(1, X.shape[1] - 1)] = True
    X = X[:, keep]

    # Standardise for numerical conditioning.
    means, stds = X.mean(axis=0), X.std(axis=0)
    stds[stds < 1e-12] = 1.0
    return (X - means) / stds


def _label_states_safe(model, X: np.ndarray, n_states: int) -> dict:
    try:
        raw = model.predict(X)
        means = {s: X[raw == s, 0].mean() for s in range(n_states) if (raw == s).sum() > 0}
        ranked = sorted(means, key=means.get, reverse=True)
        if n_states == 2:
            return {ranked[0]: "Bull 📈", ranked[-1]: "Bear 📉"}
        return {ranked[0]: "Bull 📈", ranked[1]: "Sideways ↔", ranked[-1]: "Bear 📉"}
    except Exception:
        return {i: ["Bull 📈", "Sideways ↔", "Bear 📉"][min(i, 2)] for i in range(n_states)}


def _fallback_regime(eq_weighted: pd.Series) -> tuple:
    """Rule-based regime for when the HMM can't fit."""
    if len(eq_weighted) < 63:
        return "Sideways ↔", {}
    ret_63 = float(eq_weighted.tail(63).sum())
    ret_252 = float(eq_weighted.tail(min(252, len(eq_weighted))).sum())
    vol_21 = float(eq_weighted.tail(21).std() * np.sqrt(252))
    vol_63 = float(eq_weighted.tail(63).std() * np.sqrt(252))
    if ret_63 > 0.03 and ret_252 > 0.05 and vol_21 < vol_63 * 1.3:
        regime = "Bull 📈"
    elif ret_63 < -0.03 or vol_21 > vol_63 * 1.5:
        regime = "Bear 📉"
    else:
        regime = "Sideways ↔"
    return regime, {regime: 100.0}


def safe_fit_hmm(returns: pd.Series, n_states: int = 2, n_iter: int = 200, df=None) -> tuple:
    """Three-tier fallback: full covariance → diag → rule-based."""
    try:
        from hmmlearn.hmm import GaussianHMM
    except ImportError:
        dummy = pd.Series(["Bull 📈"] * len(returns), index=returns.index)
        return None, dummy, {0: "Bull 📈", 1: "Bear 📉"}

    X = _prepare_hmm_features(returns, df)
    for cov_type in ("full", "diag"):
        try:
            model = GaussianHMM(n_components=n_states, covariance_type=cov_type,
                                n_iter=n_iter, random_state=42)
            model.fit(X)
            label_map = _label_states_safe(model, X, n_states)
            raw_states = model.predict(X)
            series = pd.Series([label_map.get(s, "Sideways ↔") for s in raw_states],
                               index=returns.index, name="Regime")
            return model, series, label_map
        except Exception:
            continue

    current, _ = _fallback_regime(returns)
    return None, pd.Series([current] * len(returns), index=returns.index, name="Regime"), {0: current}


# ── Covariance ───────────────────────────────────────────────────────────────

def ledoit_wolf_cov(returns: pd.DataFrame) -> np.ndarray:
    """Ledoit-Wolf optimal shrinkage — replaces an unstable raw .cov()."""
    try:
        from sklearn.covariance import LedoitWolf
        return LedoitWolf().fit(returns.values).covariance_ * TRADING_DAYS
    except Exception:
        return returns.cov().values * TRADING_DAYS


def covariance_health(returns: pd.DataFrame) -> dict:
    """T/N ratio — whether there is enough history to trust the weights."""
    T, N = returns.shape
    ratio = T / N
    if ratio >= 5:
        status, color = "Good", "green"
        msg = f"{T} days / {N} assets = {ratio:.1f}x — weights are trustworthy"
    elif ratio >= 2:
        status, color = "Warning", "orange"
        msg = f"{T} days / {N} assets = {ratio:.1f}x — weights may be noisy"
    else:
        status, color = "Danger", "red"
        msg = f"{T} days / {N} assets = {ratio:.1f}x — not enough data, weights unreliable"
    return {"status": status, "color": color, "msg": msg, "ratio": round(ratio, 2)}


# ── Analytic optimisers ──────────────────────────────────────────────────────

def analytic_max_sharpe(mu, cov, rf: float = 0.045, max_weight: float = 0.40) -> np.ndarray:
    n = len(mu)

    def neg_sharpe(w):
        ret = float(w @ mu)
        vol = float(np.sqrt(w @ cov @ w))
        return -(ret - rf) / vol if vol > 1e-10 else 0.0

    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]
    bounds = [(0.0, max_weight)] * n
    rng = np.random.default_rng(42)
    best_w, best_sh = np.ones(n) / n, -np.inf
    for _ in range(10):
        res = minimize(neg_sharpe, rng.dirichlet(np.ones(n)), method="SLSQP",
                       bounds=bounds, constraints=constraints,
                       options={"ftol": 1e-12, "maxiter": 1000})
        if res.success and -res.fun > best_sh:
            best_sh, best_w = -res.fun, res.x
    best_w = np.clip(best_w, 0, None)
    return best_w / best_w.sum()


def analytic_min_vol(mu, cov, max_weight: float = 0.40) -> np.ndarray:
    n = len(mu)
    res = minimize(lambda w: float(np.sqrt(w @ cov @ w)), np.ones(n) / n, method="SLSQP",
                   bounds=[(0.0, max_weight)] * n,
                   constraints=[{"type": "eq", "fun": lambda w: np.sum(w) - 1}],
                   options={"ftol": 1e-12, "maxiter": 1000})
    w = np.clip(res.x if res.success else np.ones(n) / n, 0, None)
    return w / w.sum()


def risk_parity_weights_lw(cov) -> np.ndarray:
    n = cov.shape[0]

    def objective(w):
        sigma = np.sqrt(w @ cov @ w)
        rc = w * (cov @ w / sigma)
        return float(np.sum((rc / rc.sum() - np.full(n, 1.0 / n)) ** 2))

    res = minimize(objective, np.ones(n) / n, bounds=[(0.01, 1.0)] * n,
                   constraints=[{"type": "eq", "fun": lambda w: np.sum(w) - 1}],
                   method="SLSQP")
    w = np.clip(res.x if res.success else np.ones(n) / n, 0, None)
    return w / w.sum()


def build_analytic_frontier(mu, cov, rf: float = 0.045, n_points: int = 50) -> dict:
    """Convex optimisation at each target return — not Monte Carlo sampling."""
    n = len(mu)
    min_ret, max_ret = float(mu.min()) * 1.05, float(mu.max()) * 0.95
    vols, rets = [], []
    for target in np.linspace(min_ret, max_ret, n_points):
        constraints = [
            {"type": "eq", "fun": lambda w: np.sum(w) - 1},
            {"type": "eq", "fun": lambda w, t=target: float(w @ mu) - t},
        ]
        res = minimize(lambda w: float(np.sqrt(w @ cov @ w)), np.ones(n) / n,
                       method="SLSQP", bounds=[(0.0, 0.5)] * n,
                       constraints=constraints, options={"ftol": 1e-12, "maxiter": 500})
        if res.success:
            w = np.clip(res.x, 0, None)
            w /= w.sum()
            vols.append(float(np.sqrt(w @ cov @ w)))
            rets.append(float(w @ mu))
    return {"vols": np.array(vols), "rets": np.array(rets)}


# ── Regime routing ───────────────────────────────────────────────────────────

def detect_market_regime(returns_df: pd.DataFrame) -> dict:
    eq_weighted = returns_df.mean(axis=1)
    state_series, regime_pct = None, {}
    try:
        if len(eq_weighted) >= 120:
            _, state_series, _ = safe_fit_hmm(eq_weighted, n_states=3)
            current_regime = state_series.iloc[-1]
            regime_pct = (state_series.value_counts() / len(state_series) * 100).round(1).to_dict()
        else:
            raise ValueError("Too short for HMM")
    except Exception:
        try:
            current_regime, regime_pct = _fallback_regime(eq_weighted)
        except Exception:
            current_regime, regime_pct = "Sideways ↔", {}

    if "Bull" in str(current_regime):
        strategy, reason, color = "Max Sharpe", "Bull market — maximize risk-adjusted returns", "#1D9E75"
    elif "Bear" in str(current_regime):
        strategy, reason, color = "Min Variance", "Bear market — protect capital, minimize drawdown", "#E24B4A"
    else:
        strategy, reason, color = "Risk Parity", "Sideways market — spread risk equally", "#EF9F27"

    return {"current": current_regime, "strategy": strategy, "reason": reason,
            "color": color, "regime_pct": regime_pct, "series": state_series}


# ── Cost, concentration and stats ────────────────────────────────────────────

def net_of_cost_sharpe(weights, prev_weights, returns, cost_bps: float = 10.0,
                       rebal_freq_days: int = 21, rf: float = 0.045) -> dict:
    port_series = pd.Series(returns.values @ weights, index=returns.index)
    gross_sh = calc_sharpe(port_series, rf)
    turnover = float(np.sum(np.abs(weights - prev_weights)))
    annual_cost = turnover * (TRADING_DAYS / rebal_freq_days) * (cost_bps / 10000)
    net_sh = calc_sharpe(port_series - annual_cost / TRADING_DAYS, rf)
    return {
        "gross_sharpe": round(gross_sh, 3),
        "net_sharpe": round(net_sh, 3),
        "annual_cost_pct": round(annual_cost * 100, 3),
        "turnover_pct": round(turnover * 100, 1),
        "sharpe_drag": round(gross_sh - net_sh, 3),
    }


def concentration_signal(weights, tickers) -> dict:
    hhi = float(np.sum(weights ** 2))
    n = len(weights)
    norm_hhi = (hhi - 1.0 / n) / (1 - 1.0 / n) * 100 if n > 1 else 100.0
    max_w = float(weights.max())
    top2 = float(np.sort(weights)[-2:].sum()) if n >= 2 else max_w
    if norm_hhi < 30:
        status, color = "Well Diversified", "green"
    elif norm_hhi < 60:
        status, color = "Moderate Concentration", "orange"
    else:
        status, color = "Highly Concentrated", "red"
    return {
        "hhi": round(hhi, 4), "norm_hhi": round(norm_hhi, 1),
        "status": status, "color": color,
        "max_weight": round(max_w * 100, 1),
        "top_ticker": tickers[int(np.argmax(weights))],
        "top2_pct": round(top2 * 100, 1),
    }


def portfolio_stats_full(weights, returns, mu, cov, rf: float = 0.045) -> dict:
    port_ret = float(weights @ mu)
    port_vol = float(np.sqrt(weights @ cov @ weights))
    port_sh = (port_ret - rf) / port_vol if port_vol > 0 else 0.0
    ps = pd.Series(returns.values @ weights, index=returns.index)
    dside = ps[ps < 0].std()
    sortino = float((ps.mean() * TRADING_DAYS - rf) / (dside * np.sqrt(TRADING_DAYS))) if dside > 0 else 0.0
    return {
        "Annual Return": f"{port_ret:.2%}",
        "Volatility": f"{port_vol:.2%}",
        "Sharpe": f"{port_sh:.2f}",
        "Sortino": f"{sortino:.2f}",
        "Max Drawdown": f"{max_drawdown(ps):.2%}",
        "CAGR": f"{cagr(ps):.2%}",
    }


def risk_contributions(weights, cov) -> np.ndarray:
    """Percentage of total portfolio volatility contributed by each asset."""
    sigma = np.sqrt(weights @ cov @ weights)
    rc = weights * (cov @ weights / sigma)
    return rc / rc.sum() * 100
