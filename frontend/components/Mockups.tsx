"use client";

import Image from "next/image";

/* ──────────────────────────────────────────────────────────────────────────
   Large product screenshots — these are REAL captures of the running modules
   (public/shots/*.png), taken from the live app against the actual engine, not
   drawn mock-ups. Regenerate them by running the app and re-capturing.
   Used in the alternating feature rows.
   ────────────────────────────────────────────────────────────────────────── */

/** A real screenshot in a browser-window frame. */
export function ProductShot({
  src, title, accent, alt, priority = false,
  // Must match the rendered width or Next serves a too-small file and it looks
  // soft: the hero shot renders ~1100px wide, the feature rows ~525px.
  sizes = "(max-width: 1024px) 100vw, 580px",
}: {
  src: string; title: string; accent: string; alt: string;
  priority?: boolean; sizes?: string;
}) {
  return (
    <div
      className="hv overflow-hidden rounded-2xl border border-white/12 bg-panel/70 backdrop-blur-xl"
      style={{ boxShadow: `0 40px 90px -34px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.06)` }}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-ink/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-hazedim">
          {title}
        </span>
        <span className="ml-auto font-mono text-[10px] text-hazedim/60">alphaforge</span>
      </div>
      <Image
        src={src}
        alt={alt}
        width={1600}
        height={1000}
        priority={priority}
        sizes={sizes}
        className="block h-auto w-full"
      />
    </div>
  );
}

/* The four real captures, wired where the drawn mock-ups used to sit. */
export const DashboardShot = (p: { priority?: boolean; sizes?: string }) => (
  <ProductShot src="/shots/dashboard.png" title="Dashboard" accent="#00f5a0"
    alt="The AlphaForge dashboard showing last close, volume, RSI, MACD and annualised volatility above a candlestick chart with moving averages and an RSI/MACD indicator panel."
    priority={p.priority}
    sizes={p.sizes ?? "(max-width: 1024px) 100vw, 580px"} />
);
export const BacktestShot = () => (
  <ProductShot src="/shots/backtest.png" title="Strategy Backtester" accent="#a55efd"
    alt="A backtest result: strategy versus buy-and-hold equity curves, an overfit warning with efficiency ratio 0.33, and the per-fold walk-forward table." />
);
export const HonestyShot = () => (
  <ProductShot src="/shots/honesty.png" title="Honesty Engine" accent="#00f5a0"
    alt="The Honesty Engine verdict panel with Deflated Sharpe, Probability of Backtest Overfitting and the blunt-questions breakdown." />
);
export const PredictionShot = () => (
  <ProductShot src="/shots/prediction.png" title="Prediction Studio" accent="#0be0ff"
    alt="The Prediction Studio: ensemble forecast and confidence, the forecast stack chart with XGBoost, LSTM and Transformer paths, the model scorecard and the ensemble weights." />
);
