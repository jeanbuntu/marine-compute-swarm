import { workerDesign, masterDesign, partMassKg, pvAreaM2 } from './nodeDesign';
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
