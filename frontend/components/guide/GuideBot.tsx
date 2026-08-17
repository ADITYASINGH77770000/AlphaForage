"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../auth/AuthProvider";
import { Robot, RobotBubble } from "./Robot";
import { MODULE_TOURS, WELCOME, tourForPath, type Step, type Tour } from "./tours";

/* ──────────────────────────────────────────────────────────────────────────
   Forge — the onboarding assistant.

   • Floats bottom-right on every page.
   • Opens itself the first time someone lands on the site, then never again
     unless they ask (state in localStorage).
   • Runs step-by-step tours and spotlights real elements via [data-tour].
   ────────────────────────────────────────────────────────────────────────── */

const SEEN_KEY = "alphaforge.guide.seen.v1";

/** Routes that show nothing but the auth card — no nav, no branding, no bot. */
const AUTH_ROUTES = ["/login", "/signup"];
const DONE_KEY = "alphaforge.guide.done.v1";

type Rect = { top: number; left: number; width: number; height: number };

function readDone(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function markDone(id: string) {
  try {
    const all = new Set(readDone());
    all.add(id);
    localStorage.setItem(DONE_KEY, JSON.stringify([...all]));
  } catch {
    /* private mode — the tour still works, it just won't remember */
  }
}

/** Ring + dimmed surround over the element a step points at. */
function Spotlight({ rect }: { rect: Rect | null }) {
  if (!rect) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none fixed z-[60] rounded-xl"
      style={{
        top: rect.top - 8,
        left: rect.left - 8,
        width: rect.width + 16,
        height: rect.height + 16,
        boxShadow: "0 0 0 9999px rgba(3,6,14,0.72), 0 0 0 2px #0be0ff",
        transition: "top .28s ease, left .28s ease, width .28s ease, height .28s ease",
      }}
    />
  );
}

