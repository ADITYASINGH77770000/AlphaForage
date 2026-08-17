"""
core/honesty.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The Honesty Engine — the moat.

Turns an impressive-looking backtest into an honest verdict. It answers the
questions retail tools quietly avoid:

  • Is this edge probably real, or a multiple-testing / overfit illusion?
  • Would this strategy have blown up your account?
  • Does it actually beat simply buying and holding, after real costs?

Everything here is *additive* — pure functions built on numpy / scipy /
pandas. It does not modify the existing quant engine; it reads the returns
that engine already produces and grades them.

Academic basis:
  • Probabilistic Sharpe Ratio (PSR)          — Bailey & López de Prado (2012)
  • Deflated Sharpe Ratio (DSR)               — Bailey & López de Prado (2014)
  • Probability of Backtest Overfitting (PBO) — Bailey, Borwein, López de
    Prado & Zhu (2017), via Combinatorially-Symmetric Cross-Validation (CSCV)

All Sharpe figures used inside the statistics are *per-period* (e.g. daily),
because that is what the underlying formulae assume. Display-facing figures
are annualised with ``periods_per_year``.
"""

from __future__ import annotations

import itertools
import math
from dataclasses import dataclass, field, asdict

import numpy as np
import pandas as pd
from scipy import stats

TRADING_DAYS = 252
EULER_MASCHERONI = 0.5772156649015329


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Low-level helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _clean(returns) -> np.ndarray:
    """Return a finite 1-D float array of returns (NaN/inf removed)."""
    arr = np.asarray(pd.Series(returns, dtype="float64").dropna().values, dtype=float)
    return arr[np.isfinite(arr)]


def _per_period_sharpe(arr: np.ndarray) -> float:
    """Non-annualised Sharpe = mean / std (population std, ddof=0)."""
    if arr.size < 2:
        return 0.0
    std = arr.std(ddof=0)
    if std == 0:
        return 0.0
    return float(arr.mean() / std)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1 — Probabilistic Sharpe Ratio (PSR)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def probabilistic_sharpe_ratio(
    returns,
    sr_benchmark: float = 0.0,
    *,
    annualised_benchmark: bool = False,
    periods_per_year: int = TRADING_DAYS,
) -> float:
    """
    Probability that the strategy's *true* Sharpe exceeds ``sr_benchmark``,
    correcting for sample length, skew and (excess) kurtosis.

    PSR(SR*) = Φ( (SR − SR*) · √(n − 1) / √(1 − γ₃·SR + (γ₄ − 1)/4 · SR²) )

    where SR, SR* are per-period Sharpe ratios, γ₃ is skew and γ₄ is the
    (non-excess) kurtosis of the returns. Returns a probability in [0, 1].

    If ``annualised_benchmark`` is True, ``sr_benchmark`` is treated as an
    annualised figure and de-annualised before use.
    """
    arr = _clean(returns)
    n = arr.size
    if n < 3:
        return float("nan")
    sr = _per_period_sharpe(arr)
    if annualised_benchmark:
        sr_benchmark = sr_benchmark / math.sqrt(periods_per_year)

    skew = float(stats.skew(arr, bias=False))
    kurt = float(stats.kurtosis(arr, fisher=False, bias=False))  # normal ⇒ 3
    denom = 1.0 - skew * sr + (kurt - 1.0) / 4.0 * sr ** 2
    if denom <= 0:
        denom = 1e-12
    z = (sr - sr_benchmark) * math.sqrt(n - 1) / math.sqrt(denom)
    return float(stats.norm.cdf(z))


