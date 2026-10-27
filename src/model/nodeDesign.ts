import type { NodeDesign, Part, Subsystem } from './parts';

const HULL_SIDE = 1.52;
const HULL_DEPTH = 0.9;
const KEEL_DEPTH = 0.35;
const PETAL_LEN = 1.1;
export const NOMINAL_DECK_Y = KEEL_DEPTH + HULL_DEPTH;
const DECK_Y = NOMINAL_DECK_Y;

function part(
  id: string, name: string, subsystem: Subsystem, massKg: number,
  pos: [number, number, number], size: [number, number, number],
  powerW: number, costUsd: number, rationale: string,
): Part {
  return { id, name, subsystem, massKg, pos, size, powerW, costUsd, rationale, est: true };
}

function commonParts(): Part[] {
  const h = HULL_SIDE / 2;
  const parts: Part[] = [
    part('hull-shell', 'Hull shell', 'hull', 110, [0, KEEL_DEPTH + HULL_DEPTH * 0.55, 0], [HULL_SIDE, HULL_DEPTH, HULL_SIDE], 0, 3500,
      'Sealed foam-cored composite box; square so nodes tile and petals hinge off straight edges.'),
    part('keel-pod', 'Keel pod shell', 'hull', 40, [0, KEEL_DEPTH / 2, 0], [HULL_SIDE * 0.6, KEEL_DEPTH, HULL_SIDE * 0.6], 0, 1500,
      'Narrow keel below the hull keeps heavy items low and puts cooling and thrusters in the water.'),
    part('ballast', 'Ballast', 'hull', 80, [0, 0.08, 0], [0.8, 0.08, 0.8], 0, 200,
      'Fixed ballast plate at the keel bottom lowers the center of gravity; the main tuning knob for stability.'),
    part('battery', 'LFP battery pack (12 kWh)', 'power', 120, [0, 0.25, 0.17], [0.7, 0.25, 0.5], 0, 4800,
      'Estimated 700 × 250 × 500 mm sealed 12 kWh LFP pack, mounted on rails above the ballast in the keel pod to keep the center of gravity low; sized to carry loads overnight.'),
    part('bms', 'Battery management system', 'power', 4, [0.38, 0.44, -0.02], [0.2, 0.1, 0.15], 8, 400,
      'Beside the battery to keep high-current runs short.'),
    part('mppt-bus', 'MPPT controllers and DC bus', 'power', 8, [-0.46, 0.57, -0.1], [0.3, 0.2, 0.3], 15, 900,
      'Near hull center so petal and deck PV cables stay short.'),
    part('deck-pv', 'Deck PV', 'power', 18, [0, DECK_Y, 0], [HULL_SIDE * 0.9, 0.04, HULL_SIDE * 0.9], 0, 900,
      'Fixed PV across the deck gives baseline power even with petals stowed.'),
    part('compute-pod', 'Compute pod (2x data-center GPU, host)', 'compute', 35, [0, 0.55, 0.3], [0.5, 0.3, 0.4], 280, 9000,
      'Estimated 500 × 300 × 400 mm sealed dual-GPU enclosure on the lower hull tray, above the battery; cold plates connect to the seawater exchanger.'),
    part('heat-exchanger', 'Seawater heat exchanger', 'cooling', 12, [0, 0.23, -0.475], [0.5, 0.18, 0.04], 20, 600,
      'Hull-wall plate exchanger; ocean water is the heat sink, so no fans or evaporative loss.'),
    part('gnss', 'GNSS receiver', 'navigation', 0.5, [h * 0.6, DECK_Y + 0.08, h * 0.6], [0.1, 0.05, 0.1], 2, 300,
      'Top of deck for a clear sky view.'),
    part('imu', 'IMU', 'navigation', 0.3, [0, KEEL_DEPTH + 0.3, 0], [0.08, 0.04, 0.08], 1, 200,
      'Near the center of rotation to read heave and heel cleanly.'),
    part('sky-camera', 'Wide-angle sky camera', 'camera', 1.5, [h * 0.35, DECK_Y + 0.12, -h * 0.35], [0.12, 0.12, 0.12], 4, 400,
      'Raised dome just off deck center (the master mast takes the center) with a fisheye view of the sky for cloud tracking.'),
    part('mesh-radio', 'Mesh radio and mast', 'comms', 4, [-h * 0.6, DECK_Y + 0.3, -h * 0.6], [0.1, 0.6, 0.1], 10, 500,
      'Short mast lifts the antenna above spray and petal shadow for the link to neighbors.'),
  ];
  const corners: [number, number][] = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  corners.forEach(([sx, sz], i) => {
    parts.push(part(`thruster-${i + 1}`, `Thruster ${i + 1} (45 deg)`, 'propulsion', 4.5,
      [sx * (h * 0.6 + 0.12), 0.23, sz * (h * 0.6 + 0.12)], [0.16, 0.16, 0.3], 300, 1200,
      'Fixed 45 degree corner thruster below the waterline; the four together push in any direction with no steering parts.'));
  });
  const dirs: [number, number, string][] = [[1, 0, 'E'], [0, 1, 'S'], [-1, 0, 'W'], [0, -1, 'N']];
  for (const [dx, dz, tag] of dirs) {
    parts.push(part(`petal-${tag}`, `Petal ${tag}`, 'petals', 28, [dx * HULL_SIDE * 0.25, DECK_Y + 0.08, dz * HULL_SIDE * 0.25],
      [dx === 0 ? HULL_SIDE : PETAL_LEN, 0.05, dz === 0 ? HULL_SIDE : PETAL_LEN], 6, 1400,
      'Hinged PV petal with a single actuator; folds over the deck to stow in wind and unfolds to tilt toward the sun.'));
  }
  return parts;
}

