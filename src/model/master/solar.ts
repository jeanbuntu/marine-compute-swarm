/**
 * Sun geometry and tilted-plane irradiance for the master node's petals.
 * Scene axes: x east, y up, z south. Body axes follow the node: +x starboard-east at yaw 0, +z south.
 * Attitude composes as Ry(yaw) Rx(pitch) Rz(roll), the same order three.js calls 'YXZ'.
 */
export type V3 = [number, number, number];
export interface Attitude { yaw: number; pitch: number; roll: number } // radians
export interface Irradiance { directWm2: number; diffuseWm2: number; ghiWm2: number } // direct is normal-incidence (DNI)

const RAD = Math.PI / 180;
const ALBEDO = 0.06; // EST: open sea

function matrix(a: Attitude): number[] {
  const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw), cx = Math.cos(a.pitch), sx = Math.sin(a.pitch), cz = Math.cos(a.roll), sz = Math.sin(a.roll);
  // Ry * Rx * Rz, row-major
  return [
    cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
    cx * sz, cx * cz, -sx,
    -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx,
  ];
}
export function bodyToWorld(a: Attitude, v: V3): V3 {
  const m = matrix(a);
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
export function worldToBody(a: Attitude, v: V3): V3 {
  const m = matrix(a);
  return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
}

/** Unit vector toward the sun. Azimuth is compass degrees from north, clockwise. */
export function sunVector(azDeg: number, elevDeg: number): V3 {
  const az = azDeg * RAD, el = elevDeg * RAD;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

/**
 * Splits clear-sky GHI into beam and diffuse given the cloud transmission at the node (EST).
 * Full transmission leaves a 12% diffuse share; heavy shade is almost all diffuse.
 */
export function decompose(clearGhiWm2: number, transmission: number, elevDeg: number): Irradiance {
  const f = Math.min(1, Math.max(0, transmission));
  const ghi = Math.max(0, clearGhiWm2) * f;
  const kd = 1 - 0.88 * f ** 3;
  const sinE = Math.sin(Math.max(elevDeg, 0) * RAD);
  const dni = sinE > 0.02 ? Math.min(1100, (ghi * (1 - kd)) / sinE) : 0;
  return { directWm2: dni, diffuseWm2: sinE > 0.02 ? ghi - dni * sinE : ghi, ghiWm2: ghi };
}

export { PETAL_IDS, PETAL_DIRS, type PetalId } from '../hardware';

/** Tilt is positive when the outer edge rises (matches the rendered model); the normal then leans back over the hull. */
export function petalNormalBody(dir: readonly [number, number, number], tiltRad: number): V3 {
  const s = Math.sin(tiltRad);
  return [-dir[0] * s, Math.cos(tiltRad), -dir[2] * s];
}

/** Irradiance on a plane with the given world-frame unit normal: beam + isotropic sky + sea-reflected. */
export function planeIrradiance(n: V3, sun: V3, irr: Irradiance): number {
  const cosInc = Math.max(0, n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]);
  return irr.directWm2 * cosInc + irr.diffuseWm2 * ((1 + n[1]) / 2) + irr.ghiWm2 * ALBEDO * ((1 - n[1]) / 2);
}

export function petalIrradiance(att: Attitude, dir: readonly [number, number, number], tiltDeg: number, sun: V3, irr: Irradiance): number {
  return planeIrradiance(bodyToWorld(att, petalNormalBody(dir, tiltDeg * RAD)), sun, irr);
}

/** Tilt that maximises total irradiance within [minDeg, maxDeg]: 1 degree grid, refined by a parabola through the best three points. */
export function bestTiltDeg(att: Attitude, dir: readonly [number, number, number], sun: V3, irr: Irradiance, minDeg: number, maxDeg: number): number {
  let best = Math.max(minDeg, Math.min(maxDeg, 0)), bestE = -1;
  for (let t = Math.ceil(minDeg); t <= maxDeg; t++) {
    const e = petalIrradiance(att, dir, t, sun, irr);
    if (e > bestE + 1e-9) { bestE = e; best = t; }
  }
  if (best - 1 >= minDeg && best + 1 <= maxDeg) {
    const a = petalIrradiance(att, dir, best - 1, sun, irr), c = petalIrradiance(att, dir, best + 1, sun, irr);
    const den = a - 2 * bestE + c;
    if (den < -1e-9) best += Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
  }
  return best;
}
