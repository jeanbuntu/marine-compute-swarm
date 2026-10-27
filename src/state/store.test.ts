import { useStore } from './store';
import { defaultConfig, ScenarioConfig } from '../model/config';
import { evaluateWorst } from '../model/hydrostatics';

beforeEach(() => useStore.getState().reset());

describe('config', () => {
  test('default config parses', () => expect(() => ScenarioConfig.parse(defaultConfig())).not.toThrow());
  test('invalid coverage is rejected', () => expect(ScenarioConfig.safeParse({ coverage: 2 }).success).toBe(false));
  test('setConfig rejects invalid patches and keeps the old value', () => {
    const before = useStore.getState().config.coverage;
    expect(useStore.getState().setConfig({ coverage: 2 })).toBe(false);
    expect(useStore.getState().config.coverage).toBe(before);
    expect(useStore.getState().setConfig({ coverage: 0.2 })).toBe(true);
    expect(useStore.getState().config.coverage).toBe(0.2);
  });
});

describe('ui defaults', () => {
  test('drawer starts closed', () => expect(useStore.getState().drawerOpen).toBe(false));
});

describe('design edits', () => {
  test('unstable edit leaves the design unchanged and stores the recommendation', () => {
    const before = JSON.stringify(useStore.getState().designs.worker);
    const o = useStore.getState().applyDesignEdit('worker', { partId: 'battery', field: 'massKg', value: 1200 });
    expect(o.status).toBe('recommend');
    expect(JSON.stringify(useStore.getState().designs.worker)).toBe(before);
    expect(useStore.getState().lastOutcome?.outcome.status).toBe('recommend');
  });

  test('accepting the recommendation applies a stable design', () => {
    useStore.getState().applyDesignEdit('worker', { partId: 'battery', field: 'massKg', value: 1200 });
    useStore.getState().acceptRecommendation();
    const d = useStore.getState().designs.worker;
    expect(d.parts.find((p) => p.id === 'battery')!.massKg).toBe(1200);
    expect(evaluateWorst(d).ok).toBe(true);
    expect(useStore.getState().lastOutcome).toBeNull();
  });

  test('a safe edit applies directly', () => {
    const o = useStore.getState().applyDesignEdit('master', { knob: 'ballastKg', value: 100 });
    expect(o.status).toBe('ok');
    expect(useStore.getState().designs.master.parts.find((p) => p.id === 'ballast')!.massKg).toBe(100);
  });
});
