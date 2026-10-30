"use client";

/* Catches a crash in any page, so one failing component shows a way back instead
   of leaving the visitor on a blank screen. */
export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-[17px] font-semibold text-white">This page hit a problem</h1>
        <p className="text-[13px] leading-6 text-hazedim">
          Trying again usually clears it.
        </p>
        <button
          type="button"
          onClick={reset}
          className="hv-btn rounded-[12px] border border-forge-green/60 bg-gradient-to-r from-forge-green to-forge-cyan px-6 py-2.5 font-mono text-[12px] uppercase tracking-widest text-ink"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
