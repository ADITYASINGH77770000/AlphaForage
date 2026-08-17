"""
Generate the images used on the Insights articles.

These are NOT decorative artwork — every chart is computed from AlphaForge's own
engine (core.honesty, core.backtest_engine) so the pictures on the site agree
with what the product actually calculates.

    python scripts/make_insight_charts.py frontend/public/insights
"""
from __future__ import annotations

import pathlib
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "frontend/public/insights")
OUT.mkdir(parents=True, exist_ok=True)

# Site palette
INK, PANEL = "#05070f", "#0b1020"
GREEN, CYAN, VIOLET, GOLD, RED = "#00f5a0", "#0be0ff", "#a55efd", "#ffd700", "#ff5470"
HAZE, DIM = "#adc6dd", "#8aa6c8"

plt.rcParams.update({
    "figure.facecolor": INK, "axes.facecolor": INK,
    "savefig.facecolor": INK, "text.color": HAZE,
    "axes.labelcolor": HAZE, "xtick.color": DIM, "ytick.color": DIM,
    "axes.edgecolor": "#22304a", "grid.color": "#16203a",
    "font.size": 12, "axes.titlesize": 15, "axes.titleweight": "medium",
    "figure.dpi": 160,
})


def _finish(ax, title, sub=None):
    ax.grid(True, alpha=0.45, linewidth=0.7)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    # Title sits above the subtitle — pad has to clear both or they overlap.
    ax.set_title(title, color="#ffffff", pad=34, loc="left")
    if sub:
        ax.text(0, 1.035, sub, transform=ax.transAxes,
                color=DIM, fontsize=10.5, va="bottom")


def chart_overfitting():
    """How high a Sharpe pure luck produces, as a function of trials tried.

    Uses core.honesty._expected_max_sharpe — the same function the Deflated
    Sharpe Ratio uses to discount a backtest for multiple testing.
    """
    from core.honesty import _expected_max_sharpe

    trials = np.unique(np.logspace(0, 3, 60).astype(int))
    # Per-trial Sharpe dispersion typical of a daily strategy sweep.
    sr_var = 0.5 ** 2
    exp_max = np.array([_expected_max_sharpe(sr_var, int(n)) for n in trials])
    ann = exp_max * np.sqrt(252) / np.sqrt(252)  # already per-period units

    fig, ax = plt.subplots(figsize=(9, 4.6))
    ax.plot(trials, ann, color=GREEN, linewidth=2.6)
    ax.fill_between(trials, 0, ann, color=GREEN, alpha=0.10)
    ax.set_xscale("log")
    ax.set_xlabel("Strategy variations tried (log scale)")
    ax.set_ylabel("Best Sharpe expected from luck alone")

    for n in (10, 100, 1000):
        i = int(np.argmin(np.abs(trials - n)))
        ax.plot(trials[i], ann[i], "o", color=GOLD, markersize=7)
        ax.annotate(f"{trials[i]} tries → {ann[i]:.2f}",
                    (trials[i], ann[i]), textcoords="offset points",
                    xytext=(8, 10), color=GOLD, fontsize=10.5)

    _finish(ax, "The Sharpe you get for free by searching harder",
            "Expected best Sharpe when every strategy has zero real edge · core.honesty._expected_max_sharpe")
    fig.tight_layout()
    fig.savefig(OUT / "overfitting.png", bbox_inches="tight")
    plt.close(fig)
    print("  overfitting.png", {int(t): round(float(v), 3) for t, v in zip(trials, ann) if t in (1, 10, 100, 1000)})


