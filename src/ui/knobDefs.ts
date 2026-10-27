import type { ScenarioConfig } from '../model/config';
import { KNOB_RANGE, type Knob } from '../model/solver';

export const GROUPS = ['Environment', 'Swarm', 'Tracking', 'Economics', 'Hardware'] as const;
export type Group = (typeof GROUPS)[number];

export interface ConfigKnob {
  key: keyof ScenarioConfig; label: string; unit: string; min: number; max: number; step: number;
  group: Group; note: string; est: boolean;
}
export interface DesignKnob { key: Knob; label: string; unit: string; min: number; max: number; step: number; group: Group; note: string; est: boolean }

export const CONFIG_KNOBS: ConfigKnob[] = [
  { key: 'coverage', label: 'Cloud coverage', unit: '', min: 0, max: 1, step: 0.05, group: 'Environment', est: true, note: 'Target fraction of sky shaded; realized value varies with the seed.' },
  { key: 'windEastMs', label: 'Wind east', unit: 'm/s', min: -30, max: 30, step: 1, group: 'Environment', est: true, note: 'Moves the clouds.' },
  { key: 'windNorthMs', label: 'Wind north', unit: 'm/s', min: -30, max: 30, step: 1, group: 'Environment', est: true, note: 'Moves the clouds.' },
  { key: 'currentEastMs', label: 'Current east', unit: 'm/s', min: -2, max: 2, step: 0.05, group: 'Environment', est: true, note: 'Sets drift the thrusters must cancel.' },
  { key: 'currentNorthMs', label: 'Current north', unit: 'm/s', min: -2, max: 2, step: 0.05, group: 'Environment', est: true, note: 'Sets drift the thrusters must cancel.' },
  { key: 'seed', label: 'Scenario seed', unit: '', min: 0, max: 9999, step: 1, group: 'Environment', est: false, note: 'Same seed, same weather.' },
  { key: 'nodes', label: 'Nodes', unit: '', min: 1, max: 100, step: 1, group: 'Swarm', est: false, note: 'Node 0 is the master.' },
  { key: 'spacingM', label: 'Spacing', unit: 'm', min: 10, max: 500, step: 5, group: 'Swarm', est: true, note: 'Distance between formation slots.' },
  { key: 'maxSpeedMs', label: 'Max speed through water', unit: 'm/s', min: 0.1, max: 3, step: 0.1, group: 'Swarm', est: true, note: 'Propulsion power grows with the cube of speed.' },
  { key: 'trackerNoiseM', label: 'Tracker position noise', unit: 'm', min: 0, max: 500, step: 10, group: 'Tracking', est: true, note: 'Stand-in for segmentation error.' },
  { key: 'trackerDropRate', label: 'Tracker dropout', unit: '', min: 0, max: 1, step: 0.05, group: 'Tracking', est: true, note: 'Chance a cloud is missed in a frame.' },
  { key: 'pricePerTflopHourUsd', label: 'Compute price', unit: '$/TFLOP-h', min: 0, max: 0.1, step: 0.001, group: 'Economics', est: true, note: 'Placeholder market price; confirm with quotes.' },
  { key: 'gridKgCo2PerKwh', label: 'Grid emissions factor', unit: 'kg CO2/kWh', min: 0, max: 1.5, step: 0.01, group: 'Economics', est: true, note: 'Grid-equivalent emissions displaced.' },
  { key: 'usableComputeShare', label: 'Usable compute share', unit: '', min: 0, max: 1, step: 0.05, group: 'Economics', est: true, note: 'Share of surplus power that turns into sold compute.' },
];

const DESIGN_META: Record<Knob, { label: string; unit: string; step: number; note: string }> = {
  batteryKg: { label: 'Battery mass', unit: 'kg', step: 10, note: 'Heavy and low; carries loads overnight.' },
  computeKg: { label: 'Compute pod mass', unit: 'kg', step: 5, note: 'Sealed pod in the keel.' },
  ballastKg: { label: 'Ballast', unit: 'kg', step: 10, note: 'Lowers the center of gravity.' },
  hullDepthM: { label: 'Hull depth', unit: 'm', step: 0.05, note: 'Sets reserve buoyancy.' },
  keelDepthM: { label: 'Keel depth', unit: 'm', step: 0.05, note: 'Sets stability and thruster depth.' },
  petalLengthM: { label: 'Petal length', unit: 'm', step: 0.05, note: 'Sets PV area and wind load.' },
  hullSideM: { label: 'Hull side', unit: 'm', step: 0.05, note: 'Sets waterplane and deck area.' },
};
export const DESIGN_KNOBS: DesignKnob[] = (Object.keys(KNOB_RANGE) as Knob[]).map((key) => ({
  key, ...DESIGN_META[key], min: KNOB_RANGE[key][0], max: KNOB_RANGE[key][1], group: 'Hardware' as Group, est: true,
}));
