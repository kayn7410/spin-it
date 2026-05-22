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

function getCssColor(variableName: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

function clamp(min: number, value: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function Wheel({ entries, onResult, spinning, setSpinning, centerImage, spinDurationSec = 5 }: Props) {
  const [rotation, setRotation] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState(500);
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

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const resize = () => {
      const rect = el.getBoundingClientRect();
      setCanvasSize(Math.max(260, Math.floor(Math.min(rect.width, rect.height || rect.width))));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || slices.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    let centerImg: HTMLImageElement | null = null;

    const draw = () => {
      if (cancelled) return;
      const dpr = window.devicePixelRatio || 1;
      const cssSize = canvasSize;
      canvas.width = Math.round(cssSize * dpr);
      canvas.height = Math.round(cssSize * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssSize, cssSize);

      const cx = cssSize / 2;
      const cy = cssSize / 2;
      const radius = cssSize * 0.48;
      const borderWidth = Math.max(2, cssSize * 0.006);
      const lineWidth = Math.max(1.5, cssSize * 0.004);
      const hubRadius = cssSize * 0.12;
      const outerTextRadius = radius - Math.max(12, cssSize * 0.032);
      const innerTextRadius = hubRadius + Math.max(14, cssSize * 0.03);
      const labelInset = Math.max(3, cssSize * 0.008);
      const labelMaxWidth = Math.max(24, outerTextRadius - innerTextRadius - labelInset);
      const averageArcWidth = (2 * Math.PI * outerTextRadius) / Math.max(1, slices.length);
      const labelFontSize = clamp(9, averageArcWidth * 0.72, Math.min(30, cssSize * 0.058));

      ctx.beginPath();
      ctx.arc(cx, cy, radius + borderWidth * 2, 0, Math.PI * 2);
      ctx.fillStyle = getCssColor("--card", "#111827");
      ctx.fill();

      for (const s of slices) {
        const start = ((s.startAngle - 90) * Math.PI) / 180;
        const end = ((s.endAngle - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = s.color.startsWith("var(") ? getCssColor(s.color.slice(4, -1), "#7c3aed") : s.color;
        ctx.fill();
        ctx.strokeStyle = getCssColor("--card", "#111827");
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }

      ctx.font = `900 ${labelFontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, labelFontSize * 0.16);
      ctx.strokeStyle = getCssColor("--wheel-label-stroke", "#111827");
      ctx.fillStyle = getCssColor("--wheel-label", "#ffffff");

      for (const s of slices) {
        const text = (s.entry.name || "—").trim();
        if (!text) continue;
        const start = ((s.startAngle - 90) * Math.PI) / 180;
        const end = ((s.endAngle - 90) * Math.PI) / 180;
        const mid = ((s.startAngle + (s.endAngle - s.startAngle) / 2 - 90) * Math.PI) / 180;
        const sweep = Math.max(0.0001, end - start);
        const clipGap = Math.min(sweep * 0.18, Math.max(0.001, lineWidth / radius));
        const clipStart = start + clipGap;
        const clipEnd = end - clipGap;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius - lineWidth / 2, clipStart, clipEnd);
        ctx.arc(cx, cy, hubRadius + lineWidth * 2, clipEnd, clipStart, true);
        ctx.closePath();
        ctx.clip();
        ctx.translate(cx, cy);
        ctx.rotate(mid);
        ctx.translate(innerTextRadius + labelInset, 0);
        ctx.strokeText(text, 0, 0, labelMaxWidth);
        ctx.fillText(text, 0, 0, labelMaxWidth);
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, hubRadius, 0, Math.PI * 2);
      ctx.fillStyle = getCssColor("--card", "#111827");
      ctx.fill();
      ctx.strokeStyle = getCssColor("--primary", "#60a5fa");
      ctx.lineWidth = Math.max(4, cssSize * 0.008);
      ctx.stroke();

      if (centerImg?.complete && centerImg.naturalWidth > 0) {
        const r = hubRadius - Math.max(4, cssSize * 0.008);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        const scale = Math.max((r * 2) / centerImg.naturalWidth, (r * 2) / centerImg.naturalHeight);
        const w = centerImg.naturalWidth * scale;
        const h = centerImg.naturalHeight * scale;
        ctx.drawImage(centerImg, cx - w / 2, cy - h / 2, w, h);
        ctx.restore();
      }
    };

    if (centerImage) {
      centerImg = new Image();
      centerImg.onload = draw;
      centerImg.src = centerImage;
    }
    draw();

    return () => {
      cancelled = true;
    };
  }, [canvasSize, centerImage, slices]);

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

  return (
    <div
      ref={wrapRef}
      className="relative aspect-square shrink-0"
      style={{ width: "min(94vw, calc(100dvh - 128px), 920px)", maxWidth: "100%" }}
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
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full drop-shadow-2xl"
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "50% 50%",
          transition: transitioning
            ? `transform ${spinDurationSec}s cubic-bezier(0.17, 0.67, 0.21, 1)`
            : "none",
        }}
        aria-label="Giveaway wheel"
      />

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
