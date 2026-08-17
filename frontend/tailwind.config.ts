import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#05070f",
        panel: "#0b1426",
        forge: {
          green: "#00f5a0",
          cyan: "#0be0ff",
          violet: "#a55efd",
          gold: "#ffd700",
        },
        // Body text — brightened for readability on the dark background.
        haze: "#adc6dd",
        hazedim: "#8aa6c8",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          to: { backgroundPosition: "220% center" },
        },
      },
      animation: {
        floaty: "floaty 6s ease-in-out infinite",
        shimmer: "shimmer 4s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
