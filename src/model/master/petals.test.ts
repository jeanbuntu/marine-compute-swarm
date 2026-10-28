import { describe, expect, it } from 'vitest';
import { masterDesign } from '../nodeDesign';
import { evaluate } from '../hydrostatics';
import { actuate, limitHeel, petalTargets, staticHeel, tiltLimits, uniformTilts, defaultActuator } from './petals';
import { decompose, sunVector } from './solar';

const d = masterDesign(), h = evaluate(d, 'deployed');
const flat = { yaw: 0, pitch: 0, roll: 0 };

describe('static heel', () => {
  it('is zero for equal tilts', () => {
    const s = staticHeel(d, uniformTilts(35), h.gmM);
    expect(Math.abs(s.roll) + Math.abs(s.pitch)).toBeLessThan(1e-9);
  });
  it('heels toward the flat side: a raised petal pulls its mass inward, so the west side sinks', () => {
    const s = staticHeel(d, { ...uniformTilts(20), E: 60, W: 0 }, h.gmM);
    expect(s.roll).toBeGreaterThan(0); // positive roll raises east, so west is down
  });
  it('limits asymmetric tilts so heel stays inside the stability limit', () => {
    const t = limitHeel(d, { ...uniformTilts(0), E: 75, W: -30 }, h.gmM);
    const s = staticHeel(d, t, h.gmM);
    expect(Math.hypot(s.roll, s.pitch) * 180 / Math.PI).toBeLessThanOrEqual(8.01);
  });
});

describe('limits and targets', () => {
  it('keeps petal tips above the water: the lowest tilt is above the mechanical stop for a rough sea', () => {
    const calm = tiltLimits(d, h.freeboardM, 0.2, defaultActuator()), storm = tiltLimits(d, h.freeboardM, 3.5, defaultActuator());
    expect(storm.minDeg).toBeGreaterThan(calm.minDeg);
    expect(storm.minDeg).toBeLessThanOrEqual(0);
  });
  it('tracks an eastern sun with the west petal and stows in strong wind', () => {
    const sun = sunVector(90, 25), irr = decompose(900, 1, 25);
    const t = petalTargets('track', { att: flat, sun, irr, minDeg: -20, maxDeg: 75, winterStow: false });
    expect(t.W).toBeGreaterThan(t.E);
    const stowed = petalTargets('track', { att: flat, sun, irr, minDeg: -20, maxDeg: 75, winterStow: true });
    expect(stowed.W).toBe(0);
  });
  it('fixed strategy keeps the as-built 20 degrees', () => {
    const t = petalTargets('fixed', { att: flat, sun: sunVector(90, 25), irr: decompose(900, 1, 25), minDeg: -20, maxDeg: 75, winterStow: false });
    expect(t.N).toBe(20);
  });
});

describe('actuator', () => {
  it('moves no faster than the rate limit', () => {
    const r = actuate(uniformTilts(0), uniformTilts(60), 2, 6, -30, 75);
    expect(r.tilts.E).toBeCloseTo(12, 6);
    expect(r.movedDeg).toBeCloseTo(48, 6);
  });
  it('clamps to the allowed range', () => {
    expect(actuate(uniformTilts(-19), uniformTilts(-60), 10, 6, -20, 75).tilts.E).toBe(-20);
  });
});
