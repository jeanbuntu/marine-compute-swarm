import { hullSection } from '../hardware';
import { G, RHO_SEA } from '../constants';
import { evaluate, MAX_HEEL_DEG } from '../hydrostatics';
import type { NodeDesign } from '../parts';
import type { Sea } from './waves';

/** Rigid-body response of the hull riding the shared sea: heave, roll and pitch as damped oscillators (all EST). */
export interface HullProps {
  massKg: number; draftM: number; freeboardM: number; gmM: number;
  heaveOmega: number; rollOmega: number; pitchOmega: number; halfBeamM: number; irollKgM2: number;
}
export interface HullState {
  heave: number; heaveRate: number; roll: number; rollRate: number; pitch: number; pitchRate: number; yaw: number; yawRate: number;
}
export const initialHull = (yaw = 0): HullState => ({ heave: 0, heaveRate: 0, roll: 0, rollRate: 0, pitch: 0, pitchRate: 0, yaw, yawRate: 0 });

const ADDED_MASS_HEAVE = 0.8, ADDED_INERTIA = 0.5;
const ZETA_HEAVE = 0.25, ZETA_ROLL = 0.2;
export const MAX_TILT_RAD = (MAX_HEEL_DEG * Math.PI) / 180 * 4;

export function hullProps(d: NodeDesign): HullProps {
  const h = evaluate(d, 'deployed');
  const side = d.hullSideM, keelW = side * 0.6;
  const waterplane = hullSection(h.draftM < d.keelDepthM ? keelW : side).area;
  const height = d.keelDepthM + d.hullDepthM;
  const inertia = (h.massKg * (side * side + height * height)) / 12 * (1 + ADDED_INERTIA);
  const gm = Math.max(0.05, h.gmM);
  return {
    massKg: h.massKg, draftM: h.draftM, freeboardM: h.freeboardM, gmM: gm, halfBeamM: side / 2, irollKgM2: inertia,
    heaveOmega: Math.sqrt((RHO_SEA * G * waterplane) / (h.massKg * (1 + ADDED_MASS_HEAVE))),
    rollOmega: Math.sqrt((h.massKg * G * gm) / inertia), pitchOmega: Math.sqrt((h.massKg * G * gm) / inertia),
  };
}

export interface HullForcing {
  /** Static heel from off-centre petals and wind, radians: [roll, pitch]. */
  biasRoll: number; biasPitch: number;
  /** World-frame wind heel as an equivalent surface slope [x, z]. */
  windSlope: [number, number];
}

/**
 * Samples the sea at the hull footprint (so short waves are naturally filtered by the hull's width),
 * then advances the heave/roll/pitch oscillators toward the quasi-static equilibrium of that surface.
 */
export function stepHull(s: HullState, p: HullProps, sea: Sea, x: number, z: number, t: number, f: HullForcing, dt: number): HullState {
  const hb = p.halfBeamM, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  // body axes in the world plane (see Ry): body +x -> (c, -sn), body +z -> (sn, c)
  const at = (bx: number, bz: number) => sea.elevation(x + bx * c + bz * sn, z - bx * sn + bz * c, t);
  const ex = (at(hb, 0) - at(-hb, 0)) / (2 * hb), ez = (at(0, hb) - at(0, -hb)) / (2 * hb);
  const eta = (at(0, 0) + at(hb, 0) + at(-hb, 0) + at(0, hb) + at(0, -hb)) / 5;
  const wx = f.windSlope[0] * c - f.windSlope[1] * sn, wz = f.windSlope[0] * sn + f.windSlope[1] * c; // world -> body
  const rollEq = clamp(ex + wx + f.biasRoll), pitchEq = clamp(-(ez + wz) + f.biasPitch);
  let { heave, heaveRate, roll, rollRate, pitch, pitchRate } = s;
  const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
  for (let i = 0; i < n; i++) {
    heaveRate += (p.heaveOmega ** 2 * (eta - heave) - 2 * ZETA_HEAVE * p.heaveOmega * heaveRate) * h;
    rollRate += (p.rollOmega ** 2 * (rollEq - roll) - 2 * ZETA_ROLL * p.rollOmega * rollRate) * h;
    pitchRate += (p.pitchOmega ** 2 * (pitchEq - pitch) - 2 * ZETA_ROLL * p.pitchOmega * pitchRate) * h;
    heave += heaveRate * h; roll += rollRate * h; pitch += pitchRate * h;
  }
  return { ...s, heave, heaveRate, roll, rollRate, pitch, pitchRate };
}
const clamp = (v: number) => Math.max(-MAX_TILT_RAD, Math.min(MAX_TILT_RAD, v));
