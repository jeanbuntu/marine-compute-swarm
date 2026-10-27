import { mulberry32 } from './rng';
import { wrapM, type Sky } from './sky';

export const FOOTPRINT_M = 5000; // horizontal reach of the wide-angle sky camera at cloud height

export interface SkyFrame { t: number; nodeId: string; x: number; y: number; widthPx: number; heightPx: number }
export interface TrackedCloud {
  id: number;
  bbox: [number, number, number, number]; // pixels: x0, y0, x1, y1
  centroidM: [number, number]; // world meters
  radiusM: number;
  velocityMs: [number, number];
  opacity: number;
  confidence: number;
}
export interface CloudTracker { track(frame: SkyFrame): TrackedCloud[] }

/**
 * Stand-in for SAM 3.1: reads the simulated sky's true clouds and degrades them
 * with position noise and random dropouts, so downstream code sees realistic output.
 */
export function simulatedTracker(sky: Sky, opts: { noiseM: number; dropRate: number; seed: number }): CloudTracker {
  let memo: { t: number; now: ReturnType<Sky['clouds']>; next: ReturnType<Sky['clouds']> } | null = null;
  return {
    track(f) {
      if (!memo || memo.t !== f.t) memo = { t: f.t, now: sky.clouds(f.t), next: sky.clouds(f.t + 1) };
      const { now, next } = memo;
      const out: TrackedCloud[] = [];
      for (const [i, c] of now.entries()) {
        const dx = wrapM(c.x - f.x), dy = wrapM(c.y - f.y);
        if (Math.hypot(dx, dy) >= FOOTPRINT_M + c.radiusM) continue;
        const rnd = mulberry32((opts.seed * 2654435761) ^ (c.id * 40503) ^ Math.floor(f.t));
        if (rnd() < opts.dropRate) continue;
        const jx = (rnd() - 0.5) * 2 * opts.noiseM, jy = (rnd() - 0.5) * 2 * opts.noiseM;
        const toPx = (m: number, size: number) => size / 2 + (m / FOOTPRINT_M) * (size / 2);
        const cx = dx + jx, cy = dy + jy, r = c.radiusM;
        out.push({
          id: c.id,
          bbox: [toPx(cx - r, f.widthPx), toPx(-(cy + r), f.heightPx), toPx(cx + r, f.widthPx), toPx(-(cy - r), f.heightPx)],
          centroidM: [f.x + cx, f.y + cy],
          radiusM: r,
          velocityMs: [wrapM(next[i].x - c.x), wrapM(next[i].y - c.y)],
          opacity: c.opacity,
          confidence: Math.max(0.3, 1 - opts.noiseM / 500),
        });
      }
      return out;
    },
  };
}

/** Seam for SAM 3.1: replace the body with real segmentation and tracking. */
export function samTrackerPlaceholder(): CloudTracker {
  return {
    track() {
      throw new Error('SAM 3.1 not connected');
    },
  };
}
