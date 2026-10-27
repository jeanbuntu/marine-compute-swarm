import type { NodeState, Vec2 } from './swarm';
import type { TrackedCloud } from './tracker';

export interface Observation {
  t: number;
  nodes: NodeState[];
  tracked: Record<string, TrackedCloud[]>;
  slots: Vec2[]; // parallel to nodes
  limits: { maxSpeedMs: number; leashM?: number };
  sun?: { azDeg: number; elevDeg: number };
}
/** Desired ground velocity for one node. */
export interface Command { nodeId: string; velocityMs: Vec2; reason: string }
export interface Navigator { decide(o: Observation): Command[] }

const HORIZON_S = 120;
const ASSUMED_CLOUD_ALT_M = 1000; // the tracker sees clouds from below and cannot measure altitude
const RETURN_GAIN = 0.05; // 1/s toward the slot
const DEFAULT_LEASH_M = 400;
const RAD = Math.PI / 180;

function toward(from: Vec2, to: Vec2, gain: number, cap: number): Vec2 {
  const dx = (to[0] - from[0]) * gain, dy = (to[1] - from[1]) * gain;
  const m = Math.hypot(dx, dy);
  return m > cap ? [(dx / m) * cap, (dy / m) * cap] : [dx, dy];
}

/** Baseline: stay on the slot, never react to clouds. */
export function holdStationNavigator(): Navigator {
  return {
    decide: (o) => o.nodes.map((n, i) => ({ nodeId: n.id, velocityMs: toward(n.pos, o.slots[i], RETURN_GAIN, o.limits.maxSpeedMs), reason: 'holding station' })),
  };
}

/** Moves cross-wind out of any shadow predicted within the horizon, within a leash of the slot. */
export function scriptedNavigator(): Navigator {
  return {
    decide(o) {
      const sun = o.sun ?? { azDeg: 180, elevDeg: 60 };
      const throwM = ASSUMED_CLOUD_ALT_M / Math.tan(Math.max(sun.elevDeg, 5) * RAD);
      const off: Vec2 = [-Math.sin(sun.azDeg * RAD) * throwM, -Math.cos(sun.azDeg * RAD) * throwM];
      const cap = o.limits.maxSpeedMs, leash = o.limits.leashM ?? DEFAULT_LEASH_M;
      return o.nodes.map((n, i) => {
        const slot = o.slots[i];
        if (Math.hypot(n.pos[0] - slot[0], n.pos[1] - slot[1]) > leash) {
          return { nodeId: n.id, velocityMs: toward(n.pos, slot, 1, cap), reason: 'beyond leash, returning to slot' };
        }
        let worst: { clearance: number; away: Vec2; cloudId: number } | null = null;
        for (const c of o.tracked[n.id] ?? []) {
          const [vx, vy] = c.velocityMs, v2 = vx * vx + vy * vy;
          const px = c.centroidM[0] + off[0] - n.pos[0], py = c.centroidM[1] + off[1] - n.pos[1];
          const tStar = v2 > 0 ? Math.min(HORIZON_S, Math.max(0, -(px * vx + py * vy) / v2)) : 0;
          const qx = px + vx * tStar, qy = py + vy * tStar; // cloud shadow minus node at closest approach
          const dist = Math.hypot(qx, qy);
          const cloudR = c.radiusM;
          if (dist < cloudR * 0.9) {
            const clearance = cloudR * 0.9 - dist;
            if (!worst || clearance > worst.clearance) {
              // Escape cross-wind: along the perpendicular to the cloud's motion, away from the path.
              const vm = Math.sqrt(v2) || 1;
              const perp: Vec2 = [-vy / vm, vx / vm];
              const side = qx * perp[0] + qy * perp[1]; // shadow offset along perp; move opposite
              const sgn = side > 0 ? -1 : 1;
              worst = { clearance, away: [perp[0] * sgn, perp[1] * sgn], cloudId: c.id };
            }
          }
        }
        if (worst) {
          return { nodeId: n.id, velocityMs: [worst.away[0] * cap, worst.away[1] * cap] as Vec2, reason: `dodging shadow of cloud ${worst.cloudId}` };
        }
        return { nodeId: n.id, velocityMs: toward(n.pos, slot, RETURN_GAIN, cap), reason: 'sky clear, holding station' };
      });
    },
  };
}

/** Seam for the model-driven navigation harness; holds position until connected. */
export function agentNavigatorStub(): Navigator {
  return { decide: (o) => o.nodes.map((n) => ({ nodeId: n.id, velocityMs: [0, 0] as Vec2, reason: 'agent not connected' })) };
}
