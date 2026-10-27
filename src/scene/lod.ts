export const DETAIL_DIST_M = 90; // draw the full 3D model inside this range
const HYSTERESIS = 1.15; // stay on until 15% beyond the range so the model does not flicker

/** Far models are removed from the scene, not just hidden, so they cannot catch pointer events. */
export function showDetail(distM: number, exploded: boolean, wasShown: boolean): boolean {
  if (exploded) return true;
  return distM < DETAIL_DIST_M * (wasShown ? HYSTERESIS : 1);
}
