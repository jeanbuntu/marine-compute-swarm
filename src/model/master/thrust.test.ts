import { describe, expect, it } from 'vitest';
import { masterDesign } from '../nodeDesign';
import { allocate, bollardThrustN, currentDragN, jetSpeedMs, thrusterPowerW, thrustersFromDesign, windForceN, MAX_THRUST_N } from './thrust';

const d = masterDesign();
const radial = thrustersFromDesign(d, 'radial'), tang = thrustersFromDesign(d, 'tangential');

describe('thruster layout', () => {
  it('reads four thrusters from the design with unit axes', () => {
    expect(radial).toHaveLength(4);
    for (const t of [...radial, ...tang]) expect(Math.hypot(t.ax, t.az)).toBeCloseTo(1, 9);
  });
  it('as-built radial axes sit on the corner diagonals', () => {
    for (const t of radial) expect(Math.abs(Math.abs(t.ax) - Math.SQRT1_2)).toBeLessThan(1e-9);
  });
});

describe('allocation', () => {
  it('delivers the commanded force in any direction', () => {
    for (const [fx, fz] of [[20, 0], [0, 20], [-15, 9], [7, -22]]) {
      const a = allocate(radial, fx, fz, 0);
      expect(a.force[0]).toBeCloseTo(fx, 3); expect(a.force[1]).toBeCloseTo(fz, 3);
    }
  });
  it('the as-built radial layout has no yaw authority; a tangential layout does', () => {
    expect(allocate(radial, 0, 0, 5).yawNm).toBeCloseTo(0, 6);
    expect(allocate(radial, 0, 0, 5).yawAuthority).toBe(false);
    const t = allocate(tang, 0, 0, 5);
    expect(t.yawNm).toBeCloseTo(5, 3);
    expect(t.yawAuthority).toBe(true);
  });
  it('saturates at the thruster limit without changing direction', () => {
    const a = allocate(radial, 1e4, 0, 0);
    expect(a.saturated).toBe(true);
    expect(Math.max(...a.u.map(Math.abs))).toBeCloseTo(MAX_THRUST_N, 6);
    expect(Math.abs(a.force[1])).toBeLessThan(1e-6);
  });
  it('commanding +x force sends the jets toward -x (reaction)', () => {
    const a = allocate(radial, 30, 0, 0);
    // each thruster pushes water along -u*axis; their sum opposes the force
    const jet = a.u.reduce((s, u, k) => s - u * radial[k].ax, 0);
    expect(jet).toBeLessThan(0);
  });
});

describe('power', () => {
  it('bollard thrust at rated power is tens of newtons', () => {
    expect(MAX_THRUST_N).toBeGreaterThan(30); expect(MAX_THRUST_N).toBeLessThan(200);
  });
  it('power at bollard matches the inverse of bollardThrustN', () => {
    expect(thrusterPowerW(bollardThrustN(300), 0)).toBeCloseTo(300, 3);
  });
  it('inflow raises power for the same thrust', () => {
    expect(thrusterPowerW(30, 0.5)).toBeGreaterThan(thrusterPowerW(30, 0));
    expect(jetSpeedMs(30)).toBeGreaterThan(jetSpeedMs(10));
  });
});

describe('environment', () => {
  it('current drag pushes with the relative flow and grows with its square', () => {
    const a = currentDragN([0.2, 0]), b = currentDragN([0.4, 0]);
    expect(a[0]).toBeGreaterThan(0);
    expect(b[0] / a[0]).toBeCloseTo(4, 6);
  });
  it('wind force grows with raised petals', () => {
    const lo = windForceN(10, [1, 0], d, 0.6, [0, 0, 0, 0]), hi = windForceN(10, [1, 0], d, 0.6, [60, 60, 60, 60]);
    expect(hi[0]).toBeGreaterThan(lo[0]);
  });
});
