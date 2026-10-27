import { Sim } from './sim';
import { defaultConfig } from '../model/config';

describe('Sim', () => {
  test('step advances time and keeps nodes finite', () => {
    const s = new Sim(defaultConfig(), 9 * 3600);
    for (let i = 0; i < 100; i++) s.step(5);
    expect(s.timeS).toBeCloseTo(9 * 3600 + 500, 6);
    for (const n of s.swarm.nodes) expect(n.pos.every(Number.isFinite)).toBe(true);
  });

  test('decisions refresh about every 30 simulated seconds', () => {
    const s = new Sim(defaultConfig(), 9 * 3600);
    s.step(1);
    const first = s.lastCmds;
    s.step(10);
    expect(s.lastCmds).toBe(first);
    s.step(30);
    expect(s.lastCmds).not.toBe(first);
  });

  test('rebuild keeps the clock and resets the formation', () => {
    const s = new Sim(defaultConfig(), 9 * 3600);
    s.step(60);
    s.rebuild({ ...defaultConfig(), nodes: 5 });
    expect(s.timeS).toBeCloseTo(9 * 3600 + 60, 6);
    expect(s.swarm.nodes.length).toBe(5);
  });

  test('a large frame gap is split into stable steps', () => {
    const s = new Sim(defaultConfig(), 9 * 3600);
    s.step(600);
    expect(s.timeS).toBeCloseTo(9 * 3600 + 600, 6);
    for (const n of s.swarm.nodes) expect(Math.hypot(...n.pos)).toBeLessThan(5000);
  });
});
