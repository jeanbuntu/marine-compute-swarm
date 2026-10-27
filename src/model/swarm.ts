import { RHO_SEA } from './constants';
import { masterDesign, workerDesign } from './nodeDesign';
import { loadW, pvPowerW, stepBattery } from './power';
import type { Command } from './navigator';
import type { NodeDesign } from './parts';
import type { Sky } from './sky';

export type Vec2 = [number, number];
export interface NodeState { id: string; role: 'worker' | 'master'; pos: Vec2; vel: Vec2; socWh: number }
export interface Swarm { t: number; nodes: NodeState[]; slots: Vec2[] }

// Propulsion model (all EST): P = 0.5 * rho * Cd * A * v^3 / eta
const CD = 1.0, FRONTAL_M2 = 0.35, PROP_EFF = 0.4;
const WH_PER_KG = 100; // LFP pack level, EST
export const thrustPowerW = (speedMs: number) => (0.5 * RHO_SEA * CD * FRONTAL_M2 * Math.abs(speedMs) ** 3) / PROP_EFF;

const DESIGNS: Record<'worker' | 'master', NodeDesign> = { worker: workerDesign(), master: masterDesign() };
export const batteryCapacityWh = (d: NodeDesign) =>
  d.parts.filter((p) => p.id.startsWith('battery')).reduce((s, p) => s + p.massKg * WH_PER_KG, 0);

const HEX: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
/** Hexagonal lattice slots, filled ring by ring from the center. */
export function hexSlots(n: number, spacingM: number): Vec2[] {
  const axial: [number, number][] = [[0, 0]];
  for (let k = 1; axial.length < n; k++) {
    let q = -k, r = k;
    for (let side = 0; side < 6; side++) {
      for (let j = 0; j < k; j++) { axial.push([q, r]); q += HEX[side][0]; r += HEX[side][1]; }
    }
  }
  return axial.slice(0, n).map(([q, r]) => [spacingM * (q + r / 2), spacingM * ((Math.sqrt(3) / 2) * r)] as Vec2);
}

export type Designs = Record<'worker' | 'master', NodeDesign>;

export function makeSwarm(n: number, spacingM: number, t = 0, designs: Designs = DESIGNS): Swarm {
  const slots = hexSlots(Math.max(1, n), spacingM);
  const nodes: NodeState[] = slots.map((p, i) => {
    const role = i === 0 ? 'master' : 'worker';
    return { id: `n${i}`, role, pos: [...p] as Vec2, vel: [0, 0], socWh: 0.6 * batteryCapacityWh(designs[role]) };
  });
  return { t, nodes, slots };
}

export interface StepEnv { sky: Sky; currentMs: Vec2; designs?: Designs }
export interface StepResult { swarm: Swarm; thrustW: Record<string, number>; pvW: Record<string, number>; loadW: Record<string, number> }

/** Commands are desired ground velocities; the node thrusts against the current to achieve them. */
export function stepSwarm(s: Swarm, cmds: Command[], dtS: number, env: StepEnv, maxSpeedMs = 1.5, t = s.t): StepResult {
  const byId = new Map(cmds.map((c) => [c.nodeId, c]));
  const thrustW: Record<string, number> = {}, pvW: Record<string, number> = {}, loads: Record<string, number> = {};
  const [cx, cy] = env.currentMs;
  const ghi = env.sky.sun(t).ghiWm2;
  const nodes = s.nodes.map((n) => {
    const want = byId.get(n.id)?.velocityMs ?? ([n.vel[0], n.vel[1]] as Vec2);
    let wx = (Number.isFinite(want[0]) ? want[0] : 0) - cx, wy = (Number.isFinite(want[1]) ? want[1] : 0) - cy;
    const sp = Math.hypot(wx, wy);
    if (sp > maxSpeedMs) { wx *= maxSpeedMs / sp; wy *= maxSpeedMs / sp; }
    const speed = Math.hypot(wx, wy);
    const d = (env.designs ?? DESIGNS)[n.role];
    const thrust = thrustPowerW(speed);
    const pv = pvPowerW(d, ghi, env.sky.shadowFactor(t, n.pos[0], n.pos[1]));
    const load = loadW(d, thrust);
    thrustW[n.id] = thrust; pvW[n.id] = pv; loads[n.id] = load;
    const vel: Vec2 = [wx + cx, wy + cy];
    return {
      ...n, vel, pos: [n.pos[0] + vel[0] * dtS, n.pos[1] + vel[1] * dtS] as Vec2,
      socWh: stepBattery(n.socWh, batteryCapacityWh(d), pv - load, dtS),
    };
  });
  return { swarm: { t: t + dtS, nodes, slots: s.slots }, thrustW, pvW, loadW: loads };
}
