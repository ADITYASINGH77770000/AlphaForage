/* ──────────────────────────────────────────────────────────────────────────
   Guide content for Forge, the onboarding assistant.

   One tour per page. A step can point at a real element via `anchor`
   (a [data-tour="…"] value); if that element isn't on screen the step still
   shows, it just doesn't spotlight anything.
   ────────────────────────────────────────────────────────────────────────── */

export type Step = {
  title: string;
  body: string;
  /** data-tour value to spotlight, if any. */
  anchor?: string;
  /** Optional link shown as a button under the step. */
  cta?: { label: string; href: string };
};

export type Tour = {
  id: string;
  /** Friendly name shown in the menu. */
  name: string;
  intro: string;
  steps: Step[];
};

/* ── the site-wide welcome ───────────────────────────────────────────────── */

export const WELCOME: Tour = {
  id: "welcome",
  name: "What is AlphaForge?",
  intro: "New here? Two minutes and you'll know exactly what this thing does.",
  steps: [
    {
      title: "Hi — I'm Forge 🤖",
      body: "I'll show you around. AlphaForge is a quant research platform with one unusual promise: it tries to talk you out of your own strategy. Most tools show you a pretty equity curve. This one asks whether that curve is real.",
    },
    {
      title: "The problem it solves",
      body: "Test enough trading rules and one will look brilliant by pure luck. After a thousand attempts, a strategy with no edge at all is expected to post a Sharpe of about 1.63. That number is manufactured by searching — not by skill.",
    },
    {
      title: "The Honesty Engine",
      body: "So every backtest gets graded: Deflated Sharpe (corrects for how many variations you tried), Probability of Backtest Overfitting, a ruin check, and a buy-and-hold comparison. The verdict is blunt — PROBABLY REAL or LIKELY OVERFIT.",
      cta: { label: "See a live verdict", href: "/features/honesty-engine" },
    },
    {
      title: "Nine modules, one engine",
      body: "Backtesting, risk, portfolio construction, factors, regimes, signals and forecasting all share the same tested Python core. Open any of them from the Features page — they all work the same way.",
      cta: { label: "Browse the modules", href: "/features#modules" },
    },
    {
      title: "How every module works",
      body: "Set your inputs at the top, press Run, read the output. Nothing computes until you ask — so opening a page is always instant, and you're never waiting on work you didn't want.",
    },
    {
      title: "Start here",
      body: "If you only try one thing: run a backtest, then look at the walk-forward panel. That's where most strategies quietly fall apart — and seeing it happen is the fastest way to understand what this platform is for.",
      cta: { label: "Open the Backtester", href: "/features/backtester" },
    },
  ],
};

/* ── per-module guides ───────────────────────────────────────────────────── */

const RUN_STEP: Step = {
  title: "Press Run",
  body: "Nothing is computed until you ask. Hit Run and the results fill in below — bigger jobs load panel by panel so you can start reading immediately.",
  anchor: "run",
};

const INPUT_STEP = (what: string): Step => ({
  title: "Set your inputs",
  body: what,
  anchor: "inputs",
});

