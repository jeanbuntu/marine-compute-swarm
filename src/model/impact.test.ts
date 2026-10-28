import { runScenario, scaleUp } from './impact';
import { defaultConfig } from './config';
import { workerDesign, masterDesign } from './nodeDesign';

const cfg = (o = {}) => ({ ...defaultConfig(), nodes: 7, ...o });

describe('impact', () => {
  test('clear sky: avoidance gain is about zero', () => {
    const r = runScenario(cfg({ coverage: 0 }), 12);
    expect(Math.abs(r.gainPct)).toBeLessThan(1);
    expect(r.swarm.energyKwh).toBeGreaterThan(0);
  });

  test('overcast sky runs without NaN', () => {
    const r = runScenario(cfg({ coverage: 1 }), 12);
    for (const v of [...Object.values(r.swarm), ...Object.values(r.stayPut), r.gainPct]) expect(Number.isFinite(v)).toBe(true);
  });

  test('partly cloudy: swarm is not meaningfully worse than staying put', () => {
    const r = runScenario(cfg({ coverage: 0.5 }), 12);
    expect(r.gainPct).toBeGreaterThan(-1);
  });

  test('scaleUp multiplies per-node impact', () => {
    const x = { energyKwh: 2, computeTflopH: 3, revenueUsd: 4, co2AvoidedKg: 5 };
    expect(scaleUp(x, 10, [])).toEqual({ energyKwh: 20, computeTflopH: 30, revenueUsd: 40, co2AvoidedKg: 50 });
  });

  test('same config and seed give identical numbers', () => {
    expect(runScenario(cfg(), 6)).toEqual(runScenario(cfg(), 6));
  });

  test('zero stay-put energy gives zero gain', () => {
    const r = runScenario(cfg({ coverage: 0 }), 0.01, 0);
    expect(r.gainPct).toBe(0);
  });

  test('edited hardware changes the result: longer petals harvest more', () => {
    const base = { worker: workerDesign(), master: masterDesign() };
    const longer = { worker: { ...base.worker, petalLengthM: 1.6 }, master: { ...base.master, petalLengthM: 1.6 } };
    const a = runScenario(cfg({ coverage: 0 }), 6, 8, base).swarm.energyKwh;
    const b = runScenario(cfg({ coverage: 0 }), 6, 8, longer).swarm.energyKwh;
    expect(b).toBeGreaterThan(a * 1.1);
  });
});


test('host and coordinator watts do not earn GPU throughput', () => {
  const master = masterDesign(), worker = workerDesign();
  const c = cfg({ nodes: 1, coverage: 0 });
  const withoutCoordinatorLoad = { ...master, parts: master.parts.map(p => p.id === 'compute-2' ? { ...p, powerW: 0 } : p) };
  const a = runScenario(c, 0.5, 11, { master, worker }).swarm.computeTflopH;
  const b = runScenario(c, 0.5, 11, { master: withoutCoordinatorLoad, worker }).swarm.computeTflopH;
  expect(a).toBeGreaterThan(0);
  expect(a).toBeCloseTo(b, 8);
  expect(a).toBeLessThanOrEqual(2 * 121 * 0.5 * c.usableComputeShare + 1e-7);
});
