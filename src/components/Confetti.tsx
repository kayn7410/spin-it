import { useEffect } from "react";

type Props = {
  show: boolean;
};

const COLORS = [
  "var(--wheel-1)",
  "var(--wheel-2)",
  "var(--wheel-3)",
  "var(--wheel-4)",
  "var(--wheel-5)",
  "var(--wheel-6)",
  "var(--wheel-7)",
  "var(--wheel-8)",
];

export function Confetti({ show }: Props) {
  if (!show) return null;
  const pieces = Array.from({ length: 80 });
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100]">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.6;
        const duration = 2 + Math.random() * 2;
        const color = COLORS[i % COLORS.length];
        const rotate = Math.random() * 360;
        return (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              backgroundColor: color,
              animationDuration: `${duration}s`,
              animationDelay: `${delay}s`,
              transform: `rotate(${rotate}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}