export const MODULE_TOURS: Record<string, Tour> = {
  "honesty-engine": {
    id: "honesty-engine",
    name: "Honesty Engine",
    intro: "The verdict machine — is this edge real, or did you just search hard enough?",
    steps: [
      {
        title: "What this module does",
        body: "It runs your strategy, then grades the result for luck. This is the core idea of the whole platform: a good-looking backtest has to earn your trust before you risk anything.",
      },
      INPUT_STEP("Type any ticker and pick a start date. Then choose one of the five tested strategies — Momentum, Mean Reversion, RSI, MACD Crossover or Dual MA."),
      RUN_STEP,
      {
        title: "Reading the verdict",
        body: "Green PROBABLY REAL means the edge survived every check. Red LIKELY OVERFIT means it didn't — and the reasons are listed underneath in plain English.",
      },
      {
        title: "The four numbers that matter",
        body: "Deflated Sharpe: confidence the edge is real after correcting for the number of trials. PBO: the chance the in-sample winner is an out-of-sample loser. Then two blunt checks — would it have blown up your account, and does it beat buy-and-hold after costs.",
      },
      {
        title: "Don't game it",
        body: "If the verdict is red, the honest move isn't to hunt for a configuration that scores green. It's to accept this family of rules doesn't work on this instrument — which is a genuinely useful thing to learn in an afternoon.",
      },
    ],
  },

  backtester: {
    id: "backtester",
    name: "Strategy Backtester",
    intro: "Lookahead-free simulation with real costs, walk-forward folds and Monte Carlo.",
    steps: [
      {
        title: "What this module does",
        body: "It simulates a strategy bar by bar. Positions act on the next bar, never the current one, so the engine can't peek at the answer — the most common way backtests lie to people.",
      },
      {
        title: "Costs are modelled properly",
        body: "Pick a market cost profile. An Indian delivery round trip really costs 0.394% once STT, stamp duty, exchange and SEBI fees, GST and slippage are counted — not the 0.21% most tools assume. That gap kills a lot of high-turnover edges.",
      },
      INPUT_STEP("Choose a ticker, a strategy and the fast/slow windows. The toggles below control the two expensive checks — walk-forward and Monte Carlo."),
      RUN_STEP,
      {
        title: "Walk-forward is the real test",
        body: "It trains on a rolling window and tests on data the strategy has never seen, then reports an Efficiency Ratio (out-of-sample Sharpe ÷ in-sample). Below 0.5 you get an overfit warning. Watch the per-fold table — most strategies fail in most folds.",
      },
      {
        title: "Monte Carlo separates luck from skill",
        body: "It re-runs the strategy with random entry delays and execution noise. A tight fan means the result is robust; a wide one means you got a good draw. It also reports risk of ruin and the probability of beating buy-and-hold.",
      },
    ],
  },

  prediction: {
    id: "prediction",
    name: "Prediction Studio",
    intro: "Three models trained side by side and blended by how well each actually scored.",
    steps: [
      {
        title: "What this module does",
        body: "It trains XGBoost, an LSTM and a Transformer on the same engineered features, scores them on data none of them saw, then combines their forecasts weighted by inverse error.",
      },
      INPUT_STEP("Set the forecast horizon, look-back window and epochs. Weighted ensembling favours the model with the lowest validation error; simple averaging treats them equally."),
      {
        title: "Training takes minutes, not seconds",
        body: "Three real models is real work — a full run is a few minutes. It runs in the background with a live progress bar, so nothing times out. Lower Epochs or shorten the date range for a faster first look.",
        anchor: "idle",
      },
      {
        title: "Refresh vs Train",
        body: "Once trained, Refresh Forecast re-runs inference against fresh data in about three seconds without retraining. Use Train again only when you change the look-back or epochs.",
      },
      {
        title: "Confidence is the honest bit",
        body: "The confidence score falls when the three models disagree. High agreement doesn't mean they're right — but sharp disagreement is a reliable sign you shouldn't lean on the number.",
      },
      {
        title: "A caveat worth taking seriously",
        body: "Short-series price forecasting overfits very easily. Treat these projections as one input among many, never as a price target.",
      },
    ],
  },

  risk: {
    id: "risk",
    name: "Risk Analytics",
    intro: "Value at Risk four ways, GARCH volatility, portfolio risk and a model-honesty test.",
    steps: [
      {
        title: "What this module does",
        body: "It measures downside before it arrives: how much you lose on a bad day, how much worse the truly bad days are, and whether your risk model is even telling the truth.",
      },
      INPUT_STEP("Pick a ticker and a confidence level — 95% or 99%. The sliders control the rolling windows used by the GARCH and Kupiec panels."),
      RUN_STEP,
      {
        title: "Four VaR methods, one distribution",
        body: "Historical, Gaussian, Student-t and GARCH are drawn on the same return distribution. Where they disagree tells you how fat the tails really are — Gaussian almost always understates them.",
      },
      {
        title: "CVaR matters more than VaR",
        body: "VaR is the threshold; CVaR is the average loss once that threshold breaks. If CVaR is much larger than VaR, sizing off VaR alone will hurt you.",
      },
      {
        title: "The Kupiec test checks the checker",
        body: "It counts how often real losses exceeded the VaR estimate and compares that to the expected rate. p below 0.05 means your risk model is underestimating risk — useful to know before you trust it.",
      },
    ],
  },

  portfolio: {
    id: "portfolio",
    name: "Portfolio Optimization",
    intro: "Efficient frontier, regime-adaptive weights and equal risk contribution.",
    steps: [
      {
        title: "What this module does",
        body: "It turns a list of tickers into weights, using Ledoit-Wolf shrinkage on the covariance matrix — a plain sample covariance is unstable and produces confident nonsense.",
      },
      INPUT_STEP("Enter two or more tickers, then set the max weight per asset, transaction cost and rebalance frequency."),
      RUN_STEP,
      {
        title: "Check covariance health first",
        body: "The Live Signals panel reports the ratio of days to assets. Below about 2× the weights are noise dressed up as precision — more assets need more history.",
      },
      {
        title: "The frontier is solved, not sampled",
        body: "Each point comes from a convex optimisation at a target return, not random sampling. Max Sharpe, Min Variance, Risk Parity and Equal Weight are all marked so you can see the trade-off.",
      },
      {
        title: "Regime-adaptive picks for you",
        body: "An HMM classifies the current market and selects a strategy: Max Sharpe in a bull, Min Variance in a bear, Risk Parity when it's choppy. The starred row in the comparison table is the current pick.",
      },
      {
        title: "Concentration and cost are shown honestly",
        body: "Every strategy card reports HHI concentration, turnover, and net Sharpe after costs — because a portfolio that looks optimal gross of costs often isn't.",
      },
    ],
  },

  factors: {
    id: "factors",
    name: "Factor Analytics",
    intro: "Information Coefficient through time, cost-adjusted quintiles and crowding.",
    steps: [
      {
        title: "What this module does",
        body: "It asks which factors actually predict returns in your universe — momentum, low-vol, size, quality, value — and how quickly that predictive power decays.",
      },
      INPUT_STEP("Enter a universe of two or more tickers and pick a primary factor for the deep-analysis panels. The sliders set forward window, costs, rebalance frequency and quintile count."),
      RUN_STEP,
      {
        title: "IC is the core measure",
        body: "The Information Coefficient is the rank correlation between a factor score and the forward return. Above 0.05 is meaningful; ICIR above 0.5 means that signal is consistent rather than lucky.",
      },
      {
        title: "The composite reweights itself",
        body: "Factors are blended by recent IC, so stronger predictors get more influence. A negative weight means the factor is currently inversely predictive — worth understanding before you trade it.",
      },
      {
        title: "Watch for crowding",
        body: "When everyone holds the same factor, score dispersion collapses and exits become correlated. The crowding panel flags that before the unwind, not after.",
      },
    ],
  },

  regime: {
    id: "regime",
    name: "Regime Detection",
    intro: "A Hidden Markov Model that says which market you're actually in.",
    steps: [
      {
        title: "What this module does",
        body: "It classifies the market into bull, bear and sideways states, because a strategy's edge is regime-dependent — momentum that prints money in a trend gets shredded in a chop.",
      },
      INPUT_STEP("Pick a ticker and choose 2 or 3 hidden states. Three gives you a sideways state as well as bull and bear."),
      RUN_STEP,
      {
        title: "Use the forward probabilities, not the labels",
        body: "The coloured regime labels come from Viterbi, which looks at the whole series including the future — fine for a picture, invalid for trading. The forward-pass probabilities only use data up to each day. That's the honest version.",
      },
      {
        title: "The early-warning signal",
        body: "Before a system flips state it recovers more slowly from shocks. When autocorrelation and variance both rise together, the critical-slowing-down panel fires — typically 10–20 days ahead, with a roughly 25% false positive rate.",
      },
      {
        title: "The strategy router",
        body: "Each regime maps to a different factor mix and position scalar. A young bull gets half size because young regimes flip; a confirmed one ramps to full over thirty days.",
      },
    ],
  },

  signals: {
    id: "signals",
    name: "Signals",
    intro: "What your rules say right now, plus the alpha stack behind them.",
    steps: [
      {
        title: "What this module does",
        body: "It combines six signals — RSI, MACD, Bollinger reversion, dual moving average, volume pressure and realized skew — weighted by how well each has actually predicted forward returns.",
      },
      INPUT_STEP("Pick a ticker and set the IC forward window plus the two z-score thresholds. Static Mode uses historical data; Live Mode polls intraday."),
      RUN_STEP,
      {
        title: "Negative-IC signals are excluded",
        body: "Any signal whose Information Coefficient is negative gets a zero weight — it's marked with a ✗ in the table. The combined stance only listens to signals that have earned it.",
      },
      {
        title: "Two proxies, honestly labelled",
        body: "Volume Pressure approximates order-flow imbalance from daily OHLCV — real Level-2 OFI needs tick data. Realized Skew stands in for IV skew without an options chain. Both are useful; neither is the real thing, and the module says so.",
      },
      {
        title: "Signal health catches decay",
        body: "Signals stop working. The health monitor tracks each one's rolling IC and flags decay before you find out the expensive way — below 25 is a kill signal.",
      },
    ],
  },

  dashboard: {
    id: "dashboard",
    name: "Dashboard",
    intro: "One instrument, the whole picture — price, momentum and risk.",
    steps: [
      {
        title: "What this module does",
        body: "It's the quick look: last close, volume, RSI, MACD and annualised volatility, with a candlestick chart and the full risk and return summary underneath.",
      },
      INPUT_STEP("Type any symbol — US tickers, Indian ones like RELIANCE.NS, or an index like ^NSEI. Static Mode uses history from your start date; Live Mode polls intraday bars."),
      RUN_STEP,
      {
        title: "Read the risk panel, not just the price",
        body: "Sharpe, CAGR, max drawdown and VaR sit together deliberately. A strong CAGR next to a 40% drawdown is not a good strategy — it's a survivable-only-in-hindsight one.",
      },
    ],
  },
};

/** Which tour belongs on a given path. */
export function tourForPath(path: string): Tour | null {
  if (path.startsWith("/features/")) {
    const slug = path.split("/features/")[1]?.split(/[?#]/)[0] ?? "";
    return MODULE_TOURS[slug] ?? null;
  }
  return null;
}
