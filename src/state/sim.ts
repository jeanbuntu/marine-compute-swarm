import { defaultConfig, type ScenarioConfig } from '../model/config';
import { makeSky, type Sky } from '../model/sky';
import { makeSwarm, stepSwarm, type Swarm, type Vec2 } from '../model/swarm';
import { scriptedNavigator, type Command, type Navigator } from '../model/navigator';
import { simulatedTracker, type CloudTracker, type TrackedCloud } from '../model/tracker';

const DECIDE_EVERY_S = 30;
const MAX_STEP_S = 10;

/** Live, non-reactive simulation state; the scene reads it every frame. */
export class Sim {
  config: ScenarioConfig;
  sky!: Sky;
  swarm!: Swarm;
  tracker!: CloudTracker;
  navigator: Navigator = scriptedNavigator();
  lastCmds: Command[] = [];
  lastTracked: Record<string, TrackedCloud[]> = {};
  timeS: number;
  private sinceDecide = Infinity;

  constructor(config: ScenarioConfig, timeS: number) {
    this.config = config;
    this.timeS = timeS;
    this.rebuild(config);
  }

  rebuild(config: ScenarioConfig) {
    this.config = config;
    this.sky = makeSky({
      seed: config.seed, coverage: config.coverage, windMs: [config.windEastMs, config.windNorthMs],
      latDeg: config.latDeg, lonDeg: config.lonDeg,
    });
    this.tracker = simulatedTracker(this.sky, { noiseM: config.trackerNoiseM, dropRate: config.trackerDropRate, seed: config.seed });
    this.swarm = makeSwarm(config.nodes, config.spacingM, this.timeS);
    this.lastCmds = [];
    this.lastTracked = {};
    this.sinceDecide = Infinity;
  }

  setNavigator(n: Navigator) {
    this.navigator = n;
    this.sinceDecide = Infinity;
  }

  /** Advances simulated time by dtS seconds, in stable sub-steps. */
  step(dtS: number) {
    let left = Math.max(0, dtS);
    while (left > 1e-9) {
      const dt = Math.min(MAX_STEP_S, left);
      if (this.sinceDecide >= DECIDE_EVERY_S) this.decide();
      const r = stepSwarm(this.swarm, this.lastCmds, dt, { sky: this.sky, currentMs: [this.config.currentEastMs, this.config.currentNorthMs] as Vec2 }, this.config.maxSpeedMs, this.timeS);
      this.swarm = r.swarm;
      this.timeS += dt;
      this.sinceDecide += dt;
      left -= dt;
    }
  }

  private decide() {
    const tracked: Record<string, TrackedCloud[]> = {};
    for (const n of this.swarm.nodes) {
      tracked[n.id] = this.tracker.track({ t: this.timeS, nodeId: n.id, x: n.pos[0], y: n.pos[1], widthPx: 640, heightPx: 640 });
    }
    const s = this.sky.sun(this.timeS);
    this.lastTracked = tracked;
    this.lastCmds = this.navigator.decide({
      t: this.timeS, nodes: this.swarm.nodes, tracked, slots: this.swarm.slots,
      limits: { maxSpeedMs: this.config.maxSpeedMs }, sun: { azDeg: s.azDeg, elevDeg: s.elevDeg },
    });
    this.sinceDecide = 0;
  }
}

/** Shared instance; SimDriver rebuilds it whenever the store config changes. */
export const sim = new Sim(defaultConfig(), 9 * 3600);
