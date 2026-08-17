/* ──────────────────────────────────────────────────────────────────────────
   Motion presets matched to the reference site's Webflow IX2 timings.

   Extracted from its interaction data (124 events / 34 action lists):
     • Dominant pattern (73 × SCROLL_INTO_VIEW):
         from  translateY(20px), opacity 0
         to    translateY(0),    opacity 1
         delay 300ms · duration 800ms · easing "ease"
     • Page load: five staggered stages (animate-on-load-01 … -05)
     • Hover (MOUSE_OVER/OUT): scale 1 ↔ 0.9, opacity 1 ↔ 0.5, 700ms ease
   ────────────────────────────────────────────────────────────────────────── */

// CSS "ease" == cubic-bezier(0.25, 0.1, 0.25, 1)
export const EASE = [0.25, 0.1, 0.25, 1] as const;

export const REVEAL_DISTANCE = 20;
export const REVEAL_DURATION = 0.8;
export const REVEAL_DELAY = 0.3;

/** The canonical scroll-into-view reveal. */
export const revealProps = (extraDelay = 0) => ({
  initial: { opacity: 0, y: REVEAL_DISTANCE },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: {
    duration: REVEAL_DURATION,
    delay: REVEAL_DELAY + extraDelay,
    ease: EASE as unknown as number[],
  },
});

/** Staggered page-load stages 1–5, mirroring animate-on-load-01 … -05. */
export const loadProps = (stage = 1) => ({
  initial: { opacity: 0, y: REVEAL_DISTANCE },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: REVEAL_DURATION,
    delay: 0.15 * stage,
    ease: EASE as unknown as number[],
  },
});

/** Hover feedback used on cards/links. */
export const HOVER_DURATION = 0.7;
