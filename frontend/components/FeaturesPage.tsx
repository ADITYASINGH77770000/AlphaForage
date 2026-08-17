"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { revealProps, loadProps } from "./motion";
import { DashboardShot, BacktestShot, HonestyShot } from "./Mockups";

/* ──────────────────────────────────────────────────────────────────────────
   FEATURES PAGE — built on the reference site's page architecture:
     1 · hero (badge → centered h1 → copy → 2 buttons → wide visual → strip)
     2 · three-card grid  (3 × 334px, 16px gap)
     3 · key-feature split (542 | 542, 60px gap) + 4-stat band
     4 · alternating feature rows (547 | 547, 50px gap, 90px rhythm)
     5 · closing CTA
   ────────────────────────────────────────────────────────────────────────── */

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div className={className} {...revealProps(delay)}>
      {children}
    </motion.div>
  );
}

/* ── 1 · Hero ────────────────────────────────────────────────────────────── */
function FeaturesHero() {
  return (
    <section className="relative overflow-hidden pt-32 sm:pt-36">
      {/* light orbs */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[620px] overflow-hidden">
        <div
          className="absolute left-[10%] top-[8%] h-[240px] w-[240px] rounded-full opacity-50"
          style={{ background: "radial-gradient(circle,#a55efd 0%,transparent 70%)", filter: "blur(70px)" }}
        />
        <div
          className="absolute left-1/2 top-[-8%] h-[400px] w-[520px] -translate-x-1/2 rounded-full opacity-50"
          style={{ background: "radial-gradient(circle,#0be0ff 0%,transparent 70%)", filter: "blur(90px)" }}
        />
        <div
          className="absolute right-[8%] top-[16%] h-[240px] w-[240px] rounded-full opacity-50"
          style={{ background: "radial-gradient(circle,#00f5a0 0%,transparent 70%)", filter: "blur(70px)" }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-[600px] text-center">
          <motion.div {...loadProps(1)} className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-forge-cyan/20 bg-white/[0.04] py-1 pl-1 pr-4 backdrop-blur">
              <span className="rounded-full bg-gradient-to-r from-forge-green to-forge-cyan px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-ink">
                Features
              </span>
              <span className="font-mono text-[11.5px] text-haze">9 modules · one platform</span>
            </div>
          </motion.div>

          <motion.h1
            {...loadProps(2)}
            className="mt-7 text-[2.6rem] font-medium leading-[1.15] tracking-tight text-white sm:text-[3.4rem]"
          >
            Everything you need to test a strategy{" "}
            <span className="forge-text font-semibold">honestly.</span>
          </motion.h1>

          <motion.p {...loadProps(3)} className="mx-auto mt-5 max-w-[520px] text-[16.5px] leading-7 text-haze">
            Nine analytics modules built on tested maths — and one engine whose only job is to tell
            you when your edge isn&apos;t real.
          </motion.p>

          <motion.div {...loadProps(4)} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/about"
              className="hv-btn rounded-[15px] border border-white/12 bg-white/[0.06] px-5 py-2.5 text-[14.5px] font-medium text-white backdrop-blur hover:border-forge-cyan/50"
            >
              Why we built it
            </Link>
            <Link
              href="/"
              className="hv-btn rounded-[15px] border border-forge-green/60 bg-gradient-to-r from-forge-green to-forge-cyan px-5 py-2.5 text-[14.5px] font-semibold text-ink"
            >
              Test a strategy
            </Link>
          </motion.div>
        </div>

        <motion.div {...loadProps(5)} className="relative mx-auto mt-16 max-w-[1144px]">
          <div
            className="pointer-events-none absolute -inset-x-10 -top-6 bottom-0 opacity-70"
            style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(165,94,253,0.18), transparent 70%)" }}
          />
          <div className="relative">
            <BacktestShot />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ── 2 · Three-pillar cards ──────────────────────────────────────────────── */
const PILLARS = [
  {
    icon: "🎯",
    t: "Grade",
    d: "Every backtest is scored for overfitting with Deflated Sharpe and PBO, then given a plain verdict you can act on.",
    c: "#00f5a0",
  },
  {
    icon: "🧠",
    t: "Forecast",
    d: "Three models are trained side by side and blended by how well each scored on data none of them saw.",
    c: "#0be0ff",
  },
  {
    icon: "📡",
    t: "Prove",
    d: "Walk-forward folds and Monte Carlo runs test whether the edge survives data the strategy never trained on.",
    c: "#a55efd",
  },
];

function Pillars() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <div className="mx-auto max-w-[620px] text-center">
          <h2 className="text-[2rem] font-medium leading-tight text-white sm:text-[2.6rem]">
            AlphaForge Unleashed: how it works
          </h2>
          <p className="mx-auto mt-4 text-[15.5px] leading-7 text-haze">
            Three steps, one honest answer. Every module on this page serves one of them.
          </p>
        </div>
      </Reveal>

      <div className="hv-group mt-14 grid gap-4 md:grid-cols-3">
        {PILLARS.map((p, i) => (
          <Reveal key={p.t} delay={i * 0.08}>
            <div className="hv h-full rounded-2xl border border-white/10 bg-panel/45 p-7 backdrop-blur">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
                style={{ background: `${p.c}16`, border: `1px solid ${p.c}40` }}
              >
                {p.icon}
              </div>
              <h3 className="mt-5 text-[19px] font-semibold text-white">{p.t}</h3>
              <p className="mt-2.5 text-[14px] leading-6 text-haze">{p.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── 3 · Key feature split + stat band ───────────────────────────────────── */
const STATS = [
  { k: "202", l: "Tests passing", d: "Every calculation covered by automated tests." },
  { k: "9", l: "Core modules", d: "One integrated platform, not a bag of scripts." },
  { k: "0.4–0.6%", l: "Real costs modelled", d: "STT, GST and slippage — not the naive 0.2%." },
  { k: "0", l: "Real money at risk", d: "Research only — AlphaForge never places an order." },
];

function KeyFeature() {
  return (
    <section className="relative z-10 border-y border-white/10 bg-panel/20">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid items-center gap-[60px] lg:grid-cols-2">
          <Reveal>
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-forge-green">
                Our key feature
              </p>
              <h2 className="mt-4 text-[1.9rem] font-medium leading-snug text-white sm:text-[2.4rem]">
                The Honesty Engine — the reason AlphaForge exists
              </h2>
              <p className="mt-5 text-[15.5px] leading-7 text-haze">
                Try enough variations and one backtest will look brilliant by pure luck. The Honesty
                Engine measures that illusion and prices it in, so a good-looking curve has to earn
                your trust before you risk anything.
              </p>
              <ul className="mt-7 space-y-3.5">
                {[
                  "Deflated Sharpe Ratio — corrects for how many strategies you tried.",
                  "Probability of Backtest Overfitting — does the winner survive out-of-sample?",
                  "Ruin check — would this drawdown have ended your account?",
                  "Benchmark check — does it actually beat buy-and-hold after costs?",
                ].map((b) => (
                  <li key={b} className="flex items-start gap-3 text-[14.5px] leading-6 text-haze">
                    <span
                      className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]"
                      style={{ background: "#00f5a01f", color: "#00f5a0", border: "1px solid #00f5a044" }}
                    >
                      ✓
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                href="/"
                className="hv-btn mt-8 inline-block rounded-[15px] border border-forge-green/60 bg-gradient-to-r from-forge-green to-forge-cyan px-5 py-2.5 text-[14.5px] font-semibold text-ink"
              >
                See a live verdict
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="relative">
              <div
                className="pointer-events-none absolute -inset-8 opacity-60"
                style={{ background: "radial-gradient(55% 55% at 50% 50%, #00f5a01f, transparent 70%)" }}
              />
              <div className="relative">
                <HonestyShot />
              </div>
            </div>
          </Reveal>
        </div>

        {/* stat band */}
        <div className="hv-group mt-20 grid gap-5 border-t border-white/10 pt-14 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.l} delay={i * 0.08}>
              <div className="hv rounded-2xl border border-white/10 bg-panel/40 p-6">
                <div className="forge-text text-[2.2rem] font-medium leading-none">{s.k}</div>
                <div className="mt-3 text-[14.5px] font-semibold text-white">{s.l}</div>
                <div className="mt-1.5 text-[12.5px] leading-5 text-hazedim">{s.d}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 4 · Alternating module rows ─────────────────────────────────────────── */
type Row = {
  eyebrow: string;
  title: string;
  body: string;
  caption: string;
  bullets: string[];
  accent: string;
  mockup: React.ReactNode;
  flip?: boolean;
};

const ROWS: Row[] = [
  {
    eyebrow: "Command Center",
    title: "Your whole book, at a glance",
    body:
      "Portfolio risk and return across your watchlist, with fat-tail VaR, live regime detection and correlation structure — all from the same tested engine.",
    caption: "Fast-reading charts for decisions on the go.",
    bullets: [
      "Sharpe, CAGR, drawdown and VaR in one strip.",
      "Bull / bear / choppy regime badge, live.",
      "GARCH and Student-t tails, not just the bell curve.",
    ],
    accent: "#00f5a0",
    mockup: <DashboardShot />,
  },
];

function ModuleRows() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-24">
      <div className="flex flex-col gap-[90px]">
        {ROWS.map((r) => (
          <div key={r.title} className="grid items-center gap-[50px] lg:grid-cols-2">
            <Reveal className={r.flip ? "lg:order-2" : undefined}>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]" style={{ color: r.accent }}>
                  {r.eyebrow}
                </p>
                <h3 className="mt-3 text-[1.6rem] font-medium leading-snug text-white sm:text-[1.9rem]">
                  {r.title}
                </h3>
                <p className="mt-4 text-[15.5px] leading-7 text-haze">{r.body}</p>
                <p className="mt-3 text-[14px] italic leading-6 text-hazedim">{r.caption}</p>
                <ul className="mt-7 space-y-3.5 border-t border-white/10 pt-6">
                  {r.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-[14.5px] leading-6 text-haze">
                      <span
                        className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]"
                        style={{ background: `${r.accent}1f`, color: r.accent, border: `1px solid ${r.accent}44` }}
                      >
                        ✓
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.1} className={r.flip ? "lg:order-1" : undefined}>
              <div className="relative">
                <div
                  className="pointer-events-none absolute -inset-8 opacity-60"
                  style={{ background: `radial-gradient(55% 55% at 50% 50%, ${r.accent}1f, transparent 70%)` }}
                />
                <div className="relative">{r.mockup}</div>
              </div>
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 5 · All nine modules ────────────────────────────────────────────────── */
const MODULES = [
  { n: "01", t: "Honesty Engine", d: "DSR + PBO verdict on every backtest.", c: "#00f5a0", slug: "honesty-engine", live: true },
  { n: "02", t: "Strategy Backtester", d: "Lookahead-free, real costs, walk-forward.", c: "#a55efd", slug: "backtester", live: true },
  { n: "03", t: "Dashboard", d: "Portfolio risk and return at a glance.", c: "#00f5a0", slug: "dashboard", live: true },
  { n: "04", t: "Signals", d: "What your rules say to do right now.", c: "#0be0ff", slug: "signals", live: true },
  { n: "05", t: "Risk Analytics", d: "VaR, CVaR, fat tails and GARCH.", c: "#a55efd", slug: "risk", live: true },
  { n: "06", t: "Portfolio Optimization", d: "Efficient frontier and risk parity.", c: "#ffd700", slug: "portfolio", live: true },
  { n: "07", t: "Factor Analytics", d: "IC, ICIR, quintiles and decay.", c: "#00f5a0", slug: "factors", live: true },
  { n: "08", t: "Regime Detection", d: "HMM bull / bear / choppy states.", c: "#0be0ff", slug: "regime", live: true },
  { n: "09", t: "Prediction Studio", d: "XGBoost, LSTM and Transformer, ensembled.", c: "#a55efd", slug: "prediction", live: true },
];

function AllModules() {
  return (
    <section id="modules" className="relative z-10 border-t border-white/10 bg-panel/20">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <div className="mx-auto max-w-[600px] text-center">
            <h2 className="text-[2rem] font-medium leading-tight text-white sm:text-[2.6rem]">
              All nine modules
            </h2>
            <p className="mx-auto mt-4 text-[15.5px] leading-7 text-haze">
              One integrated platform. Every module shares the same tested maths — and the same refusal
              to flatter a result. Click any module to open it.
            </p>
          </div>
        </Reveal>

        <div className="hv-group mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m, i) => (
            <Reveal key={m.n} delay={(i % 3) * 0.06}>
              <Link
                href={`/features/${m.slug}`}
                className="hv group block h-full rounded-xl border border-white/10 bg-panel/45 p-5 backdrop-blur"
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[11px] font-bold" style={{ color: m.c }}>
                    {m.n}
                  </span>
                  <h3 className="text-[15.5px] font-semibold text-white">{m.t}</h3>
                  {m.live && (
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-forge-green/40 bg-forge-green/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-forge-green">
                      <span className="h-1 w-1 rounded-full bg-forge-green" />
                      live
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[13.5px] leading-6 text-haze">{m.d}</p>
                <span
                  className="mt-3 inline-block font-mono text-[11px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{ color: m.c }}
                >
                  Open module →
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 6 · Closing CTA ─────────────────────────────────────────────────────── */
function FeaturesCTA() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <div
          className="relative overflow-hidden rounded-[2rem] border border-forge-cyan/20 px-8 py-16 text-center sm:px-16"
          style={{ background: "radial-gradient(120% 140% at 50% 0%, rgba(11,224,255,0.13), rgba(5,7,15,0.6) 62%)" }}
        >
          <div className="absolute -left-20 top-8 h-56 w-56 rounded-full bg-forge-green/20 blur-3xl" />
          <div className="absolute -right-20 bottom-0 h-56 w-56 rounded-full bg-forge-violet/20 blur-3xl" />
          <div className="relative mx-auto max-w-[620px]">
            <h2 className="text-[2.2rem] font-medium leading-tight text-white sm:text-[2.8rem]">
              Ready to find out if your edge is <span className="forge-text font-semibold">real?</span>
            </h2>
            <p className="mx-auto mt-5 text-[16px] leading-7 text-haze">
              Test a strategy properly and get an honest verdict in seconds. Free, in demo mode,
              with no sign-up.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/"
                className="hv-btn rounded-[15px] border border-forge-green/60 bg-gradient-to-r from-forge-green to-forge-cyan px-6 py-3 text-[14.5px] font-semibold text-ink"
              >
                Test a strategy
              </Link>
              <Link
                href="/about"
                className="hv-btn rounded-[15px] border border-white/16 bg-white/[0.05] px-6 py-3 text-[14.5px] font-medium text-white"
              >
                Why we built it
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function FeaturesPageContent() {
  return (
    <>
      <FeaturesHero />
      <Pillars />
      <KeyFeature />
      <ModuleRows />
      <AllModules />
      <FeaturesCTA />
    </>
  );
}
