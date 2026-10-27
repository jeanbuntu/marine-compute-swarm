import { pvAreaM2 } from './nodeDesign';
import type { NodeDesign } from './parts';

export const PV_EFFICIENCY = 0.21; // EST: commercial marine-grade module
export const MPPT_EFFICIENCY = 0.97; // EST

export function pvPowerW(d: NodeDesign, ghiWm2: number, shadowFactor: number): number {
  const g = Math.max(0, ghiWm2);
  const s = Math.min(1, Math.max(0, shadowFactor));
  return pvAreaM2(d) * PV_EFFICIENCY * g * s * MPPT_EFFICIENCY;
}

/** Fixed loads (every non-propulsion part) plus the commanded thrust power. */
export function loadW(d: NodeDesign, thrustW: number): number {
  const fixed = d.parts.filter((p) => p.subsystem !== 'propulsion').reduce((s, p) => s + p.powerW, 0);
  return fixed + Math.max(0, thrustW);
}

export function stepBattery(socWh: number, capacityWh: number, netW: number, dtS: number): number {
  return Math.min(capacityWh, Math.max(0, socWh + (netW * dtS) / 3600));
}
