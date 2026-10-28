import { applyEdit } from './solver';
import { evaluateWorst } from './hydrostatics';
import { workerDesign } from './nodeDesign';

describe('applyEdit', () => {
  test('a small safe edit is ok', () => {
    const o = applyEdit(workerDesign(), { knob: 'ballastKg', value: 100 });
    expect(o.status).toBe('ok');
    expect(evaluateWorst(o.design).ok).toBe(true);
  });

  test('an unstable battery edit returns a recommendation that works', () => {
    const o = applyEdit(workerDesign(), { partId: 'battery', field: 'massKg', value: 1600 });
    expect(o.status).toBe('recommend');
    if (o.status !== 'recommend') return;
    expect(o.changes[0]).toEqual({ partId: 'battery', field: 'massKg', value: 1600 });
    expect(o.changes.length).toBeGreaterThan(1);
    expect(o.message).toMatch(/hydrodynamic stability/);
    expect(evaluateWorst(o.design).ok).toBe(true);
  });

  test('a huge edit is infeasible with a closest value', () => {
    const o = applyEdit(workerDesign(), { knob: 'ballastKg', value: 1e6 });
    expect(o.status).toBe('infeasible');
    if (o.status !== 'infeasible') return;
    expect(o.closest).toBeDefined();
    expect(evaluateWorst(o.design).ok).toBe(true);
  });

  test.each([NaN, -5, Infinity])('invalid value %s is rejected without changing the design', (v) => {
    const d = workerDesign();
    const before = JSON.stringify(d);
    const o = applyEdit(d, { knob: 'batteryKg', value: v });
    expect(o.status).toBe('infeasible');
    expect(o.status === 'infeasible' && /invalid|stability/i.test(o.message)).toBe(true);
    expect(JSON.stringify(d)).toBe(before);
    expect(JSON.stringify(o.design)).toBe(before);
  });

  test('the input design is never mutated by a recommendation', () => {
    const d = workerDesign();
    const before = JSON.stringify(d);
    applyEdit(d, { partId: 'battery', field: 'massKg', value: 1600 });
    expect(JSON.stringify(d)).toBe(before);
  });
});
