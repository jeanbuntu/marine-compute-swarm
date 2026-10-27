import { describe, expect, it } from 'vitest';
import { MasterSim, defaultMasterParams } from './masterSim';
import { SEA_PRESETS } from './waves';

function run(patch: Partial<ReturnType<typeof defaultMasterParams>>, seconds = 120) {
  const s = new MasterSim({ ...defaultMasterParams(), ...patch });
  for (let t = 0; t < seconds; t += 0.05) s.step(0.05);
  return s;
}
const manualSun = (azDeg: number, elevDeg: number, coverage = 0) => ({
  sun: { ...defaultMasterParams().sun, mode: 'manual' as const, azDeg, elevDeg }, sky: { ...defaultMasterParams().sky, coverage },
});

describe('master simulation', () => {
  it('is deterministic', () => {
    const a = run({ ...manualSun(100, 30) }, 20), b = run({ ...manualSun(100, 30) }, 20);
    expect(a.telemetry.pv.actualW).toBe(b.telemetry.pv.actualW);
  });
  it('tracking beats the fixed 20 degree petals with a low sun in calm water', () => {
    const s = run({ ...manualSun(90, 20), sea: { ...SEA_PRESETS.calm, seed: 1 }, windMs: 3 }, 200);
    expect(s.telemetry.pv.actualW).toBeGreaterThan(s.telemetry.pv.fixedW * 1.05);
    expect(s.telemetry.pv.actualW).toBeLessThanOrEqual(s.telemetry.pv.idealW * 1.001);
  });
  it('petal angles follow the sun side: the west petal rises for an eastern sun', () => {
    const s = run({ ...manualSun(90, 20), sea: { ...SEA_PRESETS.calm, seed: 1 }, windMs: 3 }, 200);
    expect(s.telemetry.tilts.W).toBeGreaterThan(s.telemetry.tilts.E + 20);
  });
  it('ideal is a true upper bound, including under heavy cloud where flat petals win', () => {
    const s = run({ ...manualSun(120, 40, 1), sea: { ...SEA_PRESETS.calm, seed: 1 }, windMs: 3 }, 60);
    expect(s.telemetry.pv.actualW).toBeLessThanOrEqual(s.telemetry.pv.idealW * 1.001);
    const g = run({ ...manualSun(200, 40), windMs: 18 }, 60);
    expect(g.telemetry.pv.actualW).toBeLessThanOrEqual(g.telemetry.pv.idealW * 1.001);
  });
  it('stows in strong wind', () => {
    const s = run({ ...manualSun(90, 40), windMs: 18 }, 120);
    expect(s.telemetry.stowed).toBe(true);
    expect(s.telemetry.tilts.W).toBeLessThan(1);
  });
  it('rough seas demand faster petal motion than calm water', () => {
    const flat = run({ ...manualSun(120, 45), sea: { ...SEA_PRESETS.calm, hsM: 0.02, seed: 2 } }, 90);
    const chop = run({ ...manualSun(120, 45), sea: { ...SEA_PRESETS.chop, seed: 2 } }, 90);
    expect(chop.telemetry.demandDegS).toBeGreaterThan(flat.telemetry.demandDegS * 2);
  });
  it('station keeping holds position against current and wind, and draws power', () => {
    const s = run({ ...manualSun(120, 45), currentEastMs: 0.3, windMs: 8, windFromDeg: 270 }, 400);
    expect(s.telemetry.prop.posErrM).toBeLessThan(2);
    expect(s.telemetry.prop.powerW).toBeGreaterThan(5);
  });
  it('thrust opposes a current that pushes the node east', () => {
    const s = run({ ...manualSun(120, 45), currentEastMs: 0.4, windMs: 0, sea: { ...SEA_PRESETS.calm, hsM: 0.05, seed: 1 } }, 300);
    expect(s.telemetry.prop.force[0]).toBeLessThan(0);
  });
  it('a dodge maneuver moves the node along its heading', () => {
    const s = run({ ...manualSun(120, 45), maneuver: 'dodge', dodgeHeadingDeg: 90, dodgeSpeedMs: 0.3, currentEastMs: 0, currentNorthMs: 0, windMs: 0 }, 200);
    expect(s.pos[0]).toBeGreaterThan(30);
  });
  it('yaw assist only works with a layout that can make yaw torque', () => {
    const base = { ...manualSun(20, 30), yawAssist: true, headingDeg: 0, sea: { ...SEA_PRESETS.calm, seed: 1 } };
    const radial = run({ ...base, layout: 'radial' }, 120), tang = run({ ...base, layout: 'tangential' }, 120);
    expect(radial.telemetry.prop.yawAuthority).toBe(false);
    expect(Math.abs(radial.hull.yaw)).toBeLessThan(0.01);
    expect(tang.telemetry.prop.yawAuthority).toBe(true);
    expect(Math.abs(tang.hull.yaw)).toBeGreaterThan(0.3);
    expect(tang.telemetry.prop.yawBestGainPct).toBeLessThan(5); // petals already capture almost all of it
  });
  it('keeps the first-screen swarm model assumption visible for comparison', () => {
    const s = run({ ...manualSun(180, 60) }, 5);
    expect(s.telemetry.pv.swarmModelW).toBeGreaterThan(0);
  });
});
