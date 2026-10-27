import { runScenario, scaleUp } from './impact';
import { defaultConfig } from './config';

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
});
