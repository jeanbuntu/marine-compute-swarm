import { makeSky } from './sky';
import { makeSwarm, stepSwarm, type Swarm, type Vec2 } from './swarm';
import { holdStationNavigator, scriptedNavigator, type Command, type Navigator } from './navigator';
import { simulatedTracker, type SkyFrame, type TrackedCloud } from './tracker';
import type { ScenarioConfig } from './config';

export interface Impact { energyKwh: number; computeTflopH: number; revenueUsd: number; co2AvoidedKg: number }
export interface Comparison { swarm: Impact; stayPut: Impact; gainPct: number }

const TFLOPS_PER_W = 1.68; // EST: data-center inference GPU, dense FP16, per electrical watt
const COMPUTE_CAP_W = { worker: 280, master: 430 }; // compute pod power budgets from the design
const BASE_LOAD_W = { worker: 84, master: 160 }; // non-compute, non-propulsion loads, approx from the design
const DT_S = 30;

function simulate(c: ScenarioConfig, hours: number, startHour: number, nav: Navigator): Impact {
  const sky = makeSky({ seed: c.seed, coverage: c.coverage, windMs: [c.windEastMs, c.windNorthMs], latDeg: c.latDeg, lonDeg: c.lonDeg });
  const tracker = simulatedTracker(sky, { noiseM: c.trackerNoiseM, dropRate: c.trackerDropRate, seed: c.seed });
  const env = { sky, currentMs: [c.currentEastMs, c.currentNorthMs] as Vec2 };
  let swarm: Swarm = makeSwarm(c.nodes, c.spacingM, startHour * 3600);
  let harvestedWh = 0, computeWh = 0;
  let cmds: Command[] = [];
  const steps = Math.max(0, Math.round((hours * 3600) / DT_S));
  for (let i = 0; i < steps; i++) {
    const tracked: Record<string, TrackedCloud[]> = {};
    for (const n of swarm.nodes) {
      const f: SkyFrame = { t: swarm.t, nodeId: n.id, x: n.pos[0], y: n.pos[1], widthPx: 640, heightPx: 640 };
      tracked[n.id] = tracker.track(f);
    }
    const s = sky.sun(swarm.t);
    cmds = nav.decide({
      t: swarm.t, nodes: swarm.nodes, tracked, slots: swarm.slots,
      limits: { maxSpeedMs: c.maxSpeedMs }, sun: { azDeg: s.azDeg, elevDeg: s.elevDeg },
    });
    const r = stepSwarm(swarm, cmds, DT_S, env, c.maxSpeedMs);
    for (const n of swarm.nodes) {
      const surplus = Math.max(0, r.pvW[n.id] - BASE_LOAD_W[n.role] - r.thrustW[n.id]);
      computeWh += (Math.min(surplus, COMPUTE_CAP_W[n.role]) * DT_S) / 3600;
      harvestedWh += (r.pvW[n.id] * DT_S) / 3600;
    }
    swarm = r.swarm;
  }
  const computeKwh = (computeWh / 1000) * c.usableComputeShare;
  const computeTflopH = computeWh * c.usableComputeShare * TFLOPS_PER_W;
  return {
    energyKwh: harvestedWh / 1000, computeTflopH,
    revenueUsd: computeTflopH * c.pricePerTflopHourUsd, co2AvoidedKg: computeKwh * c.gridKgCo2PerKwh,
  };
}

/** Compares the cloud-dodging swarm with one that only holds station, under the same weather. */
export function runScenario(c: ScenarioConfig, hours: number, startHour = 6): Comparison {
  const swarm = simulate(c, hours, startHour, scriptedNavigator());
  const stayPut = simulate(c, hours, startHour, holdStationNavigator());
  const gainPct = stayPut.energyKwh > 0 ? ((swarm.energyKwh - stayPut.energyKwh) / stayPut.energyKwh) * 100 : 0;
  return { swarm, stayPut, gainPct };
}

/** Multiplies per-node impact by node count, and by the number of regions when given (nodes per region). */
export function scaleUp(perNode: Impact, nodes: number, regions: string[]): Impact {
  const k = nodes * Math.max(1, regions.length);
  return {
    energyKwh: perNode.energyKwh * k, computeTflopH: perNode.computeTflopH * k,
    revenueUsd: perNode.revenueUsd * k, co2AvoidedKg: perNode.co2AvoidedKg * k,
  };
}
