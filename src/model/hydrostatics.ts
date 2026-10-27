import { NOMINAL_DECK_Y } from './nodeDesign';
import { G, RHO_AIR, RHO_SEA } from './constants';
import type { NodeDesign, Part } from './parts';

export type PetalState = 'deployed' | 'stowed';
export type Violation = 'sinks' | 'reserve' | 'stability' | 'heel' | 'freeboard';

export interface HydroResult {
  massKg: number;
  draftM: number;
  freeboardM: number;
  reservePct: number;
  gmM: number;
  heelDeg: number;
  ok: boolean;
  violations: Violation[];
}

// Acceptance thresholds (see design doc section 5).
export const PETAL_TILT_DEG = 20;
export const MIN_RESERVE = 0.5;
export const MIN_GM_M = 0.15;
export const MAX_HEEL_DEG = 10;

const KEEL_WIDTH_RATIO = 0.6;
const PETAL_TILT_RAD = (PETAL_TILT_DEG * Math.PI) / 180; // deployed petals tilt toward the sun
const WIND_STOWED_MS = 25; // gale, petals stowed
const WIND_DEPLOYED_MS = 12; // stow threshold, petals deployed
const CD_WIND = 1.2;

const isPetal = (p: Part) => p.id.startsWith('petal-');

/** Part position for the given petal state; deployed petals swing out and tilt up. */
export function partPosition(d: NodeDesign, p: Part, state: PetalState): [number, number, number] {
  if (!isPetal(p)) return p.pos;
  if (state === 'stowed') {
    const layer = d.parts.filter(isPetal).findIndex(part => part.id === p.id);
    return [p.pos[0], p.pos[1] + d.keelDepthM + d.hullDepthM - NOMINAL_DECK_Y + layer * 0.055, p.pos[2]];
  }
  const [x, y, z] = p.pos;
  const r = Math.hypot(x, z) || 1;
  const reach = d.hullSideM / 2 + (d.petalLengthM / 2) * Math.cos(PETAL_TILT_RAD);
  return [(x / r) * reach, d.keelDepthM + d.hullDepthM + y - NOMINAL_DECK_Y + (d.petalLengthM / 2) * Math.sin(PETAL_TILT_RAD), (z / r) * reach];
}

function failed(d: NodeDesign): HydroResult {
  return { massKg: 0, draftM: 0, freeboardM: 0, reservePct: 0, gmM: 0, heelDeg: 90, ok: false, violations: ['sinks'] };
}

export function evaluate(d: NodeDesign, petals: PetalState, windMs?: number): HydroResult {
  const masses = d.parts.map((p) => p.massKg);
  if (masses.some((m) => !Number.isFinite(m) || m < 0)) return failed(d);
  const m = masses.reduce((a, b) => a + b, 0);
  if (m <= 0) return failed(d);

  const side = d.hullSideM;
  const kw = side * KEEL_WIDTH_RATIO;
  const keelV = kw * kw * d.keelDepthM;
  const height = d.keelDepthM + d.hullDepthM;
  const volume = m / RHO_SEA;

  // Draft from displaced volume: keel pod first, then the full hull box.
  let draft: number;
  if (volume <= keelV) draft = volume / (kw * kw);
  else draft = d.keelDepthM + (volume - keelV) / (side * side);

  // Submerged volume centroid (KB) and waterplane inertia.
  const keelSubD = Math.min(draft, d.keelDepthM);
  const keelSubV = kw * kw * keelSubD;
  const hullSubD = Math.max(0, draft - d.keelDepthM);
  const hullSubV = side * side * hullSubD;
  const kb = (keelSubV * (keelSubD / 2) + hullSubV * (d.keelDepthM + hullSubD / 2)) / (keelSubV + hullSubV);
  const wp = draft > d.keelDepthM ? side : kw;
  const bm = wp ** 4 / 12 / volume;

  // Center of gravity for the chosen petal state.
  const kg = d.parts.reduce((s, p) => s + p.massKg * partPosition(d, p, petals)[1], 0) / m;
  const gm = kb + bm - kg;

  const watertightV = keelV + side * side * d.hullDepthM;
  const reserve = (RHO_SEA * watertightV - m) / m;
  const freeboard = height - draft;

  // Steady wind heel: heeling moment over the righting moment of the metacentric stiffness.
  const v = windMs ?? (petals === 'deployed' ? WIND_DEPLOYED_MS : WIND_STOWED_MS);
  const mastArea = d.parts
    .filter((p) => !isPetal(p) && p.pos[1] > height)
    .reduce((s, p) => s + p.size[0] * Math.max(0, p.size[1]), 0);
  const petalArea = petals === 'deployed' ? d.petalCount * d.petalLengthM * side * Math.sin(PETAL_TILT_RAD) : 0;
  const area = Math.max(0, freeboard) * side + mastArea + petalArea;
  const force = 0.5 * RHO_AIR * CD_WIND * area * v * v;
  const arm = Math.max(0, freeboard) / 2 + draft / 2;
  let heel = 90;
  if (gm > 0) heel = (Math.asin(Math.min(1, (force * arm) / (m * G * gm))) * 180) / Math.PI;

  const violations: Violation[] = [];
  if (draft >= height) violations.push('sinks');
  if (freeboard <= 0) violations.push('freeboard');
  if (reserve < MIN_RESERVE) violations.push('reserve');
  if (gm < MIN_GM_M) violations.push('stability');
  if (heel > MAX_HEEL_DEG) violations.push('heel');

  const num = (x: number) => (Number.isFinite(x) ? x : 0);
  return {
    massKg: m, draftM: num(draft), freeboardM: num(freeboard), reservePct: num(reserve),
    gmM: num(gm), heelDeg: num(heel), ok: violations.length === 0, violations,
  };
}

/** The worse of deployed and stowed governs acceptance. */
export function evaluateWorst(d: NodeDesign, windMs?: number): HydroResult {
  const a = evaluate(d, 'deployed', windMs);
  const b = evaluate(d, 'stowed', windMs);
  const violations = [...new Set([...a.violations, ...b.violations])];
  return {
    massKg: a.massKg,
    draftM: Math.max(a.draftM, b.draftM),
    freeboardM: Math.min(a.freeboardM, b.freeboardM),
    reservePct: Math.min(a.reservePct, b.reservePct),
    gmM: Math.min(a.gmM, b.gmM),
    heelDeg: Math.max(a.heelDeg, b.heelDeg),
    ok: violations.length === 0,
    violations,
  };
}