function base(role: 'worker' | 'master', extra: Part[]): NodeDesign {
  return {
    role, hullSideM: HULL_SIDE, hullDepthM: HULL_DEPTH, keelDepthM: KEEL_DEPTH,
    petalLengthM: PETAL_LEN, petalCount: 4, parts: [...commonParts(), ...extra],
  };
}

export function workerDesign(): NodeDesign {
  return base('worker', []);
}

export function masterDesign(): NodeDesign {
  const h = HULL_SIDE / 2;
  return base('master', [
    part('starlink', 'Starlink terminal', 'comms', 4, [0, DECK_Y + 0.95, 0], [0.5, 0.03, 0.4], 75, 2500,
      'Only terminal in the swarm: on a mast at deck center, above petal shadow and spray, fixed flat with a clear view; workers uplink through it.'),
    part('starlink-mast', 'Starlink mast', 'comms', 6, [0, DECK_Y + 0.45, 0], [0.06, 0.9, 0.06], 0, 300,
      'Lifts the terminal clear of petals when deployed.'),
    part('gnss-2', 'Redundant GNSS receiver', 'navigation', 0.5, [-h * 0.6, DECK_Y + 0.08, h * 0.6], [0.1, 0.05, 0.1], 2, 300,
      'Second receiver on the opposite corner; the master anchors the swarm formation.'),
    part('battery-2', 'Extra battery pack', 'power', 60, [0, 0.23, -0.3], [0.5, 0.2, 0.26], 0, 2400,
      'Estimated 6 kWh pack in a separate keel bay behind the main battery; carries the terminal and coordination load.'),
    part('compute-2', 'Coordinator compute', 'compute', 30, [0, 0.55, -0.3], [0.4, 0.2, 0.3], 150, 5000,
      'Runs the swarm coordinator and the navigation agent interface.'),
  ]);
}

export function partMassKg(d: NodeDesign): number {
  return d.parts.reduce((s, p) => s + p.massKg, 0);
}

/** Deployed PV area: petals plus 80% of the deck. */
export function pvAreaM2(d: NodeDesign): number {
  return d.petalCount * d.petalLengthM * d.hullSideM + 0.8 * d.hullSideM * d.hullSideM;
}


/** Rendered envelope, in meters, including geometry controlled by hardware knobs. */
export function partEnvelope(d: NodeDesign, p: Part): [number, number, number] {
  if (p.id === 'hull-shell') return [d.hullSideM, d.hullDepthM, d.hullSideM];
  if (p.id === 'keel-pod') return [d.hullSideM * 0.6, d.keelDepthM, d.hullSideM * 0.6];
  if (p.id === 'deck-pv') return [d.hullSideM * 0.9, p.size[1], d.hullSideM * 0.9];
  if (p.id.startsWith('petal-')) return [p.pos[0] ? d.petalLengthM : d.hullSideM, p.size[1], p.pos[2] ? d.petalLengthM : d.hullSideM];
  return p.size;
}
