import type { NodeDesign } from './parts';

/** NVIDIA PB-11316-001 v01, Fig. 4: nominal board length/height incl. connector.
 * Thickness is a single-slot installation allowance, not a manufacturer thickness measurement. */
export const GPU = {
  name: 'NVIDIA L4', lengthM: 0.16854, heightM: 0.06890, slotM: 0.02032,
  powerW: 72, denseFp16Tflops: 121, massKg: 0.279,
  source: 'https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/l4/PB-11316-001_v01.pdf',
};
/** Two vertical cards, host tray, cold plate, connectors and service clearances (EST). */
export const COMPUTE_SIZE: [number, number, number] = [2 * GPU.slotM + 0.36, GPU.heightM + 0.1311, GPU.lengthM + 0.15146];
export const PETAL_IDS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'] as const;
export type PetalId = typeof PETAL_IDS[number];
export const PETAL_DIRS = Object.fromEntries(PETAL_IDS.map((id, i) => [id, [Math.round(Math.cos(i * Math.PI / 4) * 1e8) / 1e8, 0, Math.round(Math.sin(i * Math.PI / 4) * 1e8) / 1e8]])) as Record<PetalId, [number, number, number]>;
/** One drive per pair, via a torque shaft and bevel gear concept. */
export const PETAL_PAIRS = [['E', 'SE'], ['S', 'SW'], ['W', 'NW'], ['N', 'NE']] as const;
export const PANEL_GAP_M = 0.025;
export const PANEL_CORNER_M = 0.04;
export const PANEL_STACK_PITCH_M = 0.10;
// Passive clearance for ordinary ±30° travel; a swept-volume interlock handles
// larger independent angles. Full-width flat tiling is not a safe moving layout.
export const PANEL_PASSIVE_TILT_DEG = 30;
export const PANEL_MAX_TILT_DEG = 75;
/** Corner cutout of the same quadratic fillet used by the mesh. */
export function roundedTrapezoidArea(length: number, inner: number, outer: number, corner: number) {
  const slope = (outer-inner)/2, sine = length/Math.hypot(length,slope);
  return (inner+outer)*length/2 - 4*sine*corner**2/6;
}
export function petalGeometry(d: Pick<NodeDesign, 'hullSideM' | 'petalLengthM'>) {
  const root = d.hullSideM / 2, length = d.petalLengthM, tangent = Math.tan(Math.PI / 8);
  const innerWidth = 2 * (root - 0.06) * tangent - PANEL_GAP_M / Math.cos(Math.PI/8);
  const outerWidth = 2 * (root + length * Math.cos(PANEL_PASSIVE_TILT_DEG * Math.PI/180) - 0.06) * tangent - PANEL_GAP_M / Math.cos(Math.PI/8);
  const area = roundedTrapezoidArea(length,innerWidth,outerWidth,PANEL_CORNER_M);
  const inset = 0.018, dw = outerWidth-innerWidth;
  const activeArea = roundedTrapezoidArea(length-2*inset,innerWidth+dw*inset/length-2*inset,outerWidth-dw*inset/length-2*inset,PANEL_CORNER_M-inset);
  const centroid = length * (innerWidth + 2 * outerWidth) / (3 * (innerWidth + outerWidth));
  return { root, length, innerWidth, outerWidth, area, activeArea, centroid };
}
export const deckAreaM2 = (d: NodeDesign) => 2 * Math.tan(Math.PI / 8) * d.hullSideM ** 2;
/** Rounded square section, 80 mm corner radius: analytical area and second moment. */
export function hullSection(side: number) {
  const radius = Math.min(0.08, side / 10), a = side / 2 - radius;
  const removed = radius ** 2 * (1 - Math.PI / 4);
  const first = radius ** 3 / 6;
  const second = radius ** 4 * (1 / 3 - Math.PI / 16);
  return { area: side ** 2 - 4 * removed, inertia: side ** 4 / 12 - 4 * (a * a * removed + 2 * a * first + second) };
}
