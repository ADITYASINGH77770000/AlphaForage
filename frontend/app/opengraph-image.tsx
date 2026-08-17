import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "AlphaForge — The quant platform that tells you the truth";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(120% 100% at 50% 40%, #0b1426 0%, #05070f 70%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 108,
            fontWeight: 800,
            letterSpacing: -3,
            background: "linear-gradient(90deg,#00f5a0,#0be0ff,#a55efd)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          AlphaForge
        </div>
        <div style={{ marginTop: 12, fontSize: 34, color: "#8aa6c8" }}>
          The quant platform that tells you the truth.
        </div>
        <div
          style={{
            marginTop: 40,
            display: "flex",
            gap: 16,
            fontSize: 20,
            color: "#cfe0f5",
            fontFamily: "monospace",
          }}
        >
          <span style={{ padding: "8px 18px", borderRadius: 999, border: "1px solid #00f5a055" }}>
            Honesty Engine
          </span>
          <span style={{ padding: "8px 18px", borderRadius: 999, border: "1px solid #0be0ff55" }}>
            Backtester
          </span>
          <span style={{ padding: "8px 18px", borderRadius: 999, border: "1px solid #a55efd55" }}>
            Prediction Studio
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
