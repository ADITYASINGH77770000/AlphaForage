"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { revealProps, loadProps } from "./motion";

/* ──────────────────────────────────────────────────────────────────────────
   ABOUT PAGE — mapped onto the reference site's about-page architecture:
     1 · short centered hero (no wide visual)
     2 · trusted strip
     3 · three stat cards        (3 × 370px, 16px gap)
     4 · four "people" cards     (4 × 262px, 32px gap)  → our principles
     5 · list section            (their open roles)      → what we won't build
     6 · quote cards             (their testimonials)    → sourced research
     7 · FAQ                     (2 × 564px, 16px gap)
     8 · closing CTA
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
function AboutHero() {
  return (
    <section className="relative overflow-hidden pt-32 sm:pt-36">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden">
        <div
          className="absolute left-1/2 top-[-10%] h-[400px] w-[540px] -translate-x-1/2 rounded-full opacity-45"
          style={{ background: "radial-gradient(circle,#00f5a0 0%,transparent 70%)", filter: "blur(90px)" }}
        />
        <div
          className="absolute right-[10%] top-[12%] h-[240px] w-[240px] rounded-full opacity-45"
          style={{ background: "radial-gradient(circle,#a55efd 0%,transparent 70%)", filter: "blur(70px)" }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pb-6">
        <div className="mx-auto max-w-[600px] text-center">
          <motion.div {...loadProps(1)} className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-forge-cyan/20 bg-white/[0.04] py-1 pl-1 pr-4 backdrop-blur">
              <span className="rounded-full bg-gradient-to-r from-forge-green to-forge-cyan px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-ink">
                About
              </span>
              <span className="font-mono text-[11.5px] text-haze">Why this exists</span>
            </div>
          </motion.div>

          <motion.h1
            {...loadProps(2)}
            className="mt-7 text-[2.5rem] font-medium leading-[1.15] tracking-tight text-white sm:text-[3.2rem]"
          >
            Built because most trading tools{" "}
            <span className="forge-text font-semibold">quietly lie to you.</span>
          </motion.h1>

          <motion.p {...loadProps(3)} className="mx-auto mt-5 max-w-[540px] text-[16.5px] leading-7 text-haze">
            AlphaForge started from a simple frustration: every backtest looks brilliant, and almost
            none of them survive contact with a real market. So we built the tool that says so.
          </motion.p>

          <motion.div {...loadProps(4)} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/features"
              className="hv-btn rounded-[15px] border border-white/12 bg-white/[0.06] px-5 py-2.5 text-[14.5px] font-medium text-white backdrop-blur hover:border-forge-cyan/50"
            >
              See the features
            </Link>
            <Link
              href="/"
              className="hv-btn rounded-[15px] border border-forge-green/60 bg-gradient-to-r from-forge-green to-forge-cyan px-5 py-2.5 text-[14.5px] font-semibold text-ink"
            >
              Test a strategy
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ── 2 · Strip ───────────────────────────────────────────────────────────── */
function Strip() {
  return (
    <div className="relative border-y border-white/10 bg-panel/25 py-9 backdrop-blur">
      <p className="text-center font-mono text-[11px] uppercase tracking-[0.24em] text-hazedim">
        An educational research tool · not financial advice
      </p>
    </div>
  );
}

/* ── 3 · Three stat cards ────────────────────────────────────────────────── */
const STATS = [
  { k: "70%+", l: "of strategies fail the check", d: "Most rules that look good in a backtest don't survive deflation for luck." },
  { k: "0.4–0.6%", l: "real round-trip cost", d: "What a trade actually costs in Indian equities after STT, GST and slippage." },
  { k: "1 question", l: "that decides everything", d: "Is this edge real — or did you just search until something looked good?" },
];

