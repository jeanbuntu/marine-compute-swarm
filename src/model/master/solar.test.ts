import { describe, expect, it } from 'vitest';
import { bodyToWorld, worldToBody, sunVector, decompose, petalNormalBody, PETAL_DIRS, planeIrradiance, bestTiltDeg, type Attitude } from './solar';

const flat: Attitude = { yaw: 0, pitch: 0, roll: 0 };
const close = (a: number[], b: number[], d = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], d));

describe('frames', () => {
  it('rolls +x up and pitches +z down (three YXZ order)', () => {
    close(bodyToWorld({ yaw: 0, pitch: 0, roll: Math.PI / 2 }, [1, 0, 0]), [0, 1, 0]);
    close(bodyToWorld({ yaw: 0, pitch: Math.PI / 2, roll: 0 }, [0, 0, 1]), [0, -1, 0]);
  });
  it('yaw turns +z toward +x', () => {
    close(bodyToWorld({ yaw: Math.PI / 2, pitch: 0, roll: 0 }, [0, 0, 1]), [1, 0, 0]);
  });
  it('worldToBody inverts bodyToWorld', () => {
    const a: Attitude = { yaw: 0.7, pitch: -0.2, roll: 0.15 };
    close(worldToBody(a, bodyToWorld(a, [0.3, 0.8, -0.5])), [0.3, 0.8, -0.5]);
  });
});

describe('sun vector', () => {
  it('points east for az 90, and south (+z) for az 180', () => {
    close(sunVector(90, 0), [1, 0, 0]);
    close(sunVector(180, 0), [0, 0, 1]);
    close(sunVector(0, 90), [0, 1, 0]);
  });
});

describe('petal sign convention', () => {
  it('positive tilt raises the tip, so the normal leans back over the hull', () => {
    const n = petalNormalBody(PETAL_DIRS.E, (30 * Math.PI) / 180);
    expect(n[0]).toBeLessThan(0);
    expect(n[1]).toBeGreaterThan(0);
  });
  it('a low eastern sun is tracked by raising the WEST petal', () => {
    const sun = sunVector(90, 20);
    const west = bestTiltDeg(flat, PETAL_DIRS.W, sun, { directWm2: 800, diffuseWm2: 100, ghiWm2: 380 }, -40, 80);
    const east = bestTiltDeg(flat, PETAL_DIRS.E, sun, { directWm2: 800, diffuseWm2: 100, ghiWm2: 380 }, -40, 80);
    expect(west).toBeGreaterThan(40);
    expect(east).toBeLessThan(0);
  });
  it('the petal normal can be made to point straight at the sun when unclamped', () => {
    const sun = sunVector(90, 20), irr = { directWm2: 900, diffuseWm2: 0, ghiWm2: 308 };
    const t = bestTiltDeg(flat, PETAL_DIRS.W, sun, irr, -89, 89);
    const n = petalNormalBody(PETAL_DIRS.W, (t * Math.PI) / 180);
    expect(n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]).toBeGreaterThan(0.999);
  });
  it('hull roll is compensated by the petal angle', () => {
    const sun = sunVector(90, 60), irr = { directWm2: 900, diffuseWm2: 0, ghiWm2: 780 };
    const level = bestTiltDeg(flat, PETAL_DIRS.W, sun, irr, -60, 80);
    const rolled = bestTiltDeg({ yaw: 0, pitch: 0, roll: (10 * Math.PI) / 180 }, PETAL_DIRS.W, sun, irr, -60, 80);
    expect(Math.abs(rolled - level)).toBeGreaterThan(5);
  });
});

describe('irradiance', () => {
  it('decomposition conserves global horizontal irradiance', () => {
    const d = decompose(900, 0.7, 40);
    expect(d.directWm2 * Math.sin((40 * Math.PI) / 180) + d.diffuseWm2).toBeCloseTo(d.ghiWm2, 4);
    expect(d.ghiWm2).toBeCloseTo(630, 4);
  });
  it('full shade is all diffuse', () => {
    const d = decompose(900, 0.05, 40);
    expect(d.directWm2 / (d.ghiWm2 || 1)).toBeLessThan(0.1);
  });
  it('a flat plane facing the sun at zenith gets the global value', () => {
    const d = decompose(1000, 1, 90);
    expect(planeIrradiance([0, 1, 0], sunVector(0, 90), d)).toBeCloseTo(d.ghiWm2 + d.ghiWm2 * 0.06 * 0, 3);
  });
  it('a plane facing away from the sun only sees diffuse and reflected light', () => {
    const d = decompose(1000, 1, 30);
    const e = planeIrradiance([-0.866, -0.5, 0], sunVector(90, 30), d);
    expect(e).toBeLessThan(d.diffuseWm2 + 1);
  });
});
