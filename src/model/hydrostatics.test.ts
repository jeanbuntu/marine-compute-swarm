import { evaluate, evaluateWorst, partPosition, PETAL_TILT_DEG } from './hydrostatics';
import { workerDesign, masterDesign } from './nodeDesign';
import type { NodeDesign, Part } from './parts';

const withPart = (d: NodeDesign, p: Partial<Part> & { id: string }): NodeDesign => ({
  ...d,
  parts: d.parts.map((x) => (x.id === p.id ? { ...x, ...p } : x)),
});

describe('hydrostatics', () => {
  test.each([['worker', workerDesign()], ['master', masterDesign()]])('%s default design is acceptable', (_n, d) => {
    const r = evaluateWorst(d);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.reservePct).toBeGreaterThanOrEqual(0.5);
    expect(r.gmM).toBeGreaterThanOrEqual(0.15);
    expect(r.heelDeg).toBeLessThanOrEqual(10);
    expect(r.freeboardM).toBeGreaterThan(0);
  });

  test('a 2000 kg extra load sinks the node', () => {
    const d = workerDesign();
    const heavy: NodeDesign = { ...d, parts: [...d.parts, { ...d.parts[0], id: 'lead', massKg: 2000 }] };
    const r = evaluateWorst(heavy);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v === 'sinks' || v === 'reserve')).toBe(true);
  });

  test('moving the heavy parts high breaks stability', () => {
    let d = withPart(workerDesign(), { id: 'battery', pos: [0, 2.5, 0] });
    d = withPart(d, { id: 'ballast', pos: [0, 2.5, 0] });
    const r = evaluateWorst(d);
    expect(r.ok).toBe(false);
    expect(r.violations).toContain('stability');
  });

  test('deployed and stowed petals give different results and the worst governs', () => {
    const d = workerDesign();
    const dep = evaluate(d, 'deployed');
    const stw = evaluate(d, 'stowed');
    expect(dep.gmM).not.toBeCloseTo(stw.gmM, 4);
    const worst = evaluateWorst(d);
    expect(worst.gmM).toBeCloseTo(Math.min(dep.gmM, stw.gmM), 6);
    expect(worst.heelDeg).toBeCloseTo(Math.max(dep.heelDeg, stw.heelDeg), 6);
  });

  test('non-finite or negative mass returns finite fields and fails', () => {
    for (const bad of [NaN, -5, Infinity]) {
      const r = evaluateWorst(withPart(workerDesign(), { id: 'battery', massKg: bad }));
      expect(r.ok).toBe(false);
      for (const k of ['massKg', 'draftM', 'freeboardM', 'reservePct', 'gmM', 'heelDeg'] as const) {
        expect(Number.isFinite(r[k])).toBe(true);
      }
    }
  });
});


test('deployed panel inner edges meet their hinges at every panel length', () => {
  for (const length of [0.4, 1.1, 2]) {
    const d = { ...workerDesign(), petalLengthM: length };
    const angle = PETAL_TILT_DEG * Math.PI / 180;
    for (const p of d.parts.filter(p => p.id.startsWith('petal-'))) {
      const pos = partPosition(d, p, 'deployed');
      const axis = p.pos[0] ? 0 : 2;
      expect(Math.abs(pos[axis]) - Math.cos(angle) * length / 2).toBeCloseTo(d.hullSideM / 2);
      expect(pos[1] - Math.sin(angle) * length / 2).toBeCloseTo(d.keelDepthM + d.hullDepthM + 0.08);
    }
  }
});


test('stowed panels have separate layers in both the mass model and the scene', () => {
  const d = workerDesign();
  const ps = d.parts.filter(p => p.id.startsWith('petal-'));
  const heights = ps.map(p => partPosition(d, p, 'stowed')[1]);
  for (let i = 1; i < heights.length; i++) expect(heights[i] - heights[i - 1]).toBeGreaterThanOrEqual(0.05);
});
