"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { BacktestShot, PredictionShot } from "./Mockups";
import { revealProps } from "./motion";
import { ARTICLES } from "@/lib/insights";

/* ──────────────────────────────────────────────────────────────────────────
   Marketing sections rebuilt to the reference site's architecture:
     • centered section heading + description
     • equal 50/50 feature rows (547px | 547px, 50px gap), alternating sides
     • 90px vertical rhythm between rows
     • every block enters with the same scroll reveal (y20 → 0, 800ms ease)
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
  // `className` lands on the motion.div itself — important when this wrapper is a
  // direct grid child, since CSS `order` only applies to direct children.
  return (
    <motion.div className={className} {...revealProps(delay)}>
      {children}
    </motion.div>
  );
}

/* ── Stat cards (the reference's second band) ────────────────────────────── */
const STATS = [
  { k: "202", l: "Tests passing", s: "Every calculation covered by automated tests." },
  { k: "9", l: "Core modules", s: "One integrated platform, not a bag of scripts." },
  { k: "24k", l: "Lines of engine", s: "A real quant engine, built not glued together." },
  { k: "0", l: "Real money at risk", s: "Research only — AlphaForge never places an order." },
];

export function SocialProof() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-24">
      <div className="hv-group grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.l} delay={i * 0.08}>
            <div className="hv h-full rounded-2xl border border-white/10 bg-panel/40 p-6 backdrop-blur">
              <div className="forge-text text-[2.6rem] font-medium leading-none">{s.k}</div>
              <div className="mt-3 text-[15px] font-semibold text-white">{s.l}</div>
              <div className="mt-1.5 text-[13px] leading-6 text-hazedim">{s.s}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── Feature rows ────────────────────────────────────────────────────────── */
type Row = {
  title: string;
  body: string;
  caption: string;
  bullets: string[];
  accent: string;
  mockup: React.ReactNode;
  flip?: boolean;
};

/* The headline features — chosen to create curiosity fast. */
const ROWS: Row[] = [
  {
    title: "It tells you when your strategy is lying",
    body:
      "Every backtest is graded with the academic overfitting toolkit — Deflated Sharpe and Probability of Backtest Overfitting — then given a blunt verdict: probably real, or likely overfit.",
    caption: "The check almost no retail tool dares to run.",
    bullets: [
      "Would this have blown up your account?",
      "Does it beat buy-and-hold after real costs?",
      "Corrected for how many variations you tried.",
    ],
    accent: "#a55efd",
    mockup: <BacktestShot />,
  },
  {
    title: "Three models, one honest forecast",
    body:
      "XGBoost, an LSTM and a Transformer are trained side by side, scored on data none of them saw, then blended by how well each actually performed — with a confidence score that drops when they disagree.",
    caption: "When the models argue, you get told.",
    bullets: [
      "Chronological validation split — no lookahead.",
      "Weighted by inverse error, not by hope.",
      "Confidence falls as the models diverge.",
    ],
    accent: "#0be0ff",
    mockup: <PredictionShot />,
    flip: true,
  },
];

