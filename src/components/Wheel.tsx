import { useEffect, useMemo, useRef, useState } from "react";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { playWinnerFanfare } from "@/lib/sounds";


type Props = {
  entries: Entry[];
  onResult: (winner: Entry) => void;
  spinning: boolean;
  setSpinning: (v: boolean) => void;
  centerImage?: string;
  /** Spin animation duration in seconds (default 5). */
  spinDurationSec?: number;
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

// Idle drift: slow continuous rotation while not spinning (deg/sec).
const IDLE_DEG_PER_SEC = 8;

export function Wheel({ entries, onResult, spinning, setSpinning, centerImage, spinDurationSec = 5 }: Props) {
  const [rotation, setRotation] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const rotationRef = useRef(0);

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

  // Idle slow drift via requestAnimationFrame (only when not spinning).
  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  useEffect(() => {
    if (spinning || transitioning || slices.length === 0) return;
    lastTickRef.current = performance.now();
    const step = (now: number) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      rotationRef.current += IDLE_DEG_PER_SEC * dt;
      setRotation(rotationRef.current);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [spinning, transitioning, slices.length]);

  function spin() {
    if (spinning || transitioning || slices.length === 0) return;
    setSpinning(true);
    setTransitioning(true);
    const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
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
    const spins = 6 + Math.floor(Math.random() * 3);
    // Normalize current rotation, build a forward target.
    const current = rotationRef.current;
    const currentMod = ((current % 360) + 360) % 360;
    const desired = (360 - targetAngle) % 360;
    const delta = ((desired - currentMod) + 360) % 360;
    const jitter = (Math.random() - 0.5) * ((slice.endAngle - slice.startAngle) * 0.4);
    const newRotation = current + spins * 360 + delta + jitter;
    rotationRef.current = newRotation;
    setRotation(newRotation);

    setTimeout(() => {
      setSpinning(false);
      setTransitioning(false);
      playWinnerFanfare();
      onResult(entries[winnerIdx]);
    }, spinDurationSec * 1000 + 200);
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
  const hubRadius = 60;

  return (
    <div
      className="relative aspect-square w-full"
      style={{ width: "min(92vw, calc(100vh - 200px))", maxWidth: "100%" }}
    >
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
        viewBox="0 0 500 500"
        className="h-full w-full drop-shadow-2xl"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: transitioning
            ? `transform ${spinDurationSec}s cubic-bezier(0.17, 0.67, 0.21, 1)`
            : "none",
        }}
      >
        <circle cx={cx} cy={cy} r={radius + 6} fill="var(--card)" />
        {slices.map((s) => {
          const startRad = ((s.startAngle - 90) * Math.PI) / 180;
          const endRad = ((s.endAngle - 90) * Math.PI) / 180;
          const x1 = cx + radius * Math.cos(startRad);
          const y1 = cy + radius * Math.sin(startRad);
          const x2 = cx + radius * Math.cos(endRad);
          const y2 = cy + radius * Math.sin(endRad);
          const largeArc = s.endAngle - s.startAngle > 180 ? 1 : 0;
          const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

          const midAngle = (s.startAngle + s.endAngle) / 2;
          const midRad = ((midAngle - 90) * Math.PI) / 180;
          // Anchor the label near the outer rim and extend inward toward the
          // hub. This guarantees text never crosses the rim regardless of
          // length — long names just reach further in toward the center.
          const outerPadding = 16; // clearance from the wheel rim
          const innerPadding = hubRadius + 8; // clearance from the center hub
          const labelOuterR = radius - outerPadding;
          const lx = cx + labelOuterR * Math.cos(midRad);
          const ly = cy + labelOuterR * Math.sin(midRad);
          const sweep = s.endAngle - s.startAngle;
          // Auto-fit the full name (no truncation), like wheelofnames.com:
          // - Cap by tangential thickness so it fits across the slice height.
          // - Cap by available radial length so it fits along the slice.
          // Use thickness measured at the label's midpoint (pessimistic for
          // the inner end of long labels), so labels stay inside the slice.
          const radialSpace = Math.max(20, labelOuterR - innerPadding);
          const name = s.entry.name;
          // Approx character width for our bold font ~ 0.55 * fontSize.
          const maxByRadial = radialSpace / Math.max(1, name.length * 0.55);
          // Thickness at the inner end of the label (narrowest point the
          // text will occupy) — keeps long names from poking through edges.
          const innerThickness = 2 * innerPadding * Math.sin((sweep * Math.PI) / 360);
          // Tight cap by slice thickness — no artificial floor so dense
          // wheels (many entries) stay readable without label collisions.
          const maxByThickness = innerThickness * 0.82;
          // Hard ceiling first, comfortable floor second. If the floor would
          // overflow into the hub, we squeeze with textLength below instead
          // of letting the text clip.
          const idealSize = Math.min(40, maxByThickness, maxByRadial);
          const fontSize = Math.max(6, idealSize);
          // Estimated pixel width at the chosen fontSize.
          const estWidth = name.length * fontSize * 0.55;
          const needsSqueeze = estWidth > radialSpace;
          // Rotate label to lie along the radius. Anchor at the outer end
          // (textAnchor="end") so the text extends inward from the rim.
          const textRotation = midAngle - 90;

          return (
            <g key={s.entry.id}>
              <path d={path} fill={s.color} stroke="var(--card)" strokeWidth="2" />
              <text
                x={lx}
                y={ly}
                textAnchor="end"
                dominantBaseline="middle"
                fill="oklch(0.99 0 0)"
                stroke="oklch(0.2 0.05 320 / 0.6)"
                strokeWidth={Math.max(0.4, fontSize / 14)}
                paintOrder="stroke"
                fontWeight={800}
                fontSize={fontSize}
                transform={`rotate(${textRotation} ${lx} ${ly})`}
                {...(needsSqueeze
                  ? { textLength: radialSpace, lengthAdjust: "spacingAndGlyphs" as const }
                  : {})}
                style={{ pointerEvents: "none" }}
              >
                {name}
              </text>
            </g>
          );
        })}
        {/* Center hub with optional image */}
        <defs>
          <clipPath id="wheel-center-clip">
            <circle cx={cx} cy={cy} r={hubRadius - 4} />
          </clipPath>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={hubRadius}
          fill="var(--card)"
          stroke="var(--primary)"
          strokeWidth="4"
        />
        {centerImage && (
          <image
            href={centerImage}
            x={cx - (hubRadius - 4)}
            y={cy - (hubRadius - 4)}
            width={(hubRadius - 4) * 2}
            height={(hubRadius - 4) * 2}
            clipPath="url(#wheel-center-clip)"
            preserveAspectRatio="xMidYMid slice"
          />
        )}
      </svg>

      <button
        onClick={spin}
        disabled={spinning}
        className={cn(
          "absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full",
          "h-20 w-20 font-bold text-base shadow-lg",
          "transition-transform hover:scale-105 active:scale-95",
          "disabled:opacity-60 disabled:hover:scale-100",
          centerImage
            ? "bg-primary/0 text-primary-foreground/0 hover:bg-primary/20 hover:text-primary-foreground"
            : "bg-primary text-primary-foreground",
        )}
        aria-label="Spin the wheel"
        title="Spin"
      >
        {!centerImage && (spinning ? "..." : "SPIN")}
      </button>
    </div>
  );
}
