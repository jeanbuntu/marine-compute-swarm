import { makeSwarm, stepSwarm, thrustPowerW, hexSlots } from './swarm';
import { scriptedNavigator, agentNavigatorStub, holdStationNavigator, type Observation } from './navigator';
import { makeSky } from './sky';
import type { TrackedCloud } from './tracker';

const sky = makeSky({ seed: 7, coverage: 0.5, windMs: [6, 2], latDeg: 33.7, lonDeg: -118.5 });
const env = { sky, currentMs: [0.1, -0.05] as [number, number] };

describe('thrust power', () => {
  test('scales with the cube of speed', () => {
    expect(thrustPowerW(1.0) / thrustPowerW(0.5)).toBeCloseTo(8, 6);
    expect(thrustPowerW(0)).toBe(0);
  });
});

describe('swarm construction', () => {
  test('node 0 is the master near the center', () => {
    const s = makeSwarm(7, 30);
    expect(s.nodes[0].role).toBe('master');
    expect(s.nodes.slice(1).every((n) => n.role === 'worker')).toBe(true);
    expect(Math.hypot(...s.nodes[0].pos)).toBeLessThan(1e-9);
    expect(hexSlots(7, 30).length).toBe(7);
  });
  test('a single node swarm is a lone master and steps', () => {
    const s = makeSwarm(1, 30);
    expect(s.nodes.length).toBe(1);
    const r = stepSwarm(s, [], 10, env);
    expect(r.swarm.nodes.length).toBe(1);
  });
  test('100 nodes step in under 50 ms', () => {
    const s = makeSwarm(100, 30);
    stepSwarm(s, [], 10, env);
    const t0 = performance.now();
    stepSwarm(s, [], 10, env);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe('stepping', () => {
  test('speed through water never exceeds the cap and energy tracks thrust', () => {
    const s = makeSwarm(2, 30);
    const cmds = s.nodes.map((n) => ({ nodeId: n.id, velocityMs: [50, 0] as [number, number], reason: 'test' }));
    const r = stepSwarm(s, cmds, 10, env, 1.5);
    for (const n of r.swarm.nodes) expect(Math.hypot(n.vel[0] - env.currentMs[0], n.vel[1] - env.currentMs[1])).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(r.thrustW[s.nodes[0].id]).toBeCloseTo(thrustPowerW(1.5), 6);
  });
  test('daytime PV is reported per node', () => {
    const r = stepSwarm(makeSwarm(3, 30), [], 10, env, 1.5, 12 * 3600);
    expect(Object.keys(r.pvW).length).toBe(3);
  });
});

describe('navigators', () => {
  const cloud: TrackedCloud = { id: 1, bbox: [0, 0, 1, 1], centroidM: [-200, 0], radiusM: 400, velocityMs: [6, 0], opacity: 0.8, confidence: 1 };
  const obs = (tracked: TrackedCloud[]): Observation => ({
    t: 0, nodes: [{ id: 'n0', role: 'worker', pos: [0, 0], vel: [0, 0], socWh: 5000 }],
    tracked: { n0: tracked }, slots: [[0, 0]], limits: { maxSpeedMs: 1.5 }, sun: { azDeg: 180, elevDeg: 90 },
  });
  test('scripted navigator moves cross-wind out of an incoming shadow', () => {
    const [c] = scriptedNavigator().decide(obs([cloud]));
    expect(Math.abs(c.velocityMs[1])).toBeGreaterThan(Math.abs(c.velocityMs[0]));
    expect(Math.hypot(...c.velocityMs)).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(c.reason.length).toBeGreaterThan(3);
  });
  test('with a clear sky the scripted navigator holds station', () => {
    const [c] = scriptedNavigator().decide(obs([]));
    expect(Math.hypot(...c.velocityMs)).toBeLessThan(1e-9);
  });
  test('agent stub returns one hold per node', () => {
    const cmds = agentNavigatorStub().decide(obs([cloud]));
    expect(cmds.length).toBe(1);
    expect(cmds[0].velocityMs).toEqual([0, 0]);
    expect(cmds[0].reason).toBe('agent not connected');
  });
  test('hold navigator never dodges', () => {
    const [c] = holdStationNavigator().decide(obs([cloud]));
    expect(Math.hypot(...c.velocityMs)).toBeLessThan(1e-9);
  });
});