export function FeatureRows() {
  return (
    <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 py-20">
      {/* centered section heading */}
      <Reveal>
        <div className="mx-auto max-w-[600px] text-center">
          <h2 className="text-[2.1rem] font-medium leading-tight text-white sm:text-[2.9rem]">
            Why traders trust it
          </h2>
          <p className="mx-auto mt-4 text-[15.5px] leading-7 text-haze">
            The things AlphaForge does that almost nothing else will — because the goal isn&apos;t to
            impress you, it&apos;s to tell you the truth.
          </p>
        </div>
      </Reveal>

      {/* equal 50/50 rows, 90px rhythm */}
      <div className="mt-20 flex flex-col gap-[90px]">
        {ROWS.map((r) => (
          <div key={r.title} className="grid items-center gap-[50px] lg:grid-cols-2">
            {/* copy */}
            <Reveal className={r.flip ? "lg:order-2" : undefined}>
              <div>
                <h3 className="text-[1.6rem] font-medium leading-snug text-white sm:text-[1.9rem]">
                  {r.title}
                </h3>
                <p className="mt-4 text-[15.5px] leading-7 text-haze">{r.body}</p>
                <p className="mt-3 text-[14px] italic leading-6 text-hazedim">{r.caption}</p>

                <a
                  href="#try"
                  className="hv-link mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold"
                  style={{ color: r.accent }}
                >
                  See how <span aria-hidden>→</span>
                </a>

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

            {/* visual */}
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

/* ── Insights ────────────────────────────────────────────────── */
/* Cards come from lib/insights.ts so the landing page and the articles can
   never disagree. Each image is a real chart produced by
   scripts/make_insight_charts.py from core.honesty / core.backtest_engine. */

export function Insights() {
  return (
    <section id="insights" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <div className="mx-auto max-w-[600px] text-center">
          <h2 className="text-[2.1rem] font-medium leading-tight text-white sm:text-[2.7rem]">
            Insights &amp; Inspiration
          </h2>
          <p className="mx-auto mt-4 text-[15.5px] leading-7 text-haze">
            Learn the discipline, not just the tool. Short reads on overfitting, costs and the risk
            habits that decide whether a trader survives &mdash; every figure computed by the same
            engine that runs the product.
          </p>
        </div>
      </Reveal>

      <div className="hv-group mt-16 grid gap-6 md:grid-cols-3">
        {ARTICLES.map((p, i) => (
          <Reveal key={p.slug} delay={i * 0.08}>
            <Link
              href={`/insights/${p.slug}`}
              className="hv group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-panel/40 backdrop-blur hover:border-white/25"
            >
              <div className="relative h-40 overflow-hidden border-b border-white/10">
                <Image
                  src={p.image}
                  alt={p.imageAlt}
                  width={720}
                  height={368}
                  sizes="(max-width: 768px) 100vw, 380px"
                  className="h-full w-full object-cover object-left-top transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
                  <span style={{ color: p.accent }}>{p.tag}</span>
                  <span className="text-hazedim/60">&middot; {p.readMinutes} min</span>
                </div>
                <h3 className="mt-2.5 text-[17px] font-semibold leading-snug text-white">{p.title}</h3>
                <p className="mt-2.5 text-[13.5px] leading-6 text-haze">{p.excerpt}</p>
                <span className="mt-5 inline-block text-[13px] font-semibold" style={{ color: p.accent }}>
                  Read more &rarr;
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}


/* ── Footer ──────────────────────────────────────────────────────────────── */
const FOOTER_COLS = [
  { h: "Platform", links: ["Honesty Engine", "Backtester", "Prediction Studio", "Dashboard"] },
  { h: "Analytics", links: ["Risk Analytics", "Portfolio Optimization", "Factor Analytics", "Regime Detection", "Prediction"] },
  { h: "Resources", links: ["Documentation", "Insights", "Glossary", "REST API", "Changelog"] },
  { h: "Company", links: ["About", "Contact", "Privacy", "Terms"] },
];

export function FooterFull() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-panel/30">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
                <defs>
                  <linearGradient id="aff" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#00f5a0" />
                    <stop offset="55%" stopColor="#0be0ff" />
                    <stop offset="100%" stopColor="#a55efd" />
                  </linearGradient>
                </defs>
                <polygon points="32,3 55,16.5 55,43.5 32,57 9,43.5 9,16.5" fill="none" stroke="url(#aff)" strokeWidth="2.6" />
                <path d="M18 46 L32 18 L46 46" fill="none" stroke="url(#aff)" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="24" y1="37" x2="40" y2="37" stroke="url(#aff)" strokeWidth="4.4" strokeLinecap="round" />
              </svg>
              <span className="font-mono text-sm font-bold text-white">AlphaForge</span>
            </div>
            <p className="mt-4 max-w-xs text-[13.5px] leading-6 text-haze">
              The quant platform that tells you the truth. Test strategies honestly — before you risk a rupee.
            </p>
            <div className="mt-5 flex gap-2.5">
              {["𝕏", "in", "gh"].map((s) => (
                <span
                  key={s}
                  className="hv-btn flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/12 font-mono text-[11px] text-hazedim hover:border-forge-cyan hover:text-forge-cyan"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {FOOTER_COLS.map((c) => (
            <div key={c.h}>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-white">{c.h}</div>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <span className="hv-link cursor-pointer text-[13px] text-haze hover:text-forge-cyan">
                      {l}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-7 sm:flex-row">
          <p className="text-[12px] text-hazedim">
            © {new Date().getFullYear()} AlphaForge · Concept landing page
          </p>
          <p className="max-w-xl text-center text-[11.5px] leading-5 text-hazedim/75 sm:text-right">
            Educational research tool, not financial advice. AlphaForge grades strategies for honesty —
            it does not predict the future.
          </p>
        </div>
      </div>
    </footer>
  );
}
