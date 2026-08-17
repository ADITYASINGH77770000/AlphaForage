"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/* Branded pre-loader shown while fonts + the first 3D scene warm up. */
export default function Loader() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const min = new Promise((r) => setTimeout(r, 1100)); // minimum on-screen time
    const ready =
      document.readyState === "complete"
        ? Promise.resolve()
        : new Promise((r) => window.addEventListener("load", () => r(null), { once: true }));
    Promise.all([min, ready]).then(() => setDone(true));
  }, []);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink"
        >
          <motion.svg
            width="76" height="76" viewBox="0 0 64 64"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <defs>
              <linearGradient id="afl" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00f5a0" />
                <stop offset="55%" stopColor="#0be0ff" />
                <stop offset="100%" stopColor="#a55efd" />
              </linearGradient>
            </defs>
            <motion.polygon
              points="32,3 55,16.5 55,43.5 32,57 9,43.5 9,16.5"
              fill="none" stroke="url(#afl)" strokeWidth="2.4" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 1, ease: "easeInOut" }}
            />
            <motion.path
              d="M18 46 L32 18 L46 46" fill="none" stroke="url(#afl)"
              strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, delay: 0.25, ease: "easeInOut" }}
            />
            <line x1="24" y1="37" x2="40" y2="37" stroke="url(#afl)" strokeWidth="4.2" strokeLinecap="round" />
            <motion.circle
              cx="32" cy="12" r="2.4" fill="#0be0ff"
              animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity }}
            />
          </motion.svg>
          <div className="mt-5 font-mono text-[11px] uppercase tracking-[0.35em] text-haze">Forging</div>
          <div className="mt-4 h-[2px] w-40 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg,#00f5a0,#0be0ff,#a55efd)" }}
              initial={{ width: "0%" }} animate={{ width: "100%" }}
              transition={{ duration: 1.1, ease: "easeInOut" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
