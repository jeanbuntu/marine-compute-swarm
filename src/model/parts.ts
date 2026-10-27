export type Subsystem =
  | 'hull' | 'petals' | 'power' | 'compute' | 'cooling'
  | 'propulsion' | 'navigation' | 'comms' | 'camera';

/** Origin is the keel bottom center; y is up; units are meters and kilograms. */
export interface Part {
  id: string;
  name: string;
  subsystem: Subsystem;
  massKg: number;
  pos: [number, number, number];
  size: [number, number, number];
  powerW: number;
  costUsd: number;
  rationale: string;
  est: boolean;
}

export interface NodeDesign {
  role: 'worker' | 'master';
  hullSideM: number;
  hullDepthM: number;
  keelDepthM: number;
  petalLengthM: number;
  petalCount: number;
  parts: Part[];
}
