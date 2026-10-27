import { CONFIG_KNOBS, DESIGN_KNOBS, GROUPS } from './knobDefs';
import { ScenarioConfig, defaultConfig } from '../model/config';

test('every config knob maps to a config field with a range inside its schema', () => {
  const d = defaultConfig();
  for (const k of CONFIG_KNOBS) {
    expect(k.key in d).toBe(true);
    expect(ScenarioConfig.safeParse({ [k.key]: k.min }).success).toBe(true);
    expect(ScenarioConfig.safeParse({ [k.key]: k.max }).success).toBe(true);
  }
});

test('every knob has a group, a label and a note', () => {
  for (const k of [...CONFIG_KNOBS, ...DESIGN_KNOBS]) {
    expect(GROUPS).toContain(k.group);
    expect(k.label.length).toBeGreaterThan(0);
    expect(k.note.length).toBeGreaterThan(0);
  }
});
