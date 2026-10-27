import { simulatedTracker, samTrackerPlaceholder, FOOTPRINT_M, type SkyFrame } from './tracker';
import { makeSky } from './sky';

const sky = makeSky({ seed: 7, coverage: 0.6, windMs: [6, 2], latDeg: 33.7, lonDeg: -118.5 });
const frame = (t: number): SkyFrame => ({ t, nodeId: 'n1', x: 0, y: 0, widthPx: 640, heightPx: 640 });
const clean = { noiseM: 0, dropRate: 0, seed: 1 };

describe('simulated tracker', () => {
  test('ids stay stable across consecutive frames', () => {
    const tr = simulatedTracker(sky, clean);
    const a = tr.track(frame(1000)).map((c) => c.id);
    const b = tr.track(frame(1005)).map((c) => c.id);
    const shared = a.filter((id) => b.includes(id));
    expect(a.length).toBeGreaterThan(0);
    expect(shared.length).toBeGreaterThanOrEqual(Math.floor(a.length * 0.8));
  });

  test('velocity direction matches the wind', () => {
    const out = simulatedTracker(sky, clean).track(frame(1000));
    const windAng = Math.atan2(2, 6);
    for (const c of out) {
      const ang = Math.atan2(c.velocityMs[1], c.velocityMs[0]);
      expect(Math.abs(ang - windAng) * (180 / Math.PI)).toBeLessThan(15);
    }
  });

  test('no noise and no drops returns every cloud in the footprint', () => {
    const t = 1000;
    const expected = sky.clouds(t).filter((c) => Math.hypot(c.x, c.y) < FOOTPRINT_M + c.radiusM).length;
    expect(simulatedTracker(sky, clean).track(frame(t)).length).toBe(expected);
  });

  test('dropRate 1 returns nothing without error', () => {
    expect(simulatedTracker(sky, { ...clean, dropRate: 1 }).track(frame(1000))).toEqual([]);
  });

  test('bounding boxes sit within a plausible pixel range', () => {
    for (const c of simulatedTracker(sky, clean).track(frame(1000))) expect(c.bbox[2]).toBeGreaterThan(c.bbox[0]);
  });
});

describe('SAM 3.1 placeholder', () => {
  test('throws until connected', () => {
    expect(() => samTrackerPlaceholder().track(frame(0))).toThrow('SAM 3.1 not connected');
  });
});
