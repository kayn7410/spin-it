import { useEffect, useMemo, useRef, useState } from "react";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  entries: Entry[];
  onResult: (winner: Entry) => void;
  spinning: boolean;
  setSpinning: (v: boolean) => void;
};

const SLICE_COLORS = [
  "var(--wheel-1)",
  "var(--wheel-2)",
  "var(--wheel-3)",
  "var(--wheel-4)",
  "var(--wheel-5)",
  "var(--wheel-6)",
  "var(--wheel-7)",
  "var(--wheel-8)",
];

export function Wheel({ entries, onResult, spinning, setSpinning }: Props) {
  const [rotation, setRotation] = useState(0);
  const wheelRef = useRef<SVGSVGElement>(null);

  // Build weighted slices
  const slices = useMemo(() => {
    const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
    if (totalWeight === 0) return [];
    let acc = 0;
    return entries.map((e, i) => {
      const startAngle = (acc / totalWeight) * 360;
      acc += e.weight;
      const endAngle = (acc / totalWeight) * 360;
      return {
        entry: e,
        startAngle,
        endAngle,
        color: SLICE_COLORS[i % SLICE_COLORS.length],
      };
    });
  }, [entries]);

  function spin() {
    if (spinning || slices.length === 0) return;
    setSpinning(true);
    const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
    // Pick winner by weight
    let r = Math.random() * totalWeight;
    let winnerIdx = 0;
    for (let i = 0; i < entries.length; i++) {
      r -= entries[i].weight;
      if (r <= 0) {
        winnerIdx = i;
        break;
      }
    }
    const slice = slices[winnerIdx];
    const targetAngle = (slice.startAngle + slice.endAngle) / 2;
    // Pointer is at top (12 o'clock = -90deg in SVG terms but we draw starting at top).
    // We want target slice midpoint to land at 0deg from the pointer.
    const spins = 6 + Math.floor(Math.random() * 3);
    const finalRotation = spins * 360 + (360 - targetAngle);
    // Add jitter so it doesn't always land dead-center
    const jitter = (Math.random() - 0.5) * ((slice.endAngle - slice.startAngle) * 0.6);
    const newRotation = rotation + finalRotation + jitter;
    setRotation(newRotation);

    setTimeout(() => {
      setSpinning(false);
      onResult(entries[winnerIdx]);
    }, 5200);
  }

  if (slices.length === 0) {
    return (
      <div className="flex aspect-square w-full max-w-[520px] items-center justify-center rounded-full border-4 border-dashed border-border bg-card text-center text-muted-foreground">
        <div className="px-8">
          <p className="text-lg font-semibold">No entries yet</p>
          <p className="mt-2 text-sm">Add names below or have them sent from Discord.</p>
        </div>
      </div>
    );
  }

  const radius = 240;
  const cx = 250;
  const cy = 250;

  return (
    <div className="relative aspect-square w-full max-w-[520px]">
      {/* Pointer */}
      <div
        className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 -translate-y-2"
        style={{
          borderLeft: "18px solid transparent",
          borderRight: "18px solid transparent",
          borderTop: "32px solid var(--primary)",
          filter: "drop-shadow(0 4px 6px rgb(0 0 0 / 0.2))",
        }}
        aria-hidden
      />
      <svg
        ref={wheelRef}
        viewBox="0 0 500 500"
        className="h-full w-full drop-shadow-2xl"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning
            ? "transform 5s cubic-bezier(0.17, 0.67, 0.21, 1)"
            : "none",
        }}
      >
        <circle cx={cx} cy={cy} r={radius + 6} fill="var(--card)" />
        {slices.map((s, i) => {
          const startRad = ((s.startAngle - 90) * Math.PI) / 180;
          const endRad = ((s.endAngle - 90) * Math.PI) / 180;
          const x1 = cx + radius * Math.cos(startRad);
          const y1 = cy + radius * Math.sin(startRad);
          const x2 = cx + radius * Math.cos(endRad);
          const y2 = cy + radius * Math.sin(endRad);
          const largeArc = s.endAngle - s.startAngle > 180 ? 1 : 0;
          const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

          // Label position
          const midAngle = (s.startAngle + s.endAngle) / 2;
          const midRad = ((midAngle - 90) * Math.PI) / 180;
          const labelR = radius * 0.65;
          const lx = cx + labelR * Math.cos(midRad);
          const ly = cy + labelR * Math.sin(midRad);
          const sweep = s.endAngle - s.startAngle;
          const showLabel = sweep > 8;
          const fontSize = Math.max(10, Math.min(20, 240 / Math.max(entries.length, 6)));

          return (
            <g key={s.entry.id}>
              <path d={path} fill={s.color} stroke="var(--card)" strokeWidth="2" />
              {showLabel && (
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="oklch(0.15 0.04 260)"
                  fontWeight={700}
                  fontSize={fontSize}
                  transform={`rotate(${midAngle} ${lx} ${ly})`}
                  style={{ pointerEvents: "none" }}
                >
                  {truncate(s.entry.name, sweep < 18 ? 8 : 16)}
                </text>
              )}
            </g>
          );
        })}
        {/* Center hub */}
        <circle cx={cx} cy={cy} r="38" fill="var(--card)" stroke="var(--primary)" strokeWidth="4" />
      </svg>

      <button
        onClick={spin}
        disabled={spinning}
        className={cn(
          "absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full",
          "h-20 w-20 bg-primary text-primary-foreground font-bold text-base shadow-lg",
          "transition-transform hover:scale-105 active:scale-95",
          "disabled:opacity-60 disabled:hover:scale-100",
        )}
        aria-label="Spin the wheel"
      >
        {spinning ? "..." : "SPIN"}
      </button>
    </div>
  );
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
