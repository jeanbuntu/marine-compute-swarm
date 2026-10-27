import { makeSky, type SkyConfig, DOMAIN_M } from './sky';

const cfg = (o: Partial<SkyConfig> = {}): SkyConfig => ({ seed: 7, coverage: 0.5, windMs: [6, 2], latDeg: 33.7, lonDeg: -118.5, ...o });
const NOON = 12 * 3600;

function shadowedFraction(c: number): number {
  const sky = makeSky(cfg({ coverage: c }));
  let n = 0, hit = 0;
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
    const x = -8000 + (16000 * i) / 39, y = -8000 + (16000 * j) / 39;
    n++;
    if (sky.shadowFactor(NOON, x, y) < 0.9) hit++;
  }
  return hit / n;
}

describe('sky', () => {
  test('same config gives identical clouds', () => {
    expect(makeSky(cfg()).clouds(100)).toEqual(makeSky(cfg()).clouds(100));
  });

  test('clouds advect with the wind', () => {
    const sky = makeSky(cfg());
    const a = sky.clouds(0), b = sky.clouds(600);
    const wrap = (v: number) => ((v + DOMAIN_M / 2) % DOMAIN_M + DOMAIN_M) % DOMAIN_M - DOMAIN_M / 2;
    for (const [i, c] of a.entries()) {
      expect(wrap(b[i].x - c.x - 6 * 600)).toBeCloseTo(0, 3);
      expect(wrap(b[i].y - c.y - 2 * 600)).toBeCloseTo(0, 3);
    }
  });

  test('coverage 0 has no shadow anywhere', () => {
    const sky = makeSky(cfg({ coverage: 0 }));
    expect(sky.clouds(0)).toEqual([]);
    expect(sky.shadowFactor(NOON, 123, -456)).toBe(1);
  });

  test('coverage 1 shades everything at midday', () => {
    const sky = makeSky(cfg({ coverage: 1 }));
    for (const [x, y] of [[0, 0], [5000, -3000], [-7000, 7000]]) expect(sky.shadowFactor(NOON, x, y)).toBeLessThan(0.6);
  });

  test.each([0.3, 0.7])('shadowed fraction tracks coverage %s', (c) => {
    expect(Math.abs(shadowedFraction(c) - c)).toBeLessThan(0.1);
  });

  test('sun is down at midnight with zero irradiance, up at noon', () => {
    const sky = makeSky(cfg());
    expect(sky.sun(0).elevDeg).toBeLessThan(0);
    expect(sky.sun(0).ghiWm2).toBe(0);
    expect(sky.sun(NOON).elevDeg).toBeGreaterThan(60);
    expect(sky.sun(NOON).ghiWm2).toBeGreaterThan(800);
  });
});
