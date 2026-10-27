import { workerDesign, masterDesign, partMassKg, pvAreaM2, partEnvelope } from './nodeDesign';
import type { Subsystem } from './parts';

const subsystems = (d: ReturnType<typeof workerDesign>) => new Set(d.parts.map((p) => p.subsystem));

describe('node designs', () => {
  const required: Subsystem[] = ['hull', 'petals', 'power', 'compute', 'cooling', 'propulsion', 'navigation', 'comms', 'camera'];

  test('worker has every subsystem', () => {
    const s = subsystems(workerDesign());
    for (const r of required) expect(s.has(r)).toBe(true);
  });

  test('worker has four petals and four thrusters', () => {
    const d = workerDesign();
    expect(d.parts.filter((p) => p.id.startsWith('petal-')).length).toBe(4);
    expect(d.parts.filter((p) => p.id.startsWith('thruster-')).length).toBe(4);
  });

  test('worker carries the named parts', () => {
    const ids = workerDesign().parts.map((p) => p.id);
    for (const id of ['battery', 'compute-pod', 'heat-exchanger', 'mppt-bus', 'bms', 'gnss', 'imu', 'sky-camera', 'mesh-radio']) {
      expect(ids).toContain(id);
    }
  });

  test('only the master carries the Starlink terminal, plus a second GNSS and extra battery', () => {
    const w = workerDesign().parts.map((p) => p.id);
    const m = masterDesign().parts.map((p) => p.id);
    expect(w).not.toContain('starlink');
    expect(m).toContain('starlink');
    expect(m).toContain('gnss-2');
    expect(m).toContain('battery-2');
    expect(partMassKg(masterDesign())).toBeGreaterThan(partMassKg(workerDesign()));
  });

  test('every part has a rationale', () => {
    for (const d of [workerDesign(), masterDesign()]) {
      for (const p of d.parts) expect(p.rationale.length).toBeGreaterThan(5);
    }
  });

  test('worker PV area is 7.5 to 10.5 m2', () => {
    const a = pvAreaM2(workerDesign());
    expect(a).toBeGreaterThanOrEqual(7.5);
    expect(a).toBeLessThanOrEqual(10.5);
  });

  test('Starlink sits above the deck on a mast', () => {
    const d = masterDesign();
    const s = d.parts.find((p) => p.id === 'starlink')!;
    expect(s.pos[1]).toBeGreaterThan(d.keelDepthM + d.hullDepthM);
  });
});


describe('equipment packaging', () => {
  test.each([workerDesign(), masterDesign()])('major equipment has clearance inside the shell', (d) => {
    const equipment = d.parts.filter(p => ['battery', 'battery-2', 'compute-pod', 'compute-2', 'bms', 'mppt-bus', 'ballast'].includes(p.id));
    for (const p of equipment) {
      expect(p.pos[1] - p.size[1] / 2).toBeGreaterThanOrEqual(0.025);
      expect(p.pos[1] + p.size[1] / 2).toBeLessThan(d.keelDepthM + d.hullDepthM - 0.025);
      const width = p.pos[1] - p.size[1] / 2 < d.keelDepthM ? d.hullSideM * 0.6 : d.hullSideM;
      for (const axis of [0, 2]) expect(Math.abs(p.pos[axis]) + p.size[axis] / 2).toBeLessThanOrEqual(width / 2 - 0.015);
    }
    for (let i = 0; i < equipment.length; i++) for (let j = i + 1; j < equipment.length; j++) {
      const a = equipment[i], b = equipment[j];
      const separated = [0, 1, 2].some(axis => Math.abs(a.pos[axis] - b.pos[axis]) >= (a.size[axis] + b.size[axis]) / 2 + 0.004);
      expect(separated, `${a.id} overlaps ${b.id}`).toBe(true);
    }
  });
});


test('dimension readouts follow edited hull and panel geometry', () => {
  const d = { ...workerDesign(), hullSideM: 2, hullDepthM: 1.2, petalLengthM: 1.6 };
  const size = (id: string) => partEnvelope(d, d.parts.find(p => p.id === id)!);
  expect(size('hull-shell')).toEqual([2, 1.2, 2]);
  expect(size('petal-E')).toEqual([1.6, 0.05, 2]);
  expect(size('petal-N')).toEqual([2, 0.05, 1.6]);
  expect(size('deck-pv')).toEqual([1.8, 0.04, 1.8]);
});
