"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { loadProps } from "./motion";
import { DashboardShot } from "./Mockups";

// 3D scene is client-only (WebGL) — never server-rendered.
const ForgeScene = dynamic(() => import("./ForgeScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0" />,
});

/* Blurred light orbs behind the hero — the reference site layers three of these
   (blur 9 / 18 / 16px) behind all hero content. */
function Lights() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute left-[8%] top-[6%] h-[240px] w-[240px] rounded-full opacity-60"
        style={{ background: "radial-gradient(circle, #00f5a0 0%, transparent 70%)", filter: "blur(60px)" }}
      />
      <div
        className="absolute left-1/2 top-[-6%] h-[420px] w-[520px] -translate-x-1/2 rounded-full opacity-50"
        style={{ background: "radial-gradient(circle, #0be0ff 0%, transparent 70%)", filter: "blur(90px)" }}
      />
      <div
        className="absolute right-[6%] top-[14%] h-[260px] w-[260px] rounded-full opacity-55"
        style={{ background: "radial-gradient(circle, #a55efd 0%, transparent 70%)", filter: "blur(70px)" }}
      />
    </div>
  );
}

const LOGOS = ["NSE", "BSE", "NIFTY 50", "S&P 500", "NASDAQ", "yfinance"];

export default function Hero() {
  return (
    <section className="relative w-full overflow-hidden pb-0 pt-32 sm:pt-36">
      {/* ambient 3D Forge Core + light orbs behind everything */}
      <div className="absolute inset-x-0 top-0 h-[760px]">
        <div className="absolute inset-0 opacity-70">
          <ForgeScene />
        </div>
        <Lights />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(115% 78% at 50% 22%, transparent 0%, rgba(5,7,15,0.55) 52%, rgba(5,7,15,0.96) 100%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        {/* ── centered copy column (600px, exactly the reference proportion) ── */}
        <div className="mx-auto max-w-[600px] text-center">
          {/* 02 · headline — Bhagavad Gita 2.16: "nāsato vidyate bhāvo, nābhāvo
              vidyate sataḥ" — the unreal has no being, the real never ceases to
              be. Exactly what the Honesty Engine decides about an edge. */}
          <motion.h1
            {...loadProps(2)}
            className="mt-7 text-[2.75rem] font-medium leading-[1.15] tracking-tight text-white sm:text-[3.6rem] sm:leading-[1.12]"
          >
            Nasato Vidyate Bhavah.
          </motion.h1>

          {/* 03 · sub copy */}
          <motion.p {...loadProps(3)} className="mx-auto mt-5 max-w-[520px] text-[16.5px] leading-7 text-haze">
            Test a strategy against real costs and unseen data — then find out honestly whether the
            edge is real or just an overfit illusion.
          </motion.p>

          {/* 04 · two buttons, centered */}
          <motion.div {...loadProps(4)} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#how"
              className="hv-btn rounded-[15px] border border-white/12 bg-white/[0.06] px-5 py-2.5 text-[14.5px] font-medium text-white backdrop-blur hover:border-forge-cyan/50"
            >
              Read more
            </a>
            <a
              href="#try"
              className="hv-btn rounded-[15px] border border-forge-green/60 bg-gradient-to-r from-forge-green to-forge-cyan px-5 py-2.5 text-[14.5px] font-semibold text-ink"
            >
              Test a strategy
            </a>
          </motion.div>
        </div>

        {/* ── 05 · the wide product visual, centered under the copy ── */}
        <motion.div {...loadProps(5)} className="relative mx-auto mt-16 max-w-[1144px]">
          <div
            className="pointer-events-none absolute -inset-x-10 -top-6 bottom-0 opacity-70"
            style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(11,224,255,0.18), transparent 70%)" }}
          />
          <div className="relative">
            <DashboardShot priority sizes="(max-width: 1024px) 100vw, 1200px" />
          </div>
        </motion.div>
      </div>

      {/* ── trusted-by strip closing the hero ── */}
      <motion.div {...loadProps(5)} className="relative mt-20 border-t border-white/10 bg-panel/25 py-9 backdrop-blur">
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.24em] text-hazedim">
          Built on real market data · India &amp; US cost models
        </p>
        <div className="hv-group mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-center gap-x-12 gap-y-4 px-6">
          {LOGOS.map((l) => (
            <span
              key={l}
              className="hv-btn font-mono text-[15px] font-semibold tracking-wide text-white/35 hover:text-white/70"
            >
              {l}
            </span>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
