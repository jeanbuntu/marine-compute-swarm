import { mulberry32 } from '../rng';
import { G, RHO_SEA } from '../constants';

/**
 * One seeded sea surface shared by the physics, the water mesh and the particles.
 * Scene axes: x east, y up, z south. Heading is the compass direction waves travel toward.
 */
export type SeaPreset = 'calm' | 'swell' | 'chop' | 'storm';
export interface SeaParams { hsM: number; tpS: number; headingDeg: number; spreadDeg: number; seed: number }
export interface WaveComponent { a: number; k: number; omega: number; phase: number; dirX: number; dirZ: number }

export const SEA_PRESETS: Record<SeaPreset, Omit<SeaParams, 'seed'>> = {
  calm: { hsM: 0.25, tpS: 4, headingDeg: 90, spreadDeg: 30 },
  swell: { hsM: 1.2, tpS: 10, headingDeg: 90, spreadDeg: 15 },
  chop: { hsM: 0.9, tpS: 5, headingDeg: 60, spreadDeg: 55 },
  storm: { hsM: 3.5, tpS: 11, headingDeg: 110, spreadDeg: 40 },
};

export const WAVE_COMPONENTS = 12;
const RAD = Math.PI / 180;

export interface Sea {
  params: SeaParams;
  components: WaveComponent[];
  hsM: number;
  elevation(x: number, z: number, t: number): number;
  /** Surface gradient [d eta/dx, d eta/dz]. */
  slope(x: number, z: number, t: number): [number, number];
  /** Water particle velocity at depth y (<= 0 below the mean surface), deep-water orbital motion. */
  orbital(x: number, y: number, z: number, t: number): [number, number, number];
  /** Mean wave drift force on a body of the given beam, N, in scene x and z. EST. */
  driftForceN(beamM: number): [number, number];
}

export function makeSea(p: SeaParams): Sea {
  const rnd = mulberry32(p.seed * 7919 + 13);
  const fp = 1 / Math.max(1, p.tpS);
  const gamma = p.hsM > 2 ? 1.5 : 3.3;
  const raw: { f: number; w: number }[] = [];
  for (let i = 0; i < WAVE_COMPONENTS; i++) {
    const f = fp * (0.62 + (i / (WAVE_COMPONENTS - 1)) * 2.4) * (0.97 + 0.06 * rnd());
    const sigma = f <= fp ? 0.07 : 0.09;
    const peak = gamma ** Math.exp(-((f / fp - 1) ** 2) / (2 * sigma * sigma));
    const s = f ** -5 * Math.exp(-1.25 * (fp / f) ** 4) * peak; // JONSWAP shape
    raw.push({ f, w: s * (f * 0.18) });
  }
  const energy = raw.reduce((s, r) => s + r.w, 0);
  // Hs = 4 sqrt(sum a^2 / 2): scale amplitudes so the sea has exactly the requested Hs.
  const scale = p.hsM / 4 / Math.sqrt(0.5 * energy);
  const components: WaveComponent[] = raw.map((r) => {
    const omega = 2 * Math.PI * r.f;
    const k = (omega * omega) / G;
    const spread = p.spreadDeg * (0.6 + 0.4 * (r.f / fp / 3)) * (rnd() * 2 - 1);
    const h = (p.headingDeg + spread) * RAD;
    return { a: Math.sqrt(r.w) * scale, k, omega, phase: rnd() * 2 * Math.PI, dirX: Math.sin(h), dirZ: -Math.cos(h) };
  });
  const hsM = 4 * Math.sqrt(0.5 * components.reduce((s, c) => s + c.a * c.a, 0));

  const theta = (c: WaveComponent, x: number, z: number, t: number) => c.k * (c.dirX * x + c.dirZ * z) - c.omega * t + c.phase;
  return {
    params: p, components, hsM,
    elevation(x, z, t) {
      let e = 0;
      for (const c of components) e += c.a * Math.cos(theta(c, x, z, t));
      return e;
    },
    slope(x, z, t) {
      let sx = 0, sz = 0;
      for (const c of components) {
        const d = -c.a * c.k * Math.sin(theta(c, x, z, t));
        sx += d * c.dirX; sz += d * c.dirZ;
      }
      return [sx, sz];
    },
    orbital(x, y, z, t) {
      let ux = 0, uy = 0, uz = 0;
      for (const c of components) {
        const th = theta(c, x, z, t), amp = c.a * c.omega * Math.exp(c.k * Math.min(0, y));
        const h = amp * Math.cos(th);
        ux += h * c.dirX; uz += h * c.dirZ; uy += amp * Math.sin(th);
      }
      return [ux, uy, uz];
    },
    driftForceN(beamM) {
      let fx = 0, fz = 0;
      for (const c of components) {
        const refl = Math.min(1, c.k * beamM * 0.5) ** 2; // short waves reflect, long waves pass under a small hull
        const f = 0.5 * RHO_SEA * G * c.a * c.a * refl * beamM;
        fx += f * c.dirX; fz += f * c.dirZ;
      }
      return [fx, fz];
    },
  };
}
