"use client";

import { motion } from "framer-motion";
import { downsample } from "@/lib/api";

/* Reusable SVG chart primitives shared by every feature module. */

/** `dots` draws discrete markers instead of a path — used for VaR violations. */
export type Series = {
  label: string; color: string; values: (number | null)[];
  dashed?: boolean; dots?: boolean;
};

/** Multi-series line chart with a value axis and optional x labels. */
export function LineChart({
  series,
  labels,
  height = 240,
  yFormat = (v: number) => v.toFixed(2),
  zeroLine = false,
  fillFirst = false,
}: {
  series: Series[];
  labels?: string[];
  height?: number;
  yFormat?: (v: number) => string;
  zeroLine?: boolean;
  fillFirst?: boolean;
}) {
  const W = 940;
  const H = height;
  const PAD = { l: 58, r: 14, t: 14, b: 24 };
  const n = Math.max(...series.map((s) => s.values.length));
  if (!n) return null;

  const flat = series.flatMap((s) => s.values.filter((v): v is number => v != null && Number.isFinite(v)));
  if (!flat.length) return null;
  let min = Math.min(...flat);
  let max = Math.max(...flat);
  if (zeroLine) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  const span = max - min || 1;
  const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);

  const toPath = (vals: (number | null)[]) => {
    let d = "";
    let open = false;
    vals.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) { open = false; return; }
      d += `${open ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      open = true;
    });
    return d;
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * span);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
          <text x={PAD.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#8aa6c8" fontFamily="monospace">
            {yFormat(t)}
          </text>
        </g>
      ))}
      {zeroLine && min < 0 && max > 0 && (
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.22)" />
      )}

      {fillFirst && series[0] && (
        <path
          d={`${toPath(series[0].values)} L${x(n - 1)},${H - PAD.b} L${PAD.l},${H - PAD.b} Z`}
          fill={series[0].color}
          opacity={0.12}
        />
      )}

      {series.map((s) =>
        s.dots ? (
          <g key={s.label}>
            {s.values.map((v, i) =>
              v == null || !Number.isFinite(v) ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill={s.color} opacity={0.9} />
              )
            )}
          </g>
        ) : (
          <motion.path
            key={s.label}
            d={toPath(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.8}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1 }}
          />
        )
      )}

      {labels &&
        [0, Math.floor(n / 2), n - 1].map((i) =>
          labels[i] ? (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              fontSize="10"
              fill="#8aa6c8"
              fontFamily="monospace"
            >
              {String(labels[i]).slice(0, 7)}
            </text>
          ) : null
        )}
    </svg>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-4 font-mono text-[10.5px] text-hazedim">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-4 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Histogram — used for return distributions and value distributions. */
export function Histogram({
  values, bins = 44, color = "#0be0ff", height = 200,
  // Axis formatter. Defaults to percent (returns); pass a currency/number
  // formatter when the values aren't fractions.
  xFormat = (v: number) => `${(v * 100).toFixed(1)}%`,
  marker,
  // Extra labelled vertical lines — the four VaR estimates on one distribution.
  markers = [],
}: {
  values: number[]; bins?: number; color?: string; height?: number;
  xFormat?: (v: number) => string;
  marker?: number;
  markers?: { value: number; color: string; label: string }[];
}) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const counts = new Array(bins).fill(0);
  clean.forEach((v) => {
    const b = Math.min(bins - 1, Math.floor(((v - min) / span) * bins));
    counts[b] += 1;
  });
  const peak = Math.max(...counts) || 1;

  const W = 940, H = height, PAD = { l: 44, r: 12, t: 12, b: 24 };
  const bw = (W - PAD.l - PAD.r) / bins;
  // Reference line: zero for returns, or an explicit marker (e.g. starting capital).
  const refVal = marker ?? 0;
  const showRef = refVal > min && refVal < max;
  const refX = PAD.l + ((refVal - min) / span) * (W - PAD.l - PAD.r);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {counts.map((c, i) => {
        const h = (c / peak) * (H - PAD.t - PAD.b);
        const binMid = min + ((i + 0.5) / bins) * span;
        return (
          <motion.rect
            key={i}
            x={PAD.l + i * bw + 0.6}
            width={Math.max(1, bw - 1.2)}
            y={H - PAD.b - h}
            height={h}
            fill={binMid < refVal ? "#ff5470" : color}
            opacity={0.72}
            initial={{ height: 0, y: H - PAD.b }}
            animate={{ height: h, y: H - PAD.b - h }}
            transition={{ duration: 0.5, delay: i * 0.006 }}
          />
        );
      })}
      {showRef && (
        <line x1={refX} x2={refX} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
      )}
      {markers.map((mk, i) => {
        if (!(mk.value > min && mk.value < max)) return null;
        const mx = PAD.l + ((mk.value - min) / span) * (W - PAD.l - PAD.r);
        return (
          <g key={mk.label}>
            <line x1={mx} x2={mx} y1={PAD.t} y2={H - PAD.b} stroke={mk.color} strokeWidth={1.4} strokeDasharray="4 3" />
            <text x={mx + 3} y={PAD.t + 10 + i * 12} fontSize="9.5" fill={mk.color} fontFamily="monospace">
              {mk.label}
            </text>
          </g>
        );
      })}
      <text x={PAD.l} y={H - 6} fontSize="10" fill="#8aa6c8" fontFamily="monospace">
        {xFormat(min)}
      </text>
      {showRef && (
        <text x={refX} y={H - 6} textAnchor="middle" fontSize="10" fill="#cfe0f5" fontFamily="monospace">
          {xFormat(refVal)}
        </text>
      )}
      <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="10" fill="#8aa6c8" fontFamily="monospace">
        {xFormat(max)}
      </text>
    </svg>
  );
}

/** Scatter — used for the efficient frontier. */
export function Scatter({
  points, highlights = [], height = 300, xLabel, yLabel,
}: {
  // `color` overrides the value-gradient — used to colour points by regime.
  points: { x: number; y: number; c: number; color?: string }[];
  highlights?: { x: number; y: number; color: string; label: string }[];
  height?: number; xLabel?: string; yLabel?: string;
}) {
  if (!points.length) return null;
  const W = 940, H = height, PAD = { l: 60, r: 16, t: 16, b: 40 };
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const allX = [...xs, ...highlights.map((h) => h.x)];
  const allY = [...ys, ...highlights.map((h) => h.y)];
  const xMin = Math.min(...allX), xMax = Math.max(...allX);
  const yMin = Math.min(...allY), yMax = Math.max(...allY);
  const xSpan = xMax - xMin || 1, ySpan = yMax - yMin || 1;
  const cMin = Math.min(...points.map((p) => p.c)), cMax = Math.max(...points.map((p) => p.c));
  const cSpan = cMax - cMin || 1;
  const px = (v: number) => PAD.l + ((v - xMin) / xSpan) * (W - PAD.l - PAD.r);
  const py = (v: number) => PAD.t + (1 - (v - yMin) / ySpan) * (H - PAD.t - PAD.b);
  const col = (c: number) => {
    const t = (c - cMin) / cSpan;
    return `rgb(${Math.round(11 + t * 0)}, ${Math.round(120 + t * 125)}, ${Math.round(255 - t * 95)})`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 0.5, 1].map((f, i) => (
        <g key={i}>
          <line x1={PAD.l} x2={W - PAD.r} y1={py(yMin + f * ySpan)} y2={py(yMin + f * ySpan)} stroke="rgba(255,255,255,0.06)" />
          <text x={PAD.l - 8} y={py(yMin + f * ySpan) + 3.5} textAnchor="end" fontSize="10" fill="#8aa6c8" fontFamily="monospace">
            {((yMin + f * ySpan) * 100).toFixed(0)}%
          </text>
          <text x={px(xMin + f * xSpan)} y={H - 20} textAnchor="middle" fontSize="10" fill="#8aa6c8" fontFamily="monospace">
            {((xMin + f * xSpan) * 100).toFixed(0)}%
          </text>
        </g>
      ))}
      {points.map((p, i) => (
        <circle key={i} cx={px(p.x)} cy={py(p.y)} r={2.4} fill={p.color ?? col(p.c)} opacity={0.55} />
      ))}
      {highlights.map((h) => (
        <g key={h.label}>
          <circle cx={px(h.x)} cy={py(h.y)} r={7} fill="none" stroke={h.color} strokeWidth="2" />
          <circle cx={px(h.x)} cy={py(h.y)} r={3} fill={h.color} />
          <text x={px(h.x) + 11} y={py(h.y) - 8} fontSize="10.5" fill={h.color} fontFamily="monospace">
            {h.label}
          </text>
        </g>
      ))}
      {xLabel && <text x={(W + PAD.l) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#8aa6c8" fontFamily="monospace">{xLabel}</text>}
      {yLabel && <text x={12} y={H / 2} fontSize="10" fill="#8aa6c8" fontFamily="monospace" transform={`rotate(-90 12 ${H / 2})`}>{yLabel}</text>}
    </svg>
  );
}

/**
 * Heatmap. Square by default (correlation matrices); pass `columns` when the
 * rows and columns are different axes, e.g. factor × regime.
 */
export function Heatmap({ matrix, columns }: {
  matrix: Record<string, Record<string, number>>;
  columns?: string[];
}) {
  const rows = Object.keys(matrix);
  const keys = columns ?? rows;
  if (!rows.length || !keys.length) return null;
  const color = (v: number) => {
    if (v >= 0) return `rgba(0,245,160,${0.12 + v * 0.6})`;
    return `rgba(255,84,112,${0.12 + Math.abs(v) * 0.6})`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-center">
        <thead>
          <tr>
            <th />
            {keys.map((k) => (
              <th key={k} className="px-2 py-1.5 font-mono text-[10.5px] text-hazedim">{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <td className="px-2 py-1.5 text-left font-mono text-[10.5px] text-hazedim">{r}</td>
              {keys.map((c) => {
                const v = Number(matrix[r]?.[c] ?? 0);
                return (
                  <td key={c} className="px-1 py-1">
                    <div
                      className="rounded-md py-2 font-mono text-[11px] font-semibold text-white"
                      style={{ background: color(v) }}
                    >
                      {v.toFixed(2)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Horizontal weight bars — portfolio allocations. */
export function WeightBars({ tickers, weights, color = "#00f5a0" }: {
  tickers: string[]; weights: number[]; color?: string;
}) {
  const max = Math.max(...weights.map(Math.abs), 0.0001);
  return (
    <div className="space-y-2.5">
      {tickers.map((t, i) => (
        <div key={t} className="flex items-center gap-3">
          <span className="w-20 shrink-0 font-mono text-[12px] text-white">{t}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/8">
            <motion.div
              className="h-full rounded-full"
              style={{ background: color, boxShadow: `0 0 10px ${color}66` }}
              initial={{ width: 0 }}
              animate={{ width: `${(Math.abs(weights[i]) / max) * 100}%` }}
              transition={{ duration: 0.8, delay: i * 0.05 }}
            />
          </div>
          <span className="w-16 shrink-0 text-right font-mono text-[12px] font-bold" style={{ color }}>
            {(weights[i] * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export { downsample };
