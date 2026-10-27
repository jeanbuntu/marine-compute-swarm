import { describe, expect, it } from 'vitest';
import { masterDesign } from '../nodeDesign';
import { hullProps, initialHull, stepHull } from './hull';
import { makeSea, SEA_PRESETS } from './waves';

const p = hullProps(masterDesign());
const noForce = { biasRoll: 0, biasPitch: 0, windSlope: [0, 0] as [number, number] };

function run(sea: ReturnType<typeof makeSea>, seconds: number, f = noForce) {
  let s = initialHull(), maxRoll = 0, maxHeave = 0;
  for (let t = 0; t < seconds; t += 0.02) {
    s = stepHull(s, p, sea, 0, 0, t, f, 0.02);
    if (t > 20) { maxRoll = Math.max(maxRoll, Math.abs(s.roll)); maxHeave = Math.max(maxHeave, Math.abs(s.heave)); }
  }
  return { maxRollDeg: (maxRoll * 180) / Math.PI, maxHeave };
}

describe('hull response', () => {
  it('has physically plausible natural periods', () => {
    expect(p.heaveOmega).toBeGreaterThan(2); expect(p.heaveOmega).toBeLessThan(8);
    expect(p.rollOmega).toBeGreaterThan(1); expect(p.rollOmega).toBeLessThan(6);
  });
  it('sits level in a flat sea', () => {
    const r = run(makeSea({ ...SEA_PRESETS.calm, hsM: 0, seed: 1 }), 30);
    expect(r.maxRollDeg).toBeLessThan(0.01);
  });
  it('moves more in a storm than in calm water', () => {
    const calm = run(makeSea({ ...SEA_PRESETS.calm, seed: 1 }), 120), storm = run(makeSea({ ...SEA_PRESETS.storm, seed: 1 }), 120);
    expect(storm.maxRollDeg).toBeGreaterThan(calm.maxRollDeg * 1.5);
    expect(storm.maxHeave).toBeGreaterThan(calm.maxHeave * 3);
  });
  it('settles to a static heel from a bias', () => {
    const r = run(makeSea({ ...SEA_PRESETS.calm, hsM: 0, seed: 1 }), 60, { ...noForce, biasRoll: 0.1 });
    expect(r.maxRollDeg).toBeGreaterThan(5);
  });
  it('follows the surface slope in long swell: crest to the east raises the east side', () => {
    const sea = makeSea({ hsM: 1.5, tpS: 7, headingDeg: 90, spreadDeg: 0, seed: 4 });
    let s = initialHull(), sign = 0;
    for (let t = 0; t < 60; t += 0.02) {
      s = stepHull(s, p, sea, 0, 0, t, noForce, 0.02);
      if (t > 30 && Math.abs(sea.slope(0, 0, t)[0]) > 0.02) sign += Math.sign(sea.slope(0, 0, t)[0]) === Math.sign(s.roll) ? 1 : -1;
    }
    expect(sign).toBeGreaterThan(0);
  });
});
