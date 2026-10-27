import type { Part, Subsystem } from '../model/parts';

export const EXPLODE_FACTOR = 1;

/** Direction and distance (m) each subsystem moves at factor 1. */
const FAN: Record<Subsystem, [number, number, number]> = {
  hull: [0, 0.2, 0], petals: [0, 1.2, 0], power: [-1.6, 0.3, 0], compute: [1.6, 0.3, 0.2],
  cooling: [0.2, -0.8, -1.4], propulsion: [0, -1.0, 0], navigation: [0.9, 1.6, 0.9],
  comms: [-0.9, 2.2, -0.9], camera: [1.4, 1.9, -1.4],
};

/** Per-part offsets that fan subsystems apart; factor 0 gives zeros. Parts keep their own radial direction. */
export function explodeOffsets(parts: Part[], factor: number): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  for (const p of parts) {
    const [fx, fy, fz] = FAN[p.subsystem];
    const radial: [number, number, number] =
      p.subsystem === 'propulsion' || p.subsystem === 'petals'
        ? [Math.sign(p.pos[0]) * 1.1, 0, Math.sign(p.pos[2]) * 1.1]
        : [p.pos[0] * 0.8, 0, p.pos[2] * 0.8];
    out[p.id] = [(fx + radial[0]) * factor, fy * factor, (fz + radial[2]) * factor];
  }
  return out;
}
