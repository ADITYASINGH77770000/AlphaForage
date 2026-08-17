import Link from "next/link";
import { ModuleHeader } from "./Shell";

/* Shown for modules whose backend isn't wired to the UI yet. Deliberately does
   not render fake data — it says plainly that the module exists in the engine
   but hasn't been connected to this interface. */
export function ModulePending({
  n,
  title,
  subtitle,
  accent,
}: {
  n: string;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <>
      <ModuleHeader
        n={n}
        title={title}
        subtitle={subtitle}
        accent={accent}
        right={
          <span className="rounded-full border border-white/14 bg-white/[0.04] px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-widest text-hazedim">
            ○ not wired yet
          </span>
        }
      />

      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <div className="rounded-2xl border border-white/10 bg-panel/45 p-10 backdrop-blur">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
            style={{ background: `${accent}14`, border: `1px solid ${accent}40` }}
          >
            🔌
          </div>
          <h2 className="mt-6 text-[1.5rem] font-medium text-white">
            This module runs in the engine — not yet in this UI
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[14.5px] leading-7 text-haze">
            {title} is fully implemented in the AlphaForge Python core and available today in the
            Streamlit app. We&apos;re connecting the modules to this interface one at a time, so it stays
            correct rather than merely quick.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-[13px] leading-6 text-hazedim">
            Nothing here is mocked up to look finished — when this page shows numbers, they will be
            real ones from the engine.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/features/dashboard"
              className="hv-btn rounded-[15px] border border-forge-green/60 bg-gradient-to-r from-forge-green to-forge-cyan px-5 py-2.5 text-[14.5px] font-semibold text-ink"
            >
              See a connected module
            </Link>
            <Link
              href="/features#modules"
              className="hv-btn rounded-[15px] border border-white/16 bg-white/[0.05] px-5 py-2.5 text-[14.5px] font-medium text-white"
            >
              Back to all modules
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