def _expected_max_sharpe(sr_variance: float, n_trials: int) -> float:
    """
    Expected maximum of ``n_trials`` i.i.d. Sharpe estimates drawn under the
    null (true Sharpe = 0), used as the DSR benchmark SR*.

    E[max] ≈ √Var(SR) · [ (1 − γ)·Z⁻¹(1 − 1/N) + γ·Z⁻¹(1 − 1/(N·e)) ]
    with γ the Euler–Mascheroni constant.
    """
    n_trials = max(int(n_trials), 1)
    if n_trials == 1 or sr_variance <= 0:
        return 0.0
    inv = stats.norm.ppf
    a = inv(1.0 - 1.0 / n_trials)
    b = inv(1.0 - 1.0 / (n_trials * math.e))
    return float(math.sqrt(sr_variance) * ((1.0 - EULER_MASCHERONI) * a + EULER_MASCHERONI * b))


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2 — Deflated Sharpe Ratio (DSR)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def deflated_sharpe_ratio(
    returns,
    n_trials: int = 1,
    *,
    trial_sharpes=None,
    periods_per_year: int = TRADING_DAYS,
) -> dict:
    """
    Deflated Sharpe Ratio: the PSR with the benchmark set to the Sharpe you
    would *expect to see by luck alone* after trying ``n_trials`` strategies.

    A DSR near 1.0 means the edge survives the multiple-testing correction
    ("probably real"); a DSR near 0 means the headline Sharpe is the kind of
    number you get for free just by searching enough ("probably overfit").

    Parameters
    ----------
    returns : the (per-period) return series of the *selected* strategy.
    n_trials : how many strategy configurations were effectively tried.
    trial_sharpes : optional iterable of the per-period Sharpe ratios of all
        trials. When given, Var(SR) across trials is measured directly (the
        rigorous path) and ``n_trials`` is inferred from its length. When
        absent, Var(SR) falls back to the sampling variance of the Sharpe
        estimator of ``returns`` — a conservative, defensible proxy.
    """
    arr = _clean(returns)
    n = arr.size
    out = {
        "sharpe_ann": float("nan"),
        "psr": float("nan"),
        "dsr": float("nan"),
        "n_trials": int(n_trials),
        "sr_benchmark_ann": float("nan"),
        "n_obs": int(n),
    }
    if n < 3:
        return out

    sr = _per_period_sharpe(arr)
    out["sharpe_ann"] = float(sr * math.sqrt(periods_per_year))

    if trial_sharpes is not None:
        ts = np.asarray([t for t in trial_sharpes if np.isfinite(t)], dtype=float)
        if ts.size >= 2:
            sr_var = float(ts.var(ddof=1))
            n_trials = ts.size
        else:
            sr_var = 0.0
    else:
        # Sampling variance of the Sharpe estimator (Lo, 2002; Mertens):
        # Var(ŜR) ≈ (1 − γ₃·SR + (γ₄ − 1)/4·SR²) / (n − 1)
        skew = float(stats.skew(arr, bias=False))
        kurt = float(stats.kurtosis(arr, fisher=False, bias=False))
        sr_var = max((1.0 - skew * sr + (kurt - 1.0) / 4.0 * sr ** 2) / (n - 1), 0.0)

    out["n_trials"] = int(n_trials)
    sr_star = _expected_max_sharpe(sr_var, n_trials)
    out["sr_benchmark_ann"] = float(sr_star * math.sqrt(periods_per_year))
    out["psr"] = probabilistic_sharpe_ratio(arr, 0.0)
    out["dsr"] = probabilistic_sharpe_ratio(arr, sr_star)
    return out


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3 — Probability of Backtest Overfitting (PBO) via CSCV
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def probability_of_backtest_overfitting(
    returns_matrix,
    n_splits: int = 16,
    *,
    max_combos: int = 2000,
    random_seed: int = 42,
) -> dict:
    """
    Combinatorially-Symmetric Cross-Validation (CSCV) estimate of PBO.

    ``returns_matrix`` is a (T × N) table of per-period returns for N candidate
    strategy configurations over the same T periods. PBO is the probability
    that the configuration which looked best *in-sample* ranks below the median
    *out-of-sample* — i.e. that in-sample selection is worthless.

      • PBO ≈ 0    → the winner in-sample tends to keep winning: little overfit
      • PBO ≈ 0.5+ → picking the best backtest is no better than a coin flip

    Rows are partitioned into ``n_splits`` (S, forced even) contiguous blocks;
    for every way of choosing S/2 blocks as in-sample (complement = OOS) the
    logit λ = ln(ω / (1 − ω)) of the in-sample winner's OOS rank ω is recorded.
    PBO = P(λ ≤ 0). When C(S, S/2) exceeds ``max_combos`` a random subset is
    sampled for tractability.
    """
    mat = np.asarray(pd.DataFrame(returns_matrix).dropna(how="any").values, dtype=float)
    out = {
        "pbo": float("nan"),
        "n_strategies": int(mat.shape[1]) if mat.ndim == 2 else 0,
        "n_splits": 0,
        "n_combos": 0,
        "logits": [],
        "note": "",
    }
    if mat.ndim != 2 or mat.shape[1] < 2:
        out["note"] = "PBO needs at least 2 candidate strategies."
        return out

    T, N = mat.shape
    S = int(n_splits)
    if S % 2 == 1:
        S += 1
    S = max(4, min(S, T))
    if S % 2 == 1:
        S -= 1
    if S < 4 or T < S * 2:
        out["note"] = "Not enough observations for a stable PBO estimate."
        return out

    # Contiguous, near-equal blocks.
    block_ids = np.array_split(np.arange(T), S)

    # Per-block, per-strategy sufficient statistics so each split's Sharpe is O(N).
    cnt = np.array([len(b) for b in block_ids], dtype=float)          # (S,)
    s1 = np.vstack([mat[b].sum(axis=0) for b in block_ids])           # (S, N)
    s2 = np.vstack([(mat[b] ** 2).sum(axis=0) for b in block_ids])    # (S, N)

    def _sharpe_over(blocks) -> np.ndarray:
        n = cnt[blocks].sum()
        if n < 2:
            return np.zeros(N)
        mean = s1[blocks].sum(axis=0) / n
        var = np.maximum(s2[blocks].sum(axis=0) / n - mean ** 2, 0.0)
        std = np.sqrt(var)
        with np.errstate(divide="ignore", invalid="ignore"):
            sr = np.where(std > 0, mean / std, 0.0)
        return sr

    all_blocks = np.arange(S)
    combos = list(itertools.combinations(range(S), S // 2))
    rng = np.random.default_rng(random_seed)
    if len(combos) > max_combos:
        pick = rng.choice(len(combos), size=max_combos, replace=False)
        combos = [combos[i] for i in pick]

    logits: list[float] = []
    for is_blocks in combos:
        is_idx = np.array(is_blocks)
        oos_idx = np.setdiff1d(all_blocks, is_idx, assume_unique=True)
        is_sr = _sharpe_over(is_idx)
        oos_sr = _sharpe_over(oos_idx)
        best = int(np.argmax(is_sr))
        # OOS rank of the in-sample winner: 1 = worst … N = best.
        rank = int(stats.rankdata(oos_sr, method="average")[best])
        omega = rank / (N + 1.0)
        omega = min(max(omega, 1e-6), 1 - 1e-6)
        logits.append(float(math.log(omega / (1.0 - omega))))

    logits_arr = np.asarray(logits, dtype=float)
    out["pbo"] = float(np.mean(logits_arr <= 0.0)) if logits_arr.size else float("nan")
    out["n_splits"] = int(S)
    out["n_combos"] = int(logits_arr.size)
    out["logits"] = logits
    return out


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4 — Blunt, human questions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def blowup_check(returns, ruin_drawdown: float = 0.50) -> dict:
    """
    "Would this have blown up your account?"

    Reports the worst peak-to-trough drawdown and whether it breached the
    ruin threshold (default 50%). A strategy that halves your capital at any
    point is emotionally and practically un-tradable, however good the CAGR.
    """
    arr = _clean(returns)
    if arr.size < 2:
        return {"max_drawdown": 0.0, "blew_up": False, "ruin_threshold": ruin_drawdown}
    # Anchor equity at full starting capital (1.0) so a day-1 crash counts as a
    # drawdown from the account you actually had — this is a ruin check, not a
    # peak-after-first-trade check.
    equity = np.concatenate(([1.0], np.cumprod(1.0 + arr)))
    peak = np.maximum.accumulate(equity)
    dd = (equity - peak) / peak
    max_dd = float(dd.min())
    return {
        "max_drawdown": max_dd,
        "blew_up": bool(max_dd <= -abs(ruin_drawdown)),
        "ruin_threshold": abs(ruin_drawdown),
    }


def beats_buy_and_hold(strategy_returns, buy_hold_returns) -> dict:
    """
    "Does it beat simply buying and holding, after costs?"

    Compares total compounded return of the strategy against buy-and-hold over
    the overlapping period. ``strategy_returns`` are assumed to be net of costs
    (the backtest engine already deducts them).
    """
    s = pd.Series(strategy_returns, dtype="float64").dropna()
    b = pd.Series(buy_hold_returns, dtype="float64").dropna()
    common = s.index.intersection(b.index)
    if len(common) >= 2:
        s, b = s.loc[common], b.loc[common]
    strat_total = float((1.0 + s).prod() - 1.0) if len(s) else 0.0
    bh_total = float((1.0 + b).prod() - 1.0) if len(b) else 0.0
    return {
        "strategy_return": strat_total,
        "buy_hold_return": bh_total,
        "excess_return": strat_total - bh_total,
        "beats_buy_hold": bool(strat_total > bh_total),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5 — The verdict
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VERDICT_REAL = "PROBABLY REAL"
VERDICT_OVERFIT = "LIKELY OVERFIT"
VERDICT_INCONCLUSIVE = "INCONCLUSIVE"


@dataclass
class HonestyReport:
    verdict: str
    headline: str
    subtext: str
    dsr: float
    psr: float
    pbo: float
    sharpe_ann: float
    sr_benchmark_ann: float
    n_trials: int
    n_obs: int
    max_drawdown: float
    blew_up: bool
    beats_buy_hold: bool
    strategy_return: float
    buy_hold_return: float
    reasons: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def honesty_report(
    daily_returns,
    buy_hold_returns=None,
    *,
    n_trials: int = 1,
    returns_matrix=None,
    trial_sharpes=None,
    ruin_drawdown: float = 0.50,
    periods_per_year: int = TRADING_DAYS,
    dsr_real: float = 0.90,
    dsr_overfit: float = 0.60,
    pbo_overfit: float = 0.50,
) -> HonestyReport:
    """
    Combine every honesty check into a single plain-English verdict.

    Rules of thumb (deliberately blunt):
      • LIKELY OVERFIT  if PBO > ``pbo_overfit`` OR DSR < ``dsr_overfit``
                        OR the strategy would have blown up the account.
      • PROBABLY REAL   if DSR ≥ ``dsr_real`` AND PBO ≤ ``pbo_overfit``
                        AND it did not blow up.
      • INCONCLUSIVE    otherwise — not clearly fake, not clearly trustworthy.

    ``returns_matrix`` (T × N candidate returns) enables both a data-driven
    DSR (variance measured across real trials) and the PBO estimate. Without
    it, DSR falls back to estimator variance and PBO is left as NaN.
    """
    reasons: list[str] = []

    if returns_matrix is not None:
        rm = pd.DataFrame(returns_matrix).dropna(how="any")
        ts = [_per_period_sharpe(_clean(rm[c])) for c in rm.columns] if rm.shape[1] >= 2 else None
        dsr_info = deflated_sharpe_ratio(
            daily_returns, n_trials=max(n_trials, rm.shape[1]),
            trial_sharpes=ts, periods_per_year=periods_per_year,
        )
        pbo_info = probability_of_backtest_overfitting(rm)
    else:
        dsr_info = deflated_sharpe_ratio(
            daily_returns, n_trials=n_trials,
            trial_sharpes=trial_sharpes, periods_per_year=periods_per_year,
        )
        pbo_info = {"pbo": float("nan"), "note": "No candidate matrix supplied."}

    blow = blowup_check(daily_returns, ruin_drawdown)
    if buy_hold_returns is not None:
        bh = beats_buy_and_hold(daily_returns, buy_hold_returns)
    else:
        bh = {"strategy_return": float("nan"), "buy_hold_return": float("nan"),
              "beats_buy_hold": False, "excess_return": float("nan")}

    dsr = dsr_info["dsr"]
    psr = dsr_info["psr"]
    pbo = pbo_info["pbo"]

    # ── Decide the verdict ────────────────────────────────────────────────
    overfit_signal = False
    real_signal = False

    if not math.isnan(pbo) and pbo > pbo_overfit:
        overfit_signal = True
        reasons.append(
            f"High overfitting probability (PBO = {pbo:.0%}): the best in-sample "
            "configuration usually fails out-of-sample."
        )
    if not math.isnan(dsr) and dsr < dsr_overfit:
        overfit_signal = True
        reasons.append(
            f"Low Deflated Sharpe (DSR = {dsr:.0%}): after correcting for the "
            f"{dsr_info['n_trials']} configuration(s) tried, the edge is within luck."
        )
    if blow["blew_up"]:
        overfit_signal = True
        reasons.append(
            f"Account blow-up: peak-to-trough drawdown hit {blow['max_drawdown']:.0%}, "
            f"past the {blow['ruin_threshold']:.0%} ruin line."
        )

    if (not math.isnan(dsr) and dsr >= dsr_real) and (math.isnan(pbo) or pbo <= pbo_overfit) and not blow["blew_up"]:
        real_signal = True
        reasons.append(
            f"Deflated Sharpe = {dsr:.0%}: the edge survives correction for "
            f"{dsr_info['n_trials']} trial(s)."
        )
        if not math.isnan(pbo):
            reasons.append(f"Overfitting probability is low (PBO = {pbo:.0%}).")

    if overfit_signal:
        verdict = VERDICT_OVERFIT
        headline = "This is likely overfit — don't trade it."
        subtext = "The apparent edge is probably an artefact of searching, luck, or ruinous risk."
    elif real_signal:
        verdict = VERDICT_REAL
        headline = "This edge is probably real."
        subtext = "It holds up after honest correction for luck, multiple testing and drawdown risk."
    else:
        verdict = VERDICT_INCONCLUSIVE
        headline = "The evidence is inconclusive."
        subtext = "Not clearly fake, but not trustworthy enough to bet on. Gather more out-of-sample data."
        if not math.isnan(dsr):
            reasons.append(f"Deflated Sharpe = {dsr:.0%} — in the grey zone between luck and edge.")

    # Buy-and-hold context (informational, never flips the verdict on its own).
    if buy_hold_returns is not None and not math.isnan(bh["strategy_return"]):
        if bh["beats_buy_hold"]:
            reasons.append(
                f"Beats buy-and-hold after costs: {bh['strategy_return']:.1%} vs "
                f"{bh['buy_hold_return']:.1%}."
            )
        else:
            reasons.append(
                f"Does NOT beat buy-and-hold after costs: {bh['strategy_return']:.1%} vs "
                f"{bh['buy_hold_return']:.1%} — the simpler choice won."
            )

    return HonestyReport(
        verdict=verdict,
        headline=headline,
        subtext=subtext,
        dsr=float(dsr) if dsr is not None else float("nan"),
        psr=float(psr) if psr is not None else float("nan"),
        pbo=float(pbo),
        sharpe_ann=float(dsr_info["sharpe_ann"]),
        sr_benchmark_ann=float(dsr_info["sr_benchmark_ann"]),
        n_trials=int(dsr_info["n_trials"]),
        n_obs=int(dsr_info["n_obs"]),
        max_drawdown=float(blow["max_drawdown"]),
        blew_up=bool(blow["blew_up"]),
        beats_buy_hold=bool(bh["beats_buy_hold"]),
        strategy_return=float(bh["strategy_return"]),
        buy_hold_return=float(bh["buy_hold_return"]),
        reasons=reasons,
    )
