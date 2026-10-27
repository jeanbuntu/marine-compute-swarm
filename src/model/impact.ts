import { makeSky } from './sky';
import { makeSwarm, stepSwarm, type Designs, type Swarm, type Vec2 } from './swarm';
import { masterDesign, workerDesign } from './nodeDesign';
import type { NodeDesign } from './parts';
import { holdStationNavigator, scriptedNavigator, type Command, type Navigator } from './navigator';
import { simulatedTracker, type SkyFrame, type TrackedCloud } from './tracker';
import type { ScenarioConfig } from './config';

export interface Impact { energyKwh: number; computeTflopH: number; revenueUsd: number; co2AvoidedKg: number }
export interface Comparison { swarm: Impact; stayPut: Impact; gainPct: number }

const TFLOPS_PER_W = 1.68; // EST: data-center inference GPU, dense FP16, per electrical watt
/** Compute pod power budget: the sum of compute parts in the design. */
const computeCapW = (d: NodeDesign) => d.parts.filter((p) => p.subsystem === 'compute').reduce((s, p) => s + p.powerW, 0);
/** Fixed loads that are neither compute nor propulsion. */
const baseLoadW = (d: NodeDesign) => d.parts.filter((p) => p.subsystem !== 'compute' && p.subsystem !== 'propulsion').reduce((s, p) => s + p.powerW, 0);
const DT_S = 30;

function simulate(c: ScenarioConfig, hours: number, startHour: number, nav: Navigator, designs: Designs): Impact {
  const sky = makeSky({ seed: c.seed, coverage: c.coverage, windMs: [c.windEastMs, c.windNorthMs], latDeg: c.latDeg, lonDeg: c.lonDeg });
  const tracker = simulatedTracker(sky, { noiseM: c.trackerNoiseM, dropRate: c.trackerDropRate, seed: c.seed });
  const env = { sky, currentMs: [c.currentEastMs, c.currentNorthMs] as Vec2, designs };
  let swarm: Swarm = makeSwarm(c.nodes, c.spacingM, startHour * 3600, designs);
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
      const surplus = Math.max(0, r.pvW[n.id] - baseLoadW(designs[n.role]) - r.thrustW[n.id]);
      computeWh += (Math.min(surplus, computeCapW(designs[n.role])) * DT_S) / 3600;
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
export function runScenario(c: ScenarioConfig, hours: number, startHour = 6, designs: Designs = { worker: workerDesign(), master: masterDesign() }): Comparison {
  const swarm = simulate(c, hours, startHour, scriptedNavigator(), designs);
  const stayPut = simulate(c, hours, startHour, holdStationNavigator(), designs);
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
