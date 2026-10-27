import { describe, expect, it } from 'vitest';
import { makeSea, SEA_PRESETS } from './waves';

const sea = makeSea({ ...SEA_PRESETS.swell, seed: 3 });

describe('sea surface', () => {
  it('is deterministic for a seed', () => {
    const b = makeSea({ ...SEA_PRESETS.swell, seed: 3 });
    expect(b.elevation(4, -7, 12.5)).toBe(sea.elevation(4, -7, 12.5));
  });
  it('matches the requested significant wave height', () => {
    expect(sea.hsM).toBeCloseTo(SEA_PRESETS.swell.hsM, 5);
  });
  it('has a time-averaged variance near (Hs/4)^2', () => {
    let s = 0, n = 0;
    for (let t = 0; t < 1800; t += 0.5) { const e = sea.elevation(0, 0, t); s += e * e; n++; }
    const hs = 4 * Math.sqrt(s / n);
    expect(hs).toBeGreaterThan(SEA_PRESETS.swell.hsM * 0.6);
    expect(hs).toBeLessThan(SEA_PRESETS.swell.hsM * 1.4);
  });
  it('slope is the derivative of elevation', () => {
    const e = 1e-4, [sx, sz] = sea.slope(3, 5, 7);
    expect(sx).toBeCloseTo((sea.elevation(3 + e, 5, 7) - sea.elevation(3 - e, 5, 7)) / (2 * e), 4);
    expect(sz).toBeCloseTo((sea.elevation(3, 5 + e, 7) - sea.elevation(3, 5 - e, 7)) / (2 * e), 4);
  });
  it('obeys the deep-water dispersion relation', () => {
    for (const c of sea.components) expect(c.omega ** 2).toBeCloseTo(9.81 * c.k, 6);
  });
  it('travels toward the heading (east for 90 degrees)', () => {
    const east = makeSea({ hsM: 1, tpS: 8, headingDeg: 90, spreadDeg: 0, seed: 1 });
    const mean = east.components.reduce((s, c) => s + c.dirX * c.a * c.a, 0);
    expect(mean).toBeGreaterThan(0);
    expect(Math.abs(east.components.reduce((s, c) => s + c.dirZ * c.a * c.a, 0))).toBeLessThan(1e-9);
  });
  it('orbital motion decays with depth and moves forward under a crest', () => {
    const one = makeSea({ hsM: 1, tpS: 8, headingDeg: 90, spreadDeg: 0, seed: 2 });
    const top = one.orbital(0, 0, 0, 0), deep = one.orbital(0, -20, 0, 0);
    expect(Math.hypot(...deep)).toBeLessThan(Math.hypot(...top) * 0.5);
    // find a time when the surface is at a crest; horizontal velocity along +x is then positive
    let tBest = 0, best = -Infinity;
    for (let t = 0; t < 40; t += 0.05) { const e = one.elevation(0, 0, t); if (e > best) { best = e; tBest = t; } }
    expect(one.orbital(0, 0, 0, tBest)[0]).toBeGreaterThan(0);
  });
  it('mean drift force pushes along the wave heading', () => {
    const [fx, fz] = sea.driftForceN(1.52);
    expect(fx).toBeGreaterThan(0);
    expect(Math.abs(fz)).toBeLessThan(Math.abs(fx));
  });
});
