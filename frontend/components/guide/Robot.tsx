"use client";

import { motion } from "framer-motion";

/**
 * Forge — the onboarding assistant's face.
 *
 * Drawn to match the reference art: a friendly white robot with a dark visor,
 * cyan almond eyes and a smile, small floating arms and no legs. Kept as SVG so
 * it stays crisp at any size, animates, and needs no image asset.
 *
 * If you'd rather ship the original PNG, drop it at
 * `frontend/public/guide/robot.png` and swap the <svg> here for an <Image>.
 */
export function Robot({
  size = 44,
  mood = "happy",
  talking = false,
}: {
  size?: number;
  mood?: "happy" | "thinking" | "wave";
  talking?: boolean;
}) {
  const eye = mood === "thinking" ? "#ffd36e" : "#3fe0f0";

  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden>
      <defs>
        <linearGradient id="fg-shell" x1="0.25" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f4f7fb" />
          <stop offset="100%" stopColor="#dde5ef" />
        </linearGradient>
        <linearGradient id="fg-visor" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#243043" />
          <stop offset="100%" stopColor="#141b28" />
        </linearGradient>
        <radialGradient id="fg-eyeglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#7defff" />
          <stop offset="100%" stopColor="#3fe0f0" />
        </radialGradient>
        <filter id="fg-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="fg-shadow" x="-40%" y="-30%" width="180%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#04070e" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* the whole robot floats gently */}
      <motion.g
        animate={{ y: [0, -2.2, 0] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        filter="url(#fg-shadow)"
      >
        {/* ── arms — small capsules, angled out like the reference ── */}
        <motion.g
          animate={talking ? { rotate: [0, -9, 0] } : { rotate: [0, -4, 0] }}
          transition={{ duration: talking ? 1.3 : 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "26px 62px" }}
        >
          <rect x="12" y="58" width="9" height="24" rx="4.5"
            fill="url(#fg-shell)" stroke="#cfd9e6" strokeWidth="1.1"
            transform="rotate(18 16.5 70)" />
        </motion.g>
        <motion.g
          animate={talking ? { rotate: [0, 9, 0] } : { rotate: [0, 4, 0] }}
          transition={{ duration: talking ? 1.3 : 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "70px 62px" }}
        >
          <rect x="75" y="58" width="9" height="24" rx="4.5"
            fill="url(#fg-shell)" stroke="#cfd9e6" strokeWidth="1.1"
            transform="rotate(-18 79.5 70)" />
        </motion.g>

        {/* ── body — rounded, tapering, no legs ── */}
        <path
          d="M34 62 h28 a13 13 0 0 1 12.5 9.5 l2 8.5 a6 6 0 0 1 -5.9 7.2 H29.4 a6 6 0 0 1 -5.9 -7.2 l2 -8.5 A13 13 0 0 1 34 62 z"
          fill="url(#fg-shell)" stroke="#cfd9e6" strokeWidth="1.4"
        />
        {/* chest light */}
        <circle cx="48" cy="75" r="3.4" fill="#dfe8f2" stroke="#cbd6e4" strokeWidth="0.9" />

        {/* ── side ears / headphones ── */}
        <rect x="7" y="34" width="10" height="19" rx="5"
          fill="url(#fg-shell)" stroke="#cfd9e6" strokeWidth="1.3" />
        <rect x="79" y="34" width="10" height="19" rx="5"
          fill="url(#fg-shell)" stroke="#cfd9e6" strokeWidth="1.3" />

        {/* ── head ── */}
        <rect x="15" y="16" width="66" height="48" rx="21"
          fill="url(#fg-shell)" stroke="#cfd9e6" strokeWidth="1.6" />

        {/* ── visor ── */}
        <rect x="23" y="25" width="50" height="30" rx="14" fill="url(#fg-visor)" />
        {/* visor sheen */}
        <path d="M27 33 q9 -6 20 -6" stroke="#ffffff" strokeOpacity="0.14"
          strokeWidth="3.5" fill="none" strokeLinecap="round" />

        {/* ── eyes — almond, blinking ── */}
        <motion.g
          animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
          transition={{ duration: 5, repeat: Infinity, times: [0, 0.86, 0.9, 0.94, 1] }}
          style={{ transformOrigin: "48px 38px" }}
        >
          <rect x="33" y="33" width="11" height="9" rx="4.5"
            fill="url(#fg-eyeglow)" filter="url(#fg-soft)" />
          <rect x="52" y="33" width="11" height="9" rx="4.5"
            fill="url(#fg-eyeglow)" filter="url(#fg-soft)" />
        </motion.g>

        {/* ── smile ── */}
        {talking ? (
          <motion.ellipse
            cx="48" cy="48" rx="5" ry="2.6" fill={eye} filter="url(#fg-soft)"
            animate={{ ry: [2.6, 1.2, 3.2, 1.8, 2.6] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : (
          <path d="M42.5 46.5 q5.5 5 11 0" stroke={eye} strokeWidth="2.4"
            fill="none" strokeLinecap="round" filter="url(#fg-soft)" />
        )}
      </motion.g>
    </svg>
  );
}

/** The floating launcher — the robot already bobs, so this just frames it. */
export function RobotBubble({ size = 44 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center">
      <Robot size={size} mood="wave" />
    </div>
  );
}
