import { useStore } from './store';
import { submitEdit, acceptRecommendation, editingRole } from './editor';
import { evaluateWorst } from '../model/hydrostatics';

beforeEach(() => {
  useStore.getState().reset();
  useStore.getState().explode('n0');
});

describe('editor', () => {
  test('edits target the role of the exploded node', () => {
    expect(editingRole()).toBe('master');
    useStore.getState().explode('n3');
    expect(editingRole()).toBe('worker');
  });

  test('an impossible edit is not applied and says why', () => {
    const before = JSON.stringify(useStore.getState().designs.master);
    const r = submitEdit({ partId: 'battery', field: 'massKg', value: 1e6 });
    expect(r.applied).toBe(false);
    expect(r.message).toMatch(/stability/);
    expect(JSON.stringify(useStore.getState().designs.master)).toBe(before);
  });

  test('a recommendable edit returns changes and accepting them applies a stable design', () => {
    const r = submitEdit({ partId: 'battery', field: 'massKg', value: 1500 });
    expect(r.applied).toBe(false);
    expect(r.recommendation && r.recommendation.length).toBeGreaterThan(1);
    acceptRecommendation();
    const d = useStore.getState().designs.master;
    expect(d.parts.find((p) => p.id === 'battery')!.massKg).toBe(1500);
    expect(evaluateWorst(d).ok).toBe(true);
  });

  test('a safe edit applies', () => {
    const r = submitEdit({ partId: 'ballast', field: 'massKg', value: 120 });
    expect(r.applied).toBe(true);
  });

  test('NaN is rejected without changing anything', () => {
    const r = submitEdit({ partId: 'battery', field: 'massKg', value: NaN });
    expect(r.applied).toBe(false);
    expect(r.message).toMatch(/invalid|stability/i);
  });
});
