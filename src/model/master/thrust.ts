import { petalGeometry } from '../hardware';
import { G, RHO_AIR, RHO_SEA } from '../constants';
import { CD, FRONTAL_M2, PROP_EFF } from '../swarm';
import type { NodeDesign } from '../parts';

/**
 * Station keeping with the four fixed corner thrusters. Planar axes: x east, z south, yaw about +y
 * (positive yaw turns +z toward +x). All hardware numbers are EST.
 */
export type Layout = 'radial' | 'tangential';
export interface Thruster { id: string; x: number; z: number; ax: number; az: number }

export const DUCT_AREA_M2 = Math.PI * 0.065 * 0.065; // from the rendered 65 mm shroud radius
export const THRUSTER_RATED_W = 300;
const CD_WIND = 1.2;

/** Bollard thrust (N) for a given shaft power, from actuator-disc theory. */
export const bollardThrustN = (powerW: number) => (PROP_EFF * powerW) ** (2 / 3) * (2 * RHO_SEA * DUCT_AREA_M2) ** (1 / 3);
export const MAX_THRUST_N = bollardThrustN(THRUSTER_RATED_W);

/** Shaft power (W) to make thrust T (N) with water arriving at vIn (m/s) along the axis. */
export function thrusterPowerW(thrustN: number, vInMs: number): number {
  const T = Math.abs(thrustN);
  if (T < 1e-9) return 0;
  const half = vInMs / 2;
  return (T * (half + Math.sqrt(half * half + T / (2 * RHO_SEA * DUCT_AREA_M2)))) / PROP_EFF;
}
/** Slipstream speed (m/s) of the jet leaving a thruster making thrust T. */
export const jetSpeedMs = (thrustN: number) => Math.sqrt(Math.abs(thrustN) / (2 * RHO_SEA * DUCT_AREA_M2));

/** The as-built layout points each thruster along its corner diagonal; tangential is the yaw-capable alternative. */
export function thrustersFromDesign(d: NodeDesign, layout: Layout): Thruster[] {
  return d.parts.filter((p) => p.id.startsWith('thruster-')).map((p) => {
    const r = Math.hypot(p.pos[0], p.pos[2]) || 1, rx = p.pos[0] / r, rz = p.pos[2] / r;
    return { id: p.id, x: p.pos[0], z: p.pos[2], ax: layout === 'radial' ? rx : -rz, az: layout === 'radial' ? rz : rx };
  });
}

const YAW_ARM_M = 0.6; // normalises the torque row so it is comparable with force
function solve3(a: number[][], b: number[]): number[] {
  const m = a.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = m[r][c] / m[c][c]; for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]; }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

export interface Allocation { u: number[]; force: [number, number]; yawNm: number; saturated: boolean; yawAuthority: boolean }

/** Minimum-effort signed thrust per thruster for the wanted force (N) and yaw torque (N m). */
export function allocate(th: Thruster[], fx: number, fz: number, yawNm: number, maxN = MAX_THRUST_N): Allocation {
  const B = [th.map((t) => t.ax), th.map((t) => t.az), th.map((t) => (t.z * t.ax - t.x * t.az) / YAW_ARM_M)];
  const tau = [fx, fz, yawNm / YAW_ARM_M];
  const A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => B[i].reduce((s, v, k) => s + v * B[j][k], 0) + (i === j ? 1e-6 : 0)));
  const y = solve3(A, tau);
  let u = th.map((_, k) => B[0][k] * y[0] + B[1][k] * y[1] + B[2][k] * y[2]);
  const peak = Math.max(...u.map(Math.abs), 1e-12);
  const saturated = peak > maxN;
  if (saturated) u = u.map((v) => (v * maxN) / peak);
  const force: [number, number] = [u.reduce((s, v, k) => s + v * th[k].ax, 0), u.reduce((s, v, k) => s + v * th[k].az, 0)];
  const yaw = u.reduce((s, v, k) => s + v * (th[k].z * th[k].ax - th[k].x * th[k].az), 0);
  return { u, force, yawNm: yaw, saturated, yawAuthority: Math.abs(B[2].reduce((s, v) => s + Math.abs(v), 0)) > 1e-6 };
}

export interface EnvForces {
  current: [number, number]; wind: [number, number]; waveDrift: [number, number];
  total: [number, number];
}
/** Hull drag in the current: quadratic, with the same Cd and frontal area the swarm model uses. */
export function currentDragN(relVelMs: [number, number]): [number, number] {
  const sp = Math.hypot(...relVelMs);
  const k = 0.5 * RHO_SEA * CD * FRONTAL_M2 * sp;
  return [k * relVelMs[0], k * relVelMs[1]];
}
/** Wind force on the freeboard, mast and raised petals. windMs is the speed, windToward the scene-plane direction it blows toward. */
export function windForceN(windMs: number, toward: [number, number], d: NodeDesign, freeboardM: number, tiltsDeg: number[]): [number, number] {
  const mast = d.parts.filter((p) => p.pos[1] > d.keelDepthM + d.hullDepthM && !p.id.startsWith('petal-')).reduce((s, p) => s + p.size[0] * Math.max(0, p.size[1]), 0);
  const petals = tiltsDeg.reduce((s, t) => s + petalGeometry(d).area * Math.sin(Math.max(0, t) * Math.PI / 180) * 0.5, 0);
  const area = Math.max(0, freeboardM) * d.hullSideM + mast + petals;
  const f = 0.5 * RHO_AIR * CD_WIND * area * windMs * windMs;
  return [f * toward[0], f * toward[1]];
}
export { G };