def chart_costs():
    """The real round-trip cost stack, straight from core.backtest_engine."""
    import core.backtest_engine as be

    cm = be.COST_PROFILES["India – Delivery"]
    bd = cm.breakdown()

    def pct(key):
        return float(bd[key].rstrip("%"))

    parts = [
        ("Slippage", pct("Slippage (2 legs)"), RED),
        ("STT", pct("STT (buy + sell)"), VIOLET),
        ("Brokerage", pct("Brokerage (2 legs)"), CYAN),
        ("Stamp duty", pct("Stamp duty (buy)"), GOLD),
        ("GST", pct("GST (18% on fees)"), GREEN),
        ("Exchange + SEBI", pct("Exchange fee (2 legs)") + pct("SEBI fee (2 legs)"), HAZE),
    ]
    total = cm.total_round_trip_cost() * 100

    fig, ax = plt.subplots(figsize=(9, 4.2))
    left = 0.0
    for name, val, colour in parts:
        ax.barh([0], [val], left=left, color=colour, height=0.34,
                edgecolor=INK, linewidth=1.2, label=f"{name}  {val:.3f}%")
        left += val

    # The assumption most retail backtests still use, for contrast.
    ax.axvline(0.21, color="#ffffff", linestyle="--", linewidth=1.4, alpha=0.7)
    ax.annotate("naive 0.21% assumption", xy=(0.21, 0.19), xytext=(0.235, 0.30),
                color="#ffffff", fontsize=10.5,
                arrowprops=dict(arrowstyle="-", color="#ffffff", alpha=0.6, lw=1))
    ax.annotate(f"actual {total:.3f}%", xy=(total, -0.19), xytext=(total - 0.02, -0.33),
                color=GREEN, fontsize=11, ha="right",
                arrowprops=dict(arrowstyle="-", color=GREEN, alpha=0.7, lw=1))

    ax.set_yticks([])
    ax.set_ylim(-0.62, 0.62)
    ax.set_xlabel("Round-trip cost of one trade (% of notional)")
    ax.set_xlim(0, total * 1.12)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.28), frameon=False,
              fontsize=10, ncol=3, labelcolor=HAZE, handlelength=1.4, columnspacing=1.8)
    _finish(ax, f"One round trip really costs {total:.3f}% — not 0.21%",
            "India delivery equity · core.backtest_engine.COST_PROFILES")
    fig.tight_layout()
    fig.savefig(OUT / "costs.png", bbox_inches="tight")
    plt.close(fig)
    print(f"  costs.png  total={total:.4f}%")


def chart_drawdown():
    """Gain required to recover from a drawdown — arithmetic, and brutal."""
    dd = np.linspace(0.01, 0.80, 300)
    recover = dd / (1 - dd)

    fig, ax = plt.subplots(figsize=(9, 4.6))
    ax.plot(dd * 100, recover * 100, color=VIOLET, linewidth=2.6)
    ax.fill_between(dd * 100, 0, recover * 100, color=VIOLET, alpha=0.10)
    ax.axvline(50, color=RED, linestyle="--", linewidth=1.5)
    ax.text(50.8, 320, "AlphaForge's ruin line: 50%", color=RED, fontsize=10.5)

    for d in (0.20, 0.50, 0.70):
        r = d / (1 - d)
        ax.plot(d * 100, r * 100, "o", color=GOLD, markersize=7)
        ax.annotate(f"−{d:.0%} needs +{r:.0%}", (d * 100, r * 100),
                    textcoords="offset points", xytext=(-12, 14),
                    color=GOLD, fontsize=10.5, ha="right")

    ax.set_xlabel("Peak-to-trough drawdown")
    ax.set_ylabel("Gain needed just to break even")
    ax.set_xlim(0, 80); ax.set_ylim(0, 420)
    ax.xaxis.set_major_formatter(lambda v, _: f"{v:.0f}%")
    ax.yaxis.set_major_formatter(lambda v, _: f"{v:.0f}%")
    _finish(ax, "A loss and the gain that undoes it are not the same size",
            "Recovery = dd / (1 − dd) · the asymmetry behind core.honesty.blowup_check")
    fig.tight_layout()
    fig.savefig(OUT / "drawdown.png", bbox_inches="tight")
    plt.close(fig)
    print("  drawdown.png  50%→", f"{0.5/0.5:.0%}", " 70%→", f"{0.7/0.3:.0%}")


if __name__ == "__main__":
    chart_overfitting()
    chart_costs()
    chart_drawdown()
    print(f"written to {OUT}")
