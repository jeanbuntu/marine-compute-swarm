import { GPU, COMPUTE_SIZE, PETAL_PAIRS, PETAL_IDS, petalGeometry, deckAreaM2, hullSection } from './hardware';
import { workerDesign, masterDesign, pvAreaM2 } from './nodeDesign';
import { pvBreakdown } from './master/masterSim';
import { uniformTilts, petalTargets, actuate, actuatorDemandW } from './master/petals';
import { sunVector, decompose } from './master/solar';
import { pvPowerW, loadW } from './power';

it('moving petals reserve space inside the flat octagonal annulus', () => {
  const d = workerDesign(), g = petalGeometry(d), k = Math.tan(Math.PI / 8);
  const annulus = 8 * k * ((g.root + g.length) ** 2 - g.root ** 2);
  expect(8 * g.area).toBeLessThan(annulus * 0.92);
  expect(8 * g.area).toBeGreaterThan(annulus * 0.80);
  expect(g.activeArea).toBeLessThan(g.area);
  expect(g.centroid).toBeGreaterThan(g.length / 2);
});

it.each([workerDesign(), masterDesign()])('cards retain manufacturer dimensions inside the host enclosure ($role)', d => {
  const pod = d.parts.find(p => p.id === 'compute-pod')!;
  const cards = d.parts.filter(p => p.id.startsWith('gpu-'));
  expect(cards).toHaveLength(2);
  for (const card of cards) {
    expect(card.size).toEqual([0.02032, 0.06890, 0.16854]);
    expect(card.powerW).toBe(72);
    for (const i of [0, 1, 2]) expect(Math.abs(card.pos[i] - pod.pos[i]) + card.size[i] / 2).toBeLessThan(COMPUTE_SIZE[i] / 2 - 0.01);
  }
  expect(pod.powerW + cards.reduce((s, p) => s + p.powerW, 0)).toBe(280);
});

it('all views agree on collecting area and overhead under a flat overhead sun', () => {
  const d = workerDesign(), irr = decompose(1000, 1, 90);
  const detailed = pvBreakdown(d, { yaw: 0, pitch: 0, roll: 0 }, uniformTilts(0), sunVector(0, 90), irr);
  expect(detailed.total).toBeCloseTo(pvPowerW(d, 1000, 1), 8);
  expect(pvAreaM2(d)).toBeLessThan(8 * petalGeometry(d).area + deckAreaM2(d));
  expect(d.parts.filter(p => p.subsystem === 'petals').reduce((s,p) => s+p.powerW,0)).toBe(24);
  expect(loadW(d, 0)).toBeGreaterThan(2 * GPU.powerW);
});

it('four paired drives keep eight angles linked through targets and rate limits', () => {
  const d = workerDesign(), cur = uniformTilts(0);
  const target = petalTargets('track', { att: { yaw: 0, pitch: 0, roll: 0 }, sun: sunVector(95, 20), irr: decompose(800, 1, 20), minDeg: -20, maxDeg: 75, winterStow: false });
  const actual = actuate(cur, target, 0.1, 6, -20, 75).tilts;
  expect(PETAL_PAIRS.flat().slice().sort()).toEqual(PETAL_IDS.slice().sort());
  for (const [a,b] of PETAL_PAIRS) { expect(target[a]).toBe(target[b]); expect(actual[a]).toBe(actual[b]); }
  expect(actuatorDemandW(d, cur, cur, 6, 6)).toBe(0);
  expect(actuatorDemandW(d, cur, uniformTilts(60), 6, 6)).toBeGreaterThan(24);
});

it('radiused sections displace less than bounding boxes and keep a positive waterplane moment', () => {
  const section = hullSection(1.6);
  expect(section.area).toBeLessThan(1.6 ** 2);
  expect(section.area).toBeGreaterThan(0.99 * 1.6 ** 2);
  expect(section.inertia).toBeGreaterThan(0);
  expect(section.inertia).toBeLessThan(1.6 ** 4 / 12);
});