function Stats() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
      <div className="hv-group grid gap-4 md:grid-cols-3">
        {STATS.map((s, i) => (
          <Reveal key={s.l} delay={i * 0.08}>
            <div className="hv h-full rounded-2xl border border-white/10 bg-panel/45 p-7 backdrop-blur">
              <div className="forge-text text-[2.4rem] font-medium leading-none">{s.k}</div>
              <div className="mt-3 text-[15px] font-semibold text-white">{s.l}</div>
              <div className="mt-1.5 text-[13px] leading-6 text-hazedim">{s.d}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── 4 · The principles (their team-card grid) ───────────────────────────── */
const PRINCIPLES = [
  {
    icon: "🎯",
    t: "Honesty over hype",
    r: "Core principle",
    d: "If a strategy doesn't hold up, the platform says so — even when a prettier answer would be easier to sell.",
    c: "#00f5a0",
  },
  {
    icon: "🔍",
    t: "Show the maths",
    r: "Transparency",
    d: "Every verdict can be traced back to a formula and a published source. No black boxes, no mystery signals.",
    c: "#0be0ff",
  },
  {
    icon: "🛡️",
    t: "Survival first",
    r: "Risk discipline",
    d: "Position sizing and drawdown limits are first-class features, because ruin ends the game before edge ever matters.",
    c: "#a55efd",
  },
  {
    icon: "🧭",
    t: "Accessible to anyone",
    r: "Design goal",
    d: "Institutional rigour shouldn't need a PhD. Plain English in, an honest answer out.",
    c: "#ffd700",
  },
];

function Principles() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
      <Reveal>
        <div className="mx-auto max-w-[620px] text-center">
          <h2 className="text-[2rem] font-medium leading-tight text-white sm:text-[2.6rem]">
            What AlphaForge stands for
          </h2>
          <p className="mx-auto mt-4 text-[15.5px] leading-7 text-haze">
            Four principles decide every feature that gets built — and every one that doesn&apos;t.
          </p>
        </div>
      </Reveal>

      <div className="hv-group mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {PRINCIPLES.map((p, i) => (
          <Reveal key={p.t} delay={i * 0.07}>
            <div className="hv h-full rounded-2xl border border-white/10 bg-panel/45 p-6 text-center backdrop-blur">
              <div
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl"
                style={{ background: `${p.c}14`, border: `1px solid ${p.c}40` }}
              >
                {p.icon}
              </div>
              <h3 className="mt-5 text-[17px] font-semibold text-white">{p.t}</h3>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: p.c }}>
                {p.r}
              </div>
              <p className="mt-3 text-[13.5px] leading-6 text-haze">{p.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── 5 · Deliberately out of scope (their roles list) ────────────────────── */
const NOT_BUILDING = [
  {
    icon: "🚫",
    t: "Real-money live execution",
    tag: "Out of scope",
    why: "Order management, reconciliation and regulatory exposure are a large, risky project on their own. Paper trading first.",
  },
  {
    icon: "🧊",
    t: "More ML forecasters",
    tag: "Deliberate",
    why: "The platform already has more than it needs. Short-series price forecasting overfits easily — quality over quantity.",
  },
  {
    icon: "⚛️",
    t: "Quantum computing",
    tag: "No edge",
    why: "The research is clear that it offers no deployable advantage for retail trading today.",
  },
  {
    icon: "📉",
    t: "“Beat the market” claims",
    tag: "Never",
    why: "The promise is honesty and discipline, not a magic profit machine. We won't market what we can't prove.",
  },
];

function OutOfScope() {
  return (
    <section className="relative z-10 border-y border-white/10 bg-panel/20">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <div className="mx-auto max-w-[620px] text-center">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-forge-violet">
              Scope discipline
            </p>
            <h2 className="mt-4 text-[2rem] font-medium leading-tight text-white sm:text-[2.5rem]">
              What we deliberately don&apos;t build
            </h2>
            <p className="mx-auto mt-4 text-[15.5px] leading-7 text-haze">
              Saying no is part of what makes the project credible. These are off the table — on purpose.
            </p>
          </div>
        </Reveal>

        <div className="hv-group mt-12 space-y-3">
          {NOT_BUILDING.map((n, i) => (
            <Reveal key={n.t} delay={i * 0.06}>
              <div className="hv flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-panel/45 px-5 py-4 backdrop-blur sm:flex-nowrap">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-ink/60 text-xl">
                  {n.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15.5px] font-semibold text-white">{n.t}</div>
                  <p className="mt-1 text-[13.5px] leading-6 text-haze">{n.why}</p>
                </div>
                <span className="shrink-0 rounded-full border border-white/12 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-hazedim">
                  {n.tag}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 6 · Grounded in research (their testimonial cards) ──────────────────── */
/* Every entry below was checked against the publisher of record before it was
   put on this page: venue, volume, pages, year, DOI/ISBN. `read` points at a
   copy that actually opens — for the three Bailey papers that is the author's
   own site, which is why those are free to read. `code` is the function that
   implements the result, so a reader can go and check the claim.

   Cover art is drawn by us (see CoverPlate). Publisher cover images are their
   copyright, so this page links out to them rather than re-hosting them. */
type Work = {
  kind: "Paper" | "Book";
  title: string;
  authors: string;
  venue: string;
  year: string;
  /** The problem the work identifies — the reason we changed something. */
  problem: string;
  /** What AlphaForge does about it. */
  built: string;
  /** Where that lives in this repo. */
  code: string;
  links: { label: string; href: string }[];
  c: string;
};

const RESEARCH: Work[] = [
  {
    kind: "Paper",
    title: "The Sharpe Ratio Efficient Frontier",
    authors: "David H. Bailey · Marcos López de Prado",
    venue: "Journal of Risk 15(2)",
    year: "2012",
    problem:
      "A Sharpe ratio read off a short track record is inflated. How much you should believe it depends on the track's length, skew and fat tails — none of which the raw number shows.",
    built:
      "Every verdict reports a Probabilistic Sharpe Ratio: the probability the true Sharpe clears a threshold, computed from that track's own skew and kurtosis.",
    code: "core/honesty.py · probabilistic_sharpe_ratio()",
    links: [
      { label: "Read the PDF", href: "https://www.davidhbailey.com/dhbpapers/sharpe-frontier.pdf" },
      { label: "SSRN", href: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1821643" },
      { label: "Journal of Risk", href: "https://www.risk.net/journal-of-risk/volume-15-number-2-december-2012" },
    ],
    c: "#00f5a0",
  },
  {
    kind: "Paper",
    title: "The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality",
    authors: "David H. Bailey · Marcos López de Prado",
    venue: "Journal of Portfolio Management 40(5), 94–107",
    year: "2014",
    problem:
      "Run many variations, report the best, and the Sharpe ratio you publish is a selection artefact. It has to be discounted for how many variations were tried before it means anything.",
    built:
      "The headline Sharpe is deflated by the effective number of trials, and shown next to the Sharpe luck alone would have produced over the same search.",
    code: "core/honesty.py · deflated_sharpe_ratio()",
    links: [
      { label: "Read the PDF", href: "https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf" },
      { label: "SSRN", href: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551" },
    ],
    c: "#0be0ff",
  },
  {
    kind: "Paper",
    title: "The Probability of Backtest Overfitting",
    authors: "Bailey · Borwein · López de Prado · Zhu",
    venue: "Journal of Computational Finance 20(4), 39–69 · doi:10.21314/JCF.2016.322",
    year: "2017",
    problem:
      "Optimise across enough configurations and the one that wins in-sample tends to land at or below median out-of-sample. What you need is the probability that this is what happened to your backtest.",
    built:
      "PBO is estimated with Combinatorially-Symmetric Cross-Validation — the method the paper defines — run across the configuration sweep behind every verdict.",
    code: "core/honesty.py · probability_of_backtest_overfitting()",
    links: [
      { label: "Read the PDF", href: "https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf" },
      { label: "SSRN", href: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253" },
      { label: "Publisher", href: "https://www.risk.net/journal-of-computational-finance/2471206/the-probability-of-backtest-overfitting" },
    ],
    c: "#a55efd",
  },
  {
    kind: "Paper",
    title: "Techniques for Verifying the Accuracy of Risk Measurement Models",
    authors: "Paul H. Kupiec",
    venue: "Journal of Derivatives 3(2), 73–84 · doi:10.3905/jod.1995.407942",
    year: "1995",
    problem:
      "A VaR figure is a testable claim about how often losses should breach it. Until you count the breaches against the expected rate, the model has never actually been challenged.",
    built:
      "The Risk module runs the Kupiec proportion-of-failures test — observed breaches against expected, returned with a p-value, so a VaR model can fail out loud.",
    code: "core/metrics.py · kupiec_test()",
    links: [
      { label: "Publisher", href: "https://www.pm-research.com/content/iijderiv/3/2/73" },
      { label: "DOI", href: "https://doi.org/10.3905/jod.1995.407942" },
      { label: "SSRN", href: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7065" },
    ],
    c: "#ffd700",
  },
  {
    kind: "Book",
    title: "Advances in Financial Machine Learning",
    authors: "Marcos López de Prado",
    venue: "Wiley · ISBN 978-1-119-48208-6",
    year: "2018",
    problem:
      "If a backtest acts on information that was not available at decision time, its results are inflated and cannot be repeated live. Leakage is subtle and usually silent.",
    built:
      "Positions are taken on the bar after the signal fires, never the same one; regime probabilities come from a forward pass only, rather than a full-sample smoother that would peek ahead.",
    code: "core/backtest_engine.py:224 · core/regime_detector.py",
    links: [
      { label: "Publisher", href: "https://www.wiley.com/en-us/Advances+in+Financial+Machine+Learning-p-9781119482086" },
    ],
    c: "#00f5a0",
  },
  {
    kind: "Book",
    title: "The Evaluation and Optimization of Trading Strategies (2nd ed.)",
    authors: "Robert Pardo",
    venue: "Wiley · ISBN 978-0-470-12801-5",
    year: "2008",
    problem:
      "Testing only on the data a strategy was fitted to overstates skill. A rule has to be re-fitted and re-tested on rolling windows it has never seen before you can call the result evidence.",
    built:
      "Walk-forward analysis with configurable train and test windows, reporting each fold and the in-sample versus out-of-sample gap rather than one flattering total.",
    code: "core/backtest_engine.py · run_walk_forward()",
    links: [
      { label: "Publisher", href: "https://www.wiley.com/en-us/The+Evaluation+and+Optimization+of+Trading+Strategies,+2nd+Edition-p-9781119196969" },
      { label: "Wiley Online", href: "https://onlinelibrary.wiley.com/doi/book/10.1002/9781119196969" },
    ],
    c: "#0be0ff",
  },
];

/* Our own cover art. Deliberately not the publisher's jacket image — those are
   their copyright. Reads as a spine + title plate, tinted per work. */
function CoverPlate({ w }: { w: Work }) {
  return (
    <div
      aria-hidden
      className="relative flex h-[132px] w-[96px] shrink-0 flex-col justify-between overflow-hidden rounded-md border border-white/12 p-2.5"
      style={{
        background: `linear-gradient(150deg, ${w.c}22, rgba(8,13,26,0.92) 62%)`,
        boxShadow: `inset 2px 0 0 ${w.c}, 0 10px 24px -12px ${w.c}55`,
      }}
    >
      <div className="font-mono text-[7.5px] uppercase tracking-[0.16em]" style={{ color: w.c }}>
        {w.kind}
      </div>
      <div className="font-mono text-[8px] leading-[1.35] text-white/85 line-clamp-5">
        {w.title}
      </div>
      <div className="font-mono text-[8px] tracking-wider text-hazedim">{w.year}</div>
    </div>
  );
}

function Research() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <div className="mx-auto max-w-[660px] text-center">
          <h2 className="text-[2rem] font-medium leading-tight text-white sm:text-[2.5rem]">
            Grounded in real research
          </h2>
          <p className="mx-auto mt-4 text-[15.5px] leading-7 text-haze">
            AlphaForge doesn&apos;t invent its standards. These are the works we read, the problem
            each one identifies, and the part of the engine we built in response — with a link so
            you can check us.
          </p>
        </div>
      </Reveal>

      <div className="hv-group mt-14 grid gap-4 lg:grid-cols-2">
        {RESEARCH.map((r, i) => (
          <Reveal key={r.title} delay={(i % 2) * 0.08}>
            <div className="hv flex h-full flex-col rounded-2xl border border-white/10 bg-panel/45 p-6 backdrop-blur">
              <div className="flex gap-5">
                <CoverPlate w={r} />
                <div className="min-w-0">
                  <div className="text-[14.5px] font-semibold leading-snug text-white">
                    {r.title}
                  </div>
                  <div className="mt-1.5 text-[13px] text-haze">{r.authors}</div>
                  <div className="mt-1 font-mono text-[10.5px] leading-4" style={{ color: r.c }}>
                    {r.venue}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {r.links.map((l) => (
                      <a
                        key={l.href}
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-white/14 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-widest text-hazedim transition-colors hover:border-white/30 hover:text-white"
                      >
                        {l.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-white/10 pt-4">
                <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-hazedim">
                  The problem it identifies
                </div>
                <p className="mt-1.5 text-[13.5px] leading-6 text-white/90">{r.problem}</p>
              </div>

              <div className="mt-4">
                <div
                  className="font-mono text-[9.5px] uppercase tracking-[0.16em]"
                  style={{ color: r.c }}
                >
                  So we built
                </div>
                <p className="mt-1.5 text-[13.5px] leading-6 text-haze">{r.built}</p>
                <div className="mt-2.5 truncate font-mono text-[10.5px] text-hazedim/80">
                  {r.code}
                </div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <p className="mx-auto mt-8 max-w-[640px] text-center font-mono text-[11px] leading-5 text-hazedim/70">
          Problem statements are our summaries — follow each link for the authors&apos; own words.
          Citations verified against the publisher of record. Cover art is ours; the works belong to
          their publishers.
        </p>
      </Reveal>
    </section>
  );
}

/* ── 7 · FAQ ─────────────────────────────────────────────────────────────── */
const FAQS = [
  {
    q: "Is AlphaForge financial advice?",
    a: "No. It's an educational research tool. It grades strategies for honesty and shows you the maths — it does not predict the future or tell you what to buy.",
  },
  {
    q: "Do I need to know how to code?",
    a: "No. Pick a strategy and a market from the controls and AlphaForge runs the whole test for you. The full analytics are there if you want to go deeper.",
  },
  {
    q: "Does it use real money?",
    a: "Never. Demo mode uses synthetic data, and every result is a simulation. Real-money execution is deliberately out of scope — AlphaForge never places an order.",
  },
  {
    q: "Why does it keep saying my strategy is overfit?",
    a: "Because it usually is. Once you correct a Sharpe ratio for how many variations were tried, most simple rules stop looking special. That's the honest answer.",
  },
  {
    q: "What makes this different from other backtesters?",
    a: "Most tools draw the equity curve and stop. AlphaForge runs the academic overfitting toolkit on every result and gives you a blunt verdict on whether to trust it.",
  },
  {
    q: "What data does it use?",
    a: "Market data with realistic India and US cost models — brokerage, STT, stamp duty, SEBI charges, GST and slippage. Demo mode generates synthetic series offline.",
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="relative z-10 border-t border-white/10 bg-panel/20">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <div className="mx-auto max-w-[620px] text-center">
            <h2 className="text-[2rem] font-medium leading-tight text-white sm:text-[2.5rem]">
              Frequently asked questions
            </h2>
            <p className="mx-auto mt-4 text-[15.5px] leading-7 text-haze">
              The things people ask before they trust a tool with their trading decisions.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {FAQS.map((f, i) => {
            const on = open === i;
            return (
              <Reveal key={f.q} delay={(i % 2) * 0.06}>
                <button
                  onClick={() => setOpen(on ? null : i)}
                  aria-expanded={on}
                  className="w-full rounded-xl border bg-panel/45 px-5 py-4 text-left backdrop-blur transition-all duration-700"
                  style={{
                    borderColor: on ? "rgba(11,224,255,0.4)" : "rgba(255,255,255,0.1)",
                    boxShadow: on ? "0 18px 40px -26px #0be0ff" : "none",
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[15px] font-semibold text-white">{f.q}</span>
                    <span
                      className="mt-0.5 shrink-0 font-mono text-[15px] transition-transform duration-500"
                      style={{ color: "#0be0ff", transform: on ? "rotate(45deg)" : "none" }}
                    >
                      +
                    </span>
                  </div>
                  <div
                    className="grid transition-all duration-500"
                    style={{ gridTemplateRows: on ? "1fr" : "0fr", opacity: on ? 1 : 0 }}
                  >
                    <div className="overflow-hidden">
                      <p className="mt-3 text-[13.5px] leading-6 text-haze">{f.a}</p>
                    </div>
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── 8 · CTA ─────────────────────────────────────────────────────────────── */
function AboutCTA() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <div
          className="relative overflow-hidden rounded-[2rem] border border-forge-green/20 px-8 py-16 text-center sm:px-16"
          style={{ background: "radial-gradient(120% 140% at 50% 0%, rgba(0,245,160,0.12), rgba(5,7,15,0.6) 62%)" }}
        >
          <div className="absolute -left-20 top-8 h-56 w-56 rounded-full bg-forge-cyan/20 blur-3xl" />
          <div className="absolute -right-20 bottom-0 h-56 w-56 rounded-full bg-forge-violet/20 blur-3xl" />
          <div className="relative mx-auto max-w-[620px]">
            <h2 className="text-[2.2rem] font-medium leading-tight text-white sm:text-[2.8rem]">
              Find out what your strategy is <span className="forge-text font-semibold">really worth.</span>
            </h2>
            <p className="mx-auto mt-5 text-[16px] leading-7 text-haze">
              Free, in demo mode, no sign-up. The worst that happens is you learn the truth early.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/"
                className="hv-btn rounded-[15px] border border-forge-green/60 bg-gradient-to-r from-forge-green to-forge-cyan px-6 py-3 text-[14.5px] font-semibold text-ink"
              >
                Test a strategy
              </Link>
              <Link
                href="/features"
                className="hv-btn rounded-[15px] border border-white/16 bg-white/[0.05] px-6 py-3 text-[14.5px] font-medium text-white"
              >
                Explore features
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function AboutPageContent() {
  return (
    <>
      <AboutHero />
      <Strip />
      <Stats />
      <Principles />
      <OutOfScope />
      <Research />
      <Faq />
      <AboutCTA />
    </>
  );
}