export function GuideBot() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [tour, setTour] = useState<Tour | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [nudge, setNudge] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const pageTour = useMemo(() => tourForPath(pathname), [pathname]);

  /* Who is this? A brand-new ACCOUNT gets the tour run for it automatically;
     a returning one never does. Tied to the user, not the browser, so it
     behaves the same on a new device and can't be reset by clearing storage. */
  const { user, loading, markOnboarded } = useAuth();
  const autoRan = useRef(false);

  useEffect(() => {
    if (loading || autoRan.current) return;

    // Signed-in but never onboarded → run the welcome tour for them.
    if (user && !user.onboarded) {
      autoRan.current = true;
      const t = setTimeout(() => { setOpen(true); setTour(WELCOME); setI(0); }, 1200);
      return () => clearTimeout(t);
    }

    // Signed out and brand new to this browser → a soft nudge only, no tour.
    if (!user && typeof window !== "undefined" && !localStorage.getItem(SEEN_KEY)) {
      autoRan.current = true;
      const t = setTimeout(() => {
        setNudge(true);
        setOpen(true);
        try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ }
      }, 1600);
      return () => clearTimeout(t);
    }
    // Depend on PRIMITIVES, not the user object: a new object identity on an
    // unrelated re-render would re-run this effect, and its cleanup would clear
    // the pending timer while `autoRan` blocked rescheduling — the tour then
    // never appeared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, user?.onboarded]);

  /* Route changes invalidate a MODULE tour, whose steps point at elements on
     that page. The welcome tour is page-agnostic, so it survives navigation —
     important, because signing up navigates while the tour is running. */
  const tourRef = useRef<Tour | null>(null);
  const prevPath = useRef<string | null>(null);
  useEffect(() => { tourRef.current = tour; }, [tour]);

  useEffect(() => {
    if (prevPath.current !== null && prevPath.current !== pathname) {
      if (tourRef.current && tourRef.current.id !== WELCOME.id) {
        setTour(null);
        setI(0);
      }
      setRect(null);
    }
    prevPath.current = pathname;
  }, [pathname]);

  const step: Step | null = tour ? tour.steps[i] ?? null : null;

  /* Track the spotlighted element, following scroll and resize. */
  const measure = useCallback(() => {
    if (!step?.anchor) { setRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useEffect(() => {
    if (!step) { setRect(null); return; }
    const el = step.anchor
      ? document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
      : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(measure, el ? 420 : 0);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [step, measure]);

  /* Keyboard: Esc closes, arrows move through a tour. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setTour(null); setOpen(false); }
      if (!tour) return;
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, tour.steps.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour]);

  const onAuthScreen = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  const start = (t: Tour) => { setTour(t); setI(0); setOpen(true); setNudge(false); };
  const finish = () => {
    if (tour) {
      markDone(tour.id);
      // Completing the welcome tour retires the auto-run for this account.
      if (tour.id === WELCOME.id && user && !user.onboarded) markOnboarded();
    }
    setTour(null); setI(0); setRect(null);
  };

  const last = tour ? i === tour.steps.length - 1 : false;

  // Hooks above always run, so bailing out here keeps hook order stable.
  if (onAuthScreen) return null;

  return (
    <>
      <AnimatePresence>{tour && <Spotlight rect={rect} />}</AnimatePresence>

      {/* launcher */}
      <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-3">
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="w-[min(92vw,384px)] overflow-hidden rounded-2xl border border-white/12 bg-[#080d1a]/95 shadow-2xl backdrop-blur-xl"
              style={{ boxShadow: "0 30px 80px -30px rgba(11,224,255,0.35)" }}
              role="dialog"
              aria-label="AlphaForge guide"
            >
              {/* header */}
              <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3">
                <Robot size={34} mood={tour ? "thinking" : "happy"} talking={!!tour} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-white">Forge</div>
                  <div className="truncate font-mono text-[10px] uppercase tracking-widest text-hazedim">
                    {tour ? `${tour.name} · ${i + 1}/${tour.steps.length}` : "your guide"}
                  </div>
                </div>
                <button
                  onClick={() => { setTour(null); setOpen(false); }}
                  aria-label="Close guide"
                  className="rounded-lg px-2 py-1 font-mono text-[15px] leading-none text-hazedim transition-colors hover:bg-white/10 hover:text-white"
                >
                  ×
                </button>
              </div>

              {/* body */}
              <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
                {tour && step ? (
                  <>
                    <h3 className="text-[15.5px] font-semibold leading-snug text-white">
                      {step.title}
                    </h3>
                    <p className="mt-2.5 text-[13.5px] leading-6 text-haze">{step.body}</p>
                    {step.cta && (
                      <Link
                        href={step.cta.href}
                        onClick={finish}
                        className="hv-btn mt-4 inline-block rounded-[10px] border border-forge-cyan/50 bg-forge-cyan/10 px-4 py-2 font-mono text-[11.5px] uppercase tracking-widest text-forge-cyan"
                      >
                        {step.cta.label} →
                      </Link>
                    )}
                  </>
                ) : (
                  <Menu
                    pageTour={pageTour}
                    onStart={start}
                    pathname={pathname}
                  />
                )}
              </div>

              {/* footer */}
              {tour && (
                <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.02] px-4 py-3">
                  <div className="flex flex-1 items-center gap-1.5">
                    {tour.steps.map((_, k) => (
                      <button
                        key={k}
                        onClick={() => setI(k)}
                        aria-label={`Step ${k + 1}`}
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: k === i ? 18 : 6,
                          background: k === i ? "#0be0ff" : "rgba(255,255,255,0.22)",
                        }}
                      />
                    ))}
                  </div>
                  {i > 0 && (
                    <button
                      onClick={() => setI((n) => n - 1)}
                      className="rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-hazedim hover:text-white"
                    >
                      Back
                    </button>
                  )}
                  <button
                    onClick={() => (last ? finish() : setI((n) => n + 1))}
                    className="hv-btn rounded-[9px] border border-forge-cyan/50 bg-forge-cyan/12 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-widest text-forge-cyan"
                  >
                    {last ? "Done" : "Next"}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => { setOpen((o) => !o); setNudge(false); }}
          aria-label={open ? "Hide the guide" : "Open the guide"}
          className="relative grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-[#0a1120]/90 backdrop-blur transition-transform hover:scale-[1.06]"
          style={{ boxShadow: "0 14px 40px -12px rgba(11,224,255,0.5)" }}
        >
          <RobotBubble size={38} />
          {nudge && !open && (
            <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-[#0a1120] bg-forge-green" />
          )}
        </button>
      </div>
    </>
  );
}

/* ── the menu shown when no tour is running ──────────────────────────────── */

function Menu({
  pageTour,
  onStart,
  pathname,
}: {
  pageTour: Tour | null;
  onStart: (t: Tour) => void;
  pathname: string;
}) {
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => setDone(readDone()), []);

  const onModulePage = pathname.startsWith("/features/");

  return (
    <div>
      <p className="text-[13.5px] leading-6 text-haze">
        {onModulePage && pageTour
          ? `You're on ${pageTour.name}. Want me to walk you through it?`
          : "New here? I can explain what AlphaForge does and how to drive it — about two minutes."}
      </p>

      <div className="mt-4 space-y-2">
        {pageTour && (
          <GuideOption
            title={`Guide me through ${pageTour.name}`}
            sub={pageTour.intro}
            accent="#0be0ff"
            done={done.includes(pageTour.id)}
            onClick={() => onStart(pageTour)}
          />
        )}
        <GuideOption
          title="What is AlphaForge?"
          sub={WELCOME.intro}
          accent="#00f5a0"
          done={done.includes(WELCOME.id)}
          onClick={() => onStart(WELCOME)}
        />
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="font-mono text-[10px] uppercase tracking-widest text-hazedim">
          Explain a module
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {Object.values(MODULE_TOURS).map((t) => (
            <button
              key={t.id}
              onClick={() => onStart(t)}
              className="rounded-lg border border-white/12 px-2.5 py-1 font-mono text-[10.5px] text-hazedim transition-colors hover:border-forge-cyan/50 hover:text-forge-cyan"
            >
              {t.name}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] leading-5 text-hazedim/80">
          Tip: arrow keys move through a tour, Esc closes it.
        </p>
      </div>
    </div>
  );
}

function GuideOption({
  title, sub, accent, done, onClick,
}: {
  title: string; sub: string; accent: string; done: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="hv block w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-white/25"
    >
      <div className="flex items-center gap-2">
        <span className="text-[13.5px] font-semibold text-white">{title}</span>
        {done && (
          <span className="font-mono text-[9.5px] uppercase tracking-widest" style={{ color: accent }}>
            ✓ seen
          </span>
        )}
      </div>
      <div className="mt-1 text-[12px] leading-5 text-hazedim">{sub}</div>
    </button>
  );
}
