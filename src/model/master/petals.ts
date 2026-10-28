import { G } from '../constants';
import { MAX_HEEL_DEG, PETAL_TILT_DEG } from '../hydrostatics';
import type { NodeDesign } from '../parts';
import { PETAL_DIRS, PETAL_IDS, bestTiltDeg, type Attitude, type Irradiance, type PetalId, type V3 } from './solar';

import { PETAL_PAIRS, petalGeometry, PANEL_MAX_TILT_DEG } from '../hardware';
import { petalIrradiance } from './solar';

const RAD = Math.PI / 180;
export type Strategy = 'fixed' | 'flat' | 'track';
export interface ActuatorSettings { rateDegS: number; mechMinDeg: number; mechMaxDeg: number; latencyS: number; imuNoiseDeg: number; powerW: number }
export const defaultActuator = (): ActuatorSettings => ({ rateDegS: 6, mechMinDeg: -30, mechMaxDeg: 75, latencyS: 0.3, imuNoiseDeg: 0.4, powerW: 6 });

export const STOW_WIND_MS = 12; // matches the hydrostatic deployed-wind threshold
export type Tilts = Record<PetalId, number>;
export const uniformTilts = (deg: number): Tilts => Object.fromEntries(PETAL_IDS.map(id => [id, deg])) as Tilts;

/** Lowest allowed tilt: the tip must stay clear of the crest relative to the hull. */
export function tiltLimits(d: NodeDesign, freeboardM: number, hsM: number, a: ActuatorSettings): { minDeg: number; maxDeg: number } {
  const clearance = 0.1 + 0.25 * hsM;
  const lowest = -Math.asin(Math.min(1, Math.max(0, (freeboardM - clearance) / d.petalLengthM))) / RAD;
  return { minDeg: Math.max(-PANEL_MAX_TILT_DEG, a.mechMinDeg, lowest), maxDeg: Math.min(PANEL_MAX_TILT_DEG, a.mechMaxDeg) };
}

/** Petal tilts shift mass sideways, which heels the hull; returns the static heel and the effective GM. */
export function staticHeel(d: NodeDesign, tilts: Tilts, gmM: number): { roll: number; pitch: number; gmEff: number } {
  const petals = d.parts.filter((p) => p.id.startsWith('petal-'));
  const M = d.parts.reduce((s, p) => s + p.massKg, 0);
  let sx = 0, sz = 0, dKg = 0;
  for (const p of petals) {
    const id = p.id.slice(6) as PetalId, dir = PETAL_DIRS[id], t = tilts[id] * RAD;
    const reach = d.hullSideM / 2 + petalGeometry(d).centroid * Math.cos(t);
    sx += p.massKg * reach * dir[0]; sz += p.massKg * reach * dir[2];
    dKg += p.massKg * petalGeometry(d).centroid * (Math.sin(t) - Math.sin(PETAL_TILT_DEG * RAD));
  }
  const gmEff = Math.max(0.05, gmM - dKg / M);
  return { roll: -Math.atan(sx / M / gmEff), pitch: Math.atan(sz / M / gmEff), gmEff };
}

/** Scales petal deviations from their mean until the static heel is inside the limit. */
export function limitHeel(d: NodeDesign, tilts: Tilts, gmM: number): Tilts {
  const heel = (t: Tilts) => { const h = staticHeel(d, t, gmM); return Math.hypot(h.roll, h.pitch) / RAD; };
  if (heel(tilts) <= MAX_HEEL_DEG * 0.8) return tilts;
  const mean = PETAL_IDS.reduce((s, id) => s + tilts[id], 0) / PETAL_IDS.length;
  const scaled = (k: number): Tilts => Object.fromEntries(PETAL_IDS.map((id) => [id, mean + (tilts[id] - mean) * k])) as Tilts;
  let lo = 0, hi = 1;
  for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; if (heel(scaled(mid)) <= MAX_HEEL_DEG * 0.8) lo = mid; else hi = mid; }
  return scaled(lo);
}

export interface TargetCtx { att: Attitude; sun: V3; irr: Irradiance; minDeg: number; maxDeg: number; winterStow: boolean }
export function petalTargets(strategy: Strategy, c: TargetCtx, linked = true): Tilts {
  if (c.winterStow || c.irr.ghiWm2 <= 1) return uniformTilts(0);
  if (strategy === 'fixed') return uniformTilts(PETAL_TILT_DEG);
  if (strategy === 'flat') return uniformTilts(0);
  if (!linked) return Object.fromEntries(PETAL_IDS.map((id) => [id, bestTiltDeg(c.att, PETAL_DIRS[id], c.sun, c.irr, c.minDeg, c.maxDeg)])) as Tilts;
  const out = uniformTilts(0);
  for (const pair of PETAL_PAIRS) {
    let best = c.minDeg, power = -Infinity;
    for (let t = c.minDeg; t <= c.maxDeg; t += 0.5) {
      const e = pair.reduce((sum, id) => sum + petalIrradiance(c.att, PETAL_DIRS[id], t, c.sun, c.irr), 0);
      if (e > power) { power = e; best = t; }
    }
    for (const id of pair) out[id] = best;
  }
  return out;
}

/** Rate-limited move toward the target; returns new angles and degrees moved (for actuator energy). */
export function actuate(cur: Tilts, target: Tilts, dtS: number, rateDegS: number, minDeg: number, maxDeg: number): { tilts: Tilts; movedDeg: number } {
  const out = { ...cur }; let moved = 0;
  for (const id of PETAL_IDS) {
    const want = Math.max(minDeg, Math.min(maxDeg, target[id]));
    const step = Math.max(-rateDegS * dtS, Math.min(rateDegS * dtS, want - cur[id]));
    out[id] = cur[id] + step; moved += Math.abs(step) / 2; // two linked facets per drive
  }
  return { tilts: out, movedDeg: moved };
}

/** Gravity-only electrical demand at commanded speed. 55% geared-drive efficiency (EST),
 * plus motor/controller overhead. No counterbalance or regenerative-energy credit. */
export function actuatorDemandW(d: NodeDesign, current: Tilts, target: Tilts, rateDegS: number, overheadW: number): number {
  const arm = petalGeometry(d).centroid;
  return PETAL_PAIRS.reduce((sum, pair) => {
    const error = Math.max(...pair.map(id => Math.abs(target[id] - current[id])));
    if (error <= 0.05) return sum;
    const torque = pair.reduce((t, id) => t + (d.parts.find(p => p.id === `petal-${id}`)?.massKg ?? 0) * G * arm * Math.abs(Math.cos(current[id] * RAD)), 0);
    return sum + overheadW + torque * Math.min(rateDegS, error / 0.1) * RAD / 0.55;
  }, 0);
}
