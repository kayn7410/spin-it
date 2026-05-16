// Lightweight Web Audio sound effects — no external API, no assets.
// Synthesizes a ticking spin loop and a celebratory winner fanfare.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Play a single short "tick" click. */
export function playTick(volume = 0.18) {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.07);
}

/**
 * Play a decelerating tick loop over `durationSec`. Ticks start fast and
 * slow down following an ease-out curve, independent of slice count.
 * Returns a cancel function.
 */
export function playSpinTickLoop(durationSec: number): () => void {
  const ac = getCtx();
  if (!ac) return () => {};
  const startMs = performance.now();
  const totalMs = durationSec * 1000;
  // Tick interval grows from ~60ms to ~340ms over the spin.
  const minInterval = 60;
  const maxInterval = 340;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const schedule = () => {
    if (cancelled) return;
    const elapsed = performance.now() - startMs;
    const t = Math.min(1, elapsed / totalMs);
    // Ease-out: faster at start, slower near end.
    const eased = 1 - Math.pow(1 - t, 2);
    const interval = minInterval + (maxInterval - minInterval) * eased;
    const volume = 0.18 * (1 - t * 0.5);
    playTick(volume);
    if (t >= 1) return;
    timer = setTimeout(schedule, interval);
  };
  schedule();

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

/** Play a short celebratory fanfare for the winner. */
export function playWinnerFanfare() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  // C major arpeggio up to a high note.
  const notes = [
    { f: 523.25, t: 0.0, d: 0.18 }, // C5
    { f: 659.25, t: 0.12, d: 0.18 }, // E5
    { f: 783.99, t: 0.24, d: 0.18 }, // G5
    { f: 1046.5, t: 0.36, d: 0.45 }, // C6
  ];
  for (const n of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(n.f, now + n.t);
    gain.gain.setValueAtTime(0.0001, now + n.t);
    gain.gain.exponentialRampToValueAtTime(0.25, now + n.t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + n.t);
    osc.stop(now + n.t + n.d + 0.05);
  }
  // Sparkle: high shimmer
  const shimmer = ac.createOscillator();
  const sgain = ac.createGain();
  shimmer.type = "sine";
  shimmer.frequency.setValueAtTime(1568, now + 0.36); // G6
  shimmer.frequency.linearRampToValueAtTime(2093, now + 0.9); // C7
  sgain.gain.setValueAtTime(0.0001, now + 0.36);
  sgain.gain.exponentialRampToValueAtTime(0.12, now + 0.42);
  sgain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
  shimmer.connect(sgain).connect(ac.destination);
  shimmer.start(now + 0.36);
  shimmer.stop(now + 1.05);
}
