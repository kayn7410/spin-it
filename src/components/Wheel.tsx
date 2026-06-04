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
  /** When true, wheel freezes on the current rotation (used while winner dialog is open). */
  locked?: boolean;
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

const IDLE_DEG_PER_SEC = 8;
const FONT_STACK = `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
const MAX_LABEL_LENGTH = 18;

function getCssColor(variableName: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

function shortenWheelText(text: string) {
  return text.length > MAX_LABEL_LENGTH ? `${text.slice(0, MAX_LABEL_LENGTH - 1)}…` : text;
}

function boxFits(halfAngle: number, outerRadius: number, innerRadius: number, width: number, height: number) {
  const sin = Math.sin(halfAngle);
  if (sin <= 0.0001) return false;
  const safeOuterX = Math.sqrt(Math.max(0, outerRadius ** 2 - (height / 2) ** 2));
  const safeInnerX = Math.max((height * Math.cos(halfAngle)) / (2 * sin), innerRadius);
  return safeOuterX - safeInnerX >= width;
}

function textFits(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  outerRadius: number,
  innerRadius: number,
  sliceRadians: number,
) {
  if (!text) return true;
  ctx.font = `900 ${fontSize}px ${FONT_STACK}`;
  const width = ctx.measureText(` ${shortenWheelText(text)} `).width;
  return boxFits(sliceRadians / 2, outerRadius, innerRadius, width, fontSize + Math.max(4, fontSize * 0.18));
}

function getOptimalFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  outerRadius: number,
  innerRadius: number,
  sliceRadians: number,
) {
  let min = 3;
  let max = 200;
  let fontSize = 10;
  while (Math.abs(max - min) >= 2) {
    fontSize = Math.round((min + max) / 2);
    if (textFits(ctx, text, fontSize, outerRadius, innerRadius, sliceRadians)) min = fontSize;
    else max = fontSize;
  }
  return fontSize;
}

function getStops(sizes: number[]) {
  const sorted = [...sizes].sort((a, b) => a - b);
  if (sorted.length === 0) return [10];
  const stops = [sorted[0]];
  let base = sorted[0];
  for (const size of sorted.slice(1)) {
    if (size > base * 2) {
      stops.push(size);
      base = size;
    }
  }
  return stops;
}

function fontSizeForSlice(
  ctx: CanvasRenderingContext2D,
  text: string,
  allTexts: string[],
  outerRadius: number,
  innerRadius: number,
  sliceRadians: number,
) {
  const sizes = allTexts.map((t) => getOptimalFontSize(ctx, t, outerRadius, innerRadius, sliceRadians));
  const stops = getStops(sizes);
  const optimal = getOptimalFontSize(ctx, text, outerRadius, innerRadius, sliceRadians);
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i] <= optimal) return stops[i];
  }
  return stops[0];
}

type Mode = "idle" | "spinning" | "locked";

export function Wheel({
  entries,
  onResult,
  spinning,
  setSpinning,
  centerImage,
  spinDurationSec = 5,
  locked = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState(500);
  const rotationRef = useRef(0);
  const modeRef = useRef<Mode>("idle");
  const spinStateRef = useRef<{
    start: number;
    from: number;
    to: number;
    duration: number;
    winnerIdx: number;
  } | null>(null);
  const centerImgRef = useRef<HTMLImageElement | null>(null);

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

  // Sync external locked/spinning into mode.
  useEffect(() => {
    if (spinning) return;
    modeRef.current = locked ? "locked" : "idle";
  }, [locked, spinning]);

  // Track canvas size.
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

  // Load center image.
  useEffect(() => {
    if (!centerImage) {
      centerImgRef.current = null;
      return;
    }
    const img = new Image();
    img.src = centerImage;
    img.onload = () => {
      centerImgRef.current = img;
    };
  }, [centerImage]);

  // Main render + animation loop (rotation is applied via canvas transforms — no blurry CSS rotate).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || slices.length === 0) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Configure backing buffer once per size change (crisp rendering).
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const cssSize = canvasSize;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;

    const cx = cssSize / 2;
    const cy = cssSize / 2;
    const radius = cssSize * 0.48;
    const borderWidth = Math.max(2, cssSize * 0.006);
    const lineWidth = Math.max(1.5, cssSize * 0.004);
    const hubRadius = cssSize * 0.12;
    const labelOuterRadius = radius - Math.max(8, cssSize * 0.018);
    const labelInnerRadius = hubRadius + Math.max(10, cssSize * 0.022);

    const allTexts = slices.map((s) => (s.entry.name || "—").trim());
    const fontSizeCache = new Map<string, number>();
    // Precompute font sizes (need a transform-aware ctx for measureText — use base dpr setup).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const getFontSize = (text: string, sweep: number) => {
      const key = `${text}\u0000${sweep.toFixed(6)}`;
      const cached = fontSizeCache.get(key);
      if (cached) return cached;
      const size = Math.min(
        fontSizeForSlice(ctx, text, allTexts, labelOuterRadius, labelInnerRadius, sweep),
        Math.min(34, cssSize * 0.062),
      );
      fontSizeCache.set(key, size);
      return size;
    };

    const cardColor = getCssColor("--card", "#111827");
    const primaryColor = getCssColor("--primary", "#60a5fa");
    const labelColor = getCssColor("--wheel-label", "#ffffff");
    const labelStrokeColor = getCssColor("--wheel-label-stroke", "#111827");
    const resolvedSliceColors = slices.map((s) =>
      s.color.startsWith("var(") ? getCssColor(s.color.slice(4, -1), "#7c3aed") : s.color,
    );

    const draw = (rotationDeg: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, cssSize, cssSize);

      // Rotate the wheel (NOT the canvas element) — keeps text crisp.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.translate(-cx, -cy);

      ctx.beginPath();
      ctx.arc(cx, cy, radius + borderWidth * 2, 0, Math.PI * 2);
      ctx.fillStyle = cardColor;
      ctx.fill();

      for (let i = 0; i < slices.length; i++) {
        const s = slices[i];
        const start = ((s.startAngle - 90) * Math.PI) / 180;
        const end = ((s.endAngle - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = resolvedSliceColors[i];
        ctx.fill();
        ctx.strokeStyle = cardColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }

      ctx.textBaseline = "middle";
      ctx.textAlign = "end";
      ctx.lineJoin = "round";
      ctx.strokeStyle = labelStrokeColor;
      ctx.fillStyle = labelColor;

      for (const s of slices) {
        const text = (s.entry.name || "—").trim();
        if (!text) continue;
        const start = ((s.startAngle - 90) * Math.PI) / 180;
        const end = ((s.endAngle - 90) * Math.PI) / 180;
        const mid = ((s.startAngle + (s.endAngle - s.startAngle) / 2 - 90) * Math.PI) / 180;
        const sweep = Math.max(0.0001, end - start);
        const displayText = ` ${shortenWheelText(text)} `;
        const fontSize = getFontSize(text, sweep);
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
        ctx.font = `900 ${fontSize}px ${FONT_STACK}`;
        ctx.lineWidth = Math.max(2, fontSize * 0.18);
        ctx.strokeText(displayText, labelOuterRadius, 0);
        ctx.fillText(displayText, labelOuterRadius, 0);
        ctx.restore();
      }

      ctx.restore();

      // Hub + center image are NOT rotated — they stay still in the middle.
      ctx.beginPath();
      ctx.arc(cx, cy, hubRadius, 0, Math.PI * 2);
      ctx.fillStyle = cardColor;
      ctx.fill();
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = Math.max(4, cssSize * 0.008);
      ctx.stroke();

      const centerImg = centerImgRef.current;
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

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (modeRef.current === "idle") {
        rotationRef.current += IDLE_DEG_PER_SEC * dt;
      } else if (modeRef.current === "spinning" && spinStateRef.current) {
        const s = spinStateRef.current;
        const t = Math.min(1, (now - s.start) / s.duration);
        const eased = 1 - Math.pow(1 - t, 4); // ease-out
        rotationRef.current = s.from + (s.to - s.from) * eased;
        if (t >= 1) {
          const finishedIdx = s.winnerIdx;
          spinStateRef.current = null;
          modeRef.current = "locked";
          setSpinning(false);
          playWinnerFanfare();
          onResult(entries[finishedIdx]);
        }
      }
      draw(rotationRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // entries/onResult/setSpinning intentionally referenced via closure — re-bind only when wheel geometry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize, slices]);

  function spin() {
    if (spinning || modeRef.current === "spinning" || slices.length === 0) return;
    if (locked) return;
    setSpinning(true);
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
    const current = rotationRef.current;
    const currentMod = ((current % 360) + 360) % 360;
    const desired = (360 - targetAngle) % 360;
    const delta = ((desired - currentMod) + 360) % 360;
    const jitter = (Math.random() - 0.5) * ((slice.endAngle - slice.startAngle) * 0.4);
    const target = current + spins * 360 + delta + jitter;
    spinStateRef.current = {
      start: performance.now(),
      from: current,
      to: target,
      duration: spinDurationSec * 1000,
      winnerIdx,
    };
    modeRef.current = "spinning";
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
        className="absolute inset-0 block drop-shadow-2xl"
        style={{ margin: "auto" }}
        aria-label="Giveaway wheel"
      />

      <button
        onClick={spin}
        disabled={spinning || locked}
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
