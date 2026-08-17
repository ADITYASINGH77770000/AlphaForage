"""
tests/test_honesty.py
Validates the Honesty Engine: PSR, Deflated Sharpe, PBO (CSCV), the blunt
account-safety checks, and the combined plain-English verdict.
"""

import numpy as np
import pandas as pd
import pytest

from core import honesty as h


@pytest.fixture
def rng():
    return np.random.default_rng(7)


def _series(arr):
    idx = pd.date_range("2015-01-01", periods=len(arr), freq="B")
    return pd.Series(arr, index=idx)


# ── PSR ──────────────────────────────────────────────────────────────────────

def test_psr_is_a_probability(rng):
    r = _series(rng.normal(0.0008, 0.01, 1000))
    psr = h.probabilistic_sharpe_ratio(r, 0.0)
    assert 0.0 <= psr <= 1.0


def test_psr_higher_for_stronger_edge(rng):
    weak = _series(rng.normal(0.0002, 0.01, 1000))
    strong = _series(rng.normal(0.0015, 0.01, 1000))
    assert h.probabilistic_sharpe_ratio(strong, 0.0) > h.probabilistic_sharpe_ratio(weak, 0.0)


def test_psr_grows_with_sample_length(rng):
    # Same edge, more data ⇒ more confidence it is real.
    short = _series(rng.normal(0.0006, 0.01, 120))
    long = _series(np.concatenate([short.values, rng.normal(0.0006, 0.01, 2000)]))
    assert h.probabilistic_sharpe_ratio(long, 0.0) >= h.probabilistic_sharpe_ratio(short, 0.0)


# ── Deflated Sharpe ──────────────────────────────────────────────────────────

def test_dsr_decreases_with_more_trials(rng):
    r = _series(rng.normal(0.0009, 0.01, 1500))
    d1 = h.deflated_sharpe_ratio(r, n_trials=1)["dsr"]
    d50 = h.deflated_sharpe_ratio(r, n_trials=50)["dsr"]
    d500 = h.deflated_sharpe_ratio(r, n_trials=500)["dsr"]
    assert d1 >= d50 >= d500
    assert 0.0 <= d500 <= 1.0


def test_dsr_benchmark_rises_with_trials(rng):
    r = _series(rng.normal(0.0009, 0.01, 1500))
    b10 = h.deflated_sharpe_ratio(r, n_trials=10)["sr_benchmark_ann"]
    b1000 = h.deflated_sharpe_ratio(r, n_trials=1000)["sr_benchmark_ann"]
    # The "beat luck" bar you must clear gets higher as you try more strategies.
    assert b1000 > b10 >= 0.0


def test_dsr_handles_tiny_input():
    out = h.deflated_sharpe_ratio(_series([0.01, -0.01]), n_trials=5)
    assert np.isnan(out["dsr"])


# ── PBO / CSCV ───────────────────────────────────────────────────────────────

def test_pbo_high_for_pure_noise(rng):
    # 40 strategies that are all pure noise: picking the in-sample winner is
    # worthless out-of-sample ⇒ PBO should be substantial (well above 0).
    mat = pd.DataFrame(rng.normal(0, 0.01, size=(1200, 40)))
    res = h.probability_of_backtest_overfitting(mat, n_splits=10)
    assert 0.0 <= res["pbo"] <= 1.0
    assert res["pbo"] > 0.3
    assert res["n_strategies"] == 40


def test_pbo_low_for_one_dominant_strategy(rng):
    # One strategy has a real, persistent edge; the rest are noise. The winner
    # in-sample keeps winning out-of-sample ⇒ PBO should be low.
    noise = rng.normal(0, 0.01, size=(1200, 20))
    noise[:, 0] += 0.0025  # genuine persistent drift in strategy 0
    res = h.probability_of_backtest_overfitting(pd.DataFrame(noise), n_splits=10)
    assert res["pbo"] < 0.2


def test_pbo_needs_multiple_strategies(rng):
    res = h.probability_of_backtest_overfitting(pd.DataFrame(rng.normal(0, 0.01, (500, 1))))
    assert np.isnan(res["pbo"])
    assert "at least 2" in res["note"]


# ── Blunt checks ─────────────────────────────────────────────────────────────

def test_blowup_detects_ruin():
    # A −60% crash then flat: should trip the 50% ruin line.
    arr = np.concatenate([[-0.6], np.zeros(50)])
    res = h.blowup_check(_series(arr), ruin_drawdown=0.5)
    assert res["blew_up"] is True
    assert res["max_drawdown"] <= -0.5


def test_blowup_survives_shallow_drawdown(rng):
    arr = rng.normal(0.0005, 0.005, 500)
    res = h.blowup_check(_series(arr), ruin_drawdown=0.5)
    assert res["blew_up"] is False


def test_beats_buy_and_hold():
    strat = _series([0.01, 0.01, 0.01, 0.01])
    bh = _series([0.0, 0.0, 0.0, 0.0])
    res = h.beats_buy_and_hold(strat, bh)
    assert res["beats_buy_hold"] is True
    assert res["excess_return"] > 0


# ── Combined verdict ─────────────────────────────────────────────────────────

def test_verdict_flags_blowup_as_overfit(rng):
    arr = np.concatenate([[-0.7], rng.normal(0.0, 0.01, 400)])
    rep = h.honesty_report(_series(arr))
    assert rep.verdict == h.VERDICT_OVERFIT
    assert rep.blew_up is True


def test_verdict_real_for_strong_persistent_edge(rng):
    # Strong, clean, low-vol edge over a long sample, few trials ⇒ probably real.
    r = _series(rng.normal(0.0012, 0.006, 2500))
    rep = h.honesty_report(r, n_trials=1)
    assert rep.verdict == h.VERDICT_REAL
    assert rep.dsr >= 0.9


def test_verdict_overfit_when_pbo_matrix_is_noise(rng):
    mat = pd.DataFrame(rng.normal(0, 0.01, size=(1500, 30)))
    # Selected strategy = the in-sample winner (classic overfit setup).
    winner = mat.iloc[:, int(mat.iloc[: len(mat) // 2].apply(
        lambda c: c.mean() / (c.std() + 1e-12)).values.argmax())]
    rep = h.honesty_report(winner, returns_matrix=mat)
    assert rep.verdict in (h.VERDICT_OVERFIT, h.VERDICT_INCONCLUSIVE)
    assert not np.isnan(rep.pbo)


def test_report_is_serialisable(rng):
    rep = h.honesty_report(_series(rng.normal(0.0008, 0.01, 800)), n_trials=10)
    d = rep.to_dict()
    assert isinstance(d, dict)
    assert d["verdict"] in (h.VERDICT_REAL, h.VERDICT_OVERFIT, h.VERDICT_INCONCLUSIVE)
    assert isinstance(d["reasons"], list)
