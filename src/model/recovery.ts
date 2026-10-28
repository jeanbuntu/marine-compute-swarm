import type { NodeDesign } from './parts';

/** Proposed one-shot gas righting system. Dimensions and sequence are concept estimates. */
export const RIGHTING_BAG = { radii: [0.42, 0.65, 0.46] as [number, number, number], offsetX: 0.74, riseM: 1.05 };
export const RECOVERY_STAGES = [
  { at: 0, label: 'Knockdown', detail: 'A full inversion is injected. This pose is not predicted from wave height.', part: 'imu' },
  { at: .16, label: 'Isolate', detail: 'IMU confirms sustained inversion. Open the propulsion contactor, stop compute and hold the panel drives. No underwater thruster righting is assumed.', part: 'safety-controller' },
  { at: .32, label: 'Inflate', detail: 'A protected gas cylinder feeds the offset bag through a short retained hose. The hatch opens; buoyancy is added on one side of the inverted hull.', part: 'recovery-cassette' },
  { at: .54, label: 'Roll upright', detail: 'Off-centre buoyancy is intended to initiate roll while the existing low ballast resists inversion. The motion shown is prescribed, not a solved righting trajectory.', part: 'ballast' },
  { at: .88, label: 'Verify & hold', detail: 'Keep the bag inflated. Require upright IMU, dry enclosure and a propulsion check before restarting. A deployed bag requires servicing; it is not automatically repacked.', part: 'leak-sensor' },
] as const;
const ramp = (p: number, a: number, b: number) => Math.max(0, Math.min(1, (p - a) / (b - a)));
const smooth = (p: number) => p * p * (3 - 2 * p);
export function recoveryPose(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const knockdown = smooth(ramp(p, 0, .15));
  const roll = Math.PI * knockdown * (1 - smooth(ramp(p, .54, .88)));
  return { roll, inflation: smooth(ramp(p, .32, .54)), hatch: smooth(ramp(p, .27, .36)),
    stage: RECOVERY_STAGES.reduce((index, stage, i) => p >= stage.at ? i : index, 0), propulsionIsolated: p >= .16,
    needsService: p >= .32, verificationRequired: p >= .88 };
}
export function recoveryHardware(d: NodeDesign) {
  const deck = d.keelDepthM + d.hullDepthM;
  const sideScale = d.hullSideM / 1.6;
  return { bagCenter: [RIGHTING_BAG.offsetX * sideScale, deck + RIGHTING_BAG.riseM, 0] as [number, number, number],
    bagVolumeM3: 4 / 3 * Math.PI * RIGHTING_BAG.radii.reduce((a, b) => a * b, 1),
    massKg: d.parts.filter(p => ['recovery-cassette', 'righting-gas', 'safety-controller', 'distress-beacon', 'leak-sensor', 'perimeter-bumper', 'panel-restraints'].includes(p.id)).reduce((s, p) => s + p.massKg, 0) };
}
