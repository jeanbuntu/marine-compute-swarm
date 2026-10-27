export const MAX_DIVE_M = 15;
export const MIN_DIST_M = 2;
export const MAX_DIST_M = 40000;

type V3 = [number, number, number];

export const isUnderwater = (y: number) => y < 0;

/** Keeps the camera above the dive floor and within the allowed range of its target. */
export function clampCamera(pos: V3, target: V3 = [0, 0, 0]): V3 {
  const p: V3 = pos.map((v, i) => (Number.isFinite(v) ? v : i === 1 ? 5 : target[i] + (i === 0 ? 5 : 5))) as V3;
  p[1] = Math.max(-MAX_DIVE_M, p[1]);
  const d: V3 = [p[0] - target[0], p[1] - target[1], p[2] - target[2]];
  const len = Math.hypot(...d);
  if (len < MIN_DIST_M) {
    const k = len === 0 ? 0 : MIN_DIST_M / len;
    return len === 0 ? [target[0] + MIN_DIST_M, target[1], target[2]] : [target[0] + d[0] * k, target[1] + d[1] * k, target[2] + d[2] * k];
  }
  if (len > MAX_DIST_M) {
    const k = MAX_DIST_M / len;
    return [target[0] + d[0] * k, Math.max(-MAX_DIVE_M, target[1] + d[1] * k), target[2] + d[2] * k];
  }
  return p;
}
