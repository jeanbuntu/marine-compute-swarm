import { G } from '../constants';
import { evaluate } from '../hydrostatics';
import { masterDesign } from '../nodeDesign';
import type { NodeDesign } from '../parts';
import { PV_EFFICIENCY, MPPT_EFFICIENCY, pvPowerW } from '../power';
import { mulberry32 } from '../rng';
import { makeSky, type Sky } from '../sky';
import { initialHull, hullProps, stepHull, type HullProps, type HullState } from './hull';
import { actuate, defaultActuator, limitHeel, petalTargets, staticHeel, tiltLimits, uniformTilts, STOW_WIND_MS, type ActuatorSettings, type Strategy, type Tilts } from './petals';
import { PETAL_DIRS, PETAL_IDS, bodyToWorld, decompose, petalIrradiance, planeIrradiance, petalNormalBody, sunVector, type Attitude, type Irradiance, type V3 } from './solar';
import { allocate, currentDragN, thrusterPowerW, thrustersFromDesign, windForceN, MAX_THRUST_N, type Layout } from './thrust';
import { makeSea, SEA_PRESETS, type Sea, type SeaParams } from './waves';

const RAD = Math.PI / 180;
export type Maneuver = 'hold' | 'dodge';

export interface MasterParams {
  sun: { mode: 'clock' | 'manual'; azDeg: number; elevDeg: number; latDeg: number; lonDeg: number; doy: number };
  sky: { seed: number; coverage: number; windEastMs: number; windNorthMs: number };
  sea: SeaParams;
  currentEastMs: number; currentNorthMs: number;
  windMs: number; windFromDeg: number;
  strategy: Strategy; actuator: ActuatorSettings;
  layout: Layout; maneuver: Maneuver; dodgeHeadingDeg: number; dodgeSpeedMs: number;
  yawAssist: boolean; headingDeg: number;
  physSpeed: number; skySpeed: number;
}

export const defaultMasterParams = (): MasterParams => ({
  sun: { mode: 'clock', azDeg: 120, elevDeg: 35, latDeg: 33.7, lonDeg: -118.5, doy: 200 },
  sky: { seed: 7, coverage: 0.5, windEastMs: 6, windNorthMs: 2 },
  sea: { ...SEA_PRESETS.swell, seed: 5 },
  currentEastMs: 0.1, currentNorthMs: -0.05, windMs: 6, windFromDeg: 250,
  strategy: 'track', actuator: defaultActuator(), layout: 'radial', maneuver: 'hold', dodgeHeadingDeg: 45, dodgeSpeedMs: 0.3,
  yawAssist: false, headingDeg: 0, physSpeed: 1, skySpeed: 1,
});

export interface Sample {
  t: number; roll: number; pitch: number; heave: number; eta: number;
  tilt: number[]; target: number[]; ideal: number[];
  pvW: number; pvFixedW: number; pvIdealW: number; thrustW: number; thrustN: number;
}
export interface Telemetry {
  tPhys: number; tSky: number;
  sun: { azDeg: number; elevDeg: number; clearGhi: number }; shade: number; irr: Irradiance;
  att: Attitude; heaveM: number;
  tilts: Tilts; targets: Tilts; ideal: Tilts; limits: { minDeg: number; maxDeg: number }; stowed: boolean;
  cosInc: Record<string, number>; petalWm2: Record<string, number>;
  heel: { roll: number; pitch: number; gmEff: number };
  pv: { actualW: number; fixedW: number; flatW: number; idealW: number; swarmModelW: number; deckW: number };
  prop: { u: number[]; powerW: number; thrustN: number; posErrM: number; speedMs: number; yawAuthority: boolean; saturated: boolean;
    env: { current: [number, number]; wind: [number, number]; drift: [number, number] }; force: [number, number]; yawTargetDeg: number | null; yawBestGainPct: number };
  actuatorW: number; demandDegS: number;
}

export function pvBreakdown(d: NodeDesign, att: Attitude, tilts: Tilts, sun: V3, irr: Irradiance) {
  const k = PV_EFFICIENCY * MPPT_EFFICIENCY, petalArea = d.petalLengthM * d.hullSideM;
  let petals = 0;
  for (const id of PETAL_IDS) petals += petalArea * k * petalIrradiance(att, PETAL_DIRS[id], tilts[id], sun, irr);
  const deckN = bodyToWorld(att, [0, 1, 0]);
  const deck = 0.8 * d.hullSideM * d.hullSideM * k * planeIrradiance(deckN, sun, irr);
  return { petals, deck, total: petals + deck };
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/** Live, non-reactive simulation of the master node alone: sky, sea, hull, petals and propulsion. */
export class MasterSim {
  params: MasterParams;
  design: NodeDesign;
  sea!: Sea; sky!: Sky; hullP!: HullProps;
  tPhys = 0; tSky = 10 * 3600;
  pos: [number, number] = [0, 0];
  vel: [number, number] = [0, 0];
  hull: HullState = initialHull();
  tilts: Tilts = uniformTilts(20);
  targets: Tilts = uniformTilts(20);
  ideal: Tilts = uniformTilts(20);
  u = [0, 0, 0, 0]; uCmd = [0, 0, 0, 0];
  history: Sample[] = [];
  telemetry!: Telemetry;
  private rnd = mulberry32(99);
  private sinceControl = 1; private sinceLog = 1; private sinceYaw = 99;
  private target: [number, number] = [0, 0];
  private integral: [number, number] = [0, 0];
  private attBuf: { t: number; a: Attitude }[] = [];
  private noisyAtt: Attitude = { yaw: 0, pitch: 0, roll: 0 };
  private yawTarget: number | null = null; private yawGain = 0;
  private movedDeg = 0; private demand = 0; private prevIdeal: Tilts = uniformTilts(20);
  private driftFilt: [number, number] = [0, 0];

  constructor(params = defaultMasterParams(), design = masterDesign()) {
    this.params = params; this.design = design;
    this.rebuild();
    this.hull = initialHull(params.headingDeg * RAD);
    this.telemetry = this.snapshot(0);
  }

  /** Rebuilds sky, sea and hull constants after a parameter change; the motion state carries over. */
  rebuild() {
    const p = this.params;
    this.sky = makeSky({
      seed: p.sky.seed, coverage: p.sky.coverage, windMs: [p.sky.windEastMs, p.sky.windNorthMs], latDeg: p.sun.latDeg, lonDeg: p.sun.lonDeg, doy: p.sun.doy,
      sunOverride: p.sun.mode === 'manual' ? { azDeg: p.sun.azDeg, elevDeg: p.sun.elevDeg } : undefined,
    });
    this.sea = makeSea(p.sea);
    this.hullP = hullProps(this.design);
  }

  set(patch: Partial<MasterParams>) {
    const prevHeading = this.params.headingDeg;
    this.params = { ...this.params, ...patch };
    this.rebuild();
    if (this.params.headingDeg !== prevHeading && !this.params.yawAssist) this.hull = { ...this.hull, yaw: this.params.headingDeg * RAD, yawRate: 0 };
    this.sinceControl = 1; this.sinceYaw = 99;
  }

  resetMotion() {
    this.pos = [0, 0]; this.vel = [0, 0]; this.target = [0, 0]; this.integral = [0, 0];
    this.hull = initialHull(this.params.headingDeg * RAD);
    this.u = [0, 0, 0, 0]; this.uCmd = [0, 0, 0, 0]; this.history = []; this.tPhys = 0;
  }

  /** Sky clock, named like the swarm sim so shared scene code can read either. */
  get timeS() { return this.tSky; }

  private attitude(): Attitude { return { yaw: this.hull.yaw, pitch: this.hull.pitch, roll: this.hull.roll }; }

  step(realDtS: number) {
    const total = Math.min(realDtS, 0.25) * this.params.physSpeed;
    let left = total;
    while (left > 1e-9) { const dt = Math.min(0.02, left); this.advance(dt); left -= dt; }
    this.tSky += Math.min(realDtS, 0.25) * this.params.skySpeed;
    this.telemetry = this.snapshot(total);
  }

  private advance(dt: number) {
    const p = this.params, d = this.design, hp = this.hullP;
    this.tPhys += dt;
    const north = -this.pos[1];
    const sunS = this.sky.sun(this.tSky);
    const f = this.sky.shadowFactor(this.tSky, this.pos[0], north);
    const irr = decompose(sunS.ghiWm2, f, sunS.elevDeg);
    const sun = sunVector(sunS.azDeg, sunS.elevDeg);
    const stowed = p.windMs > STOW_WIND_MS;
    const lim = tiltLimits(d, hp.freeboardM, this.sea.hsM, p.actuator);

    // --- attitude sensing with latency and noise, then the petal control tick (10 Hz) ---
    const att = this.attitude();
    this.attBuf.push({ t: this.tPhys, a: att });
    while (this.attBuf.length > 2 && this.attBuf[1].t < this.tPhys - p.actuator.latencyS) this.attBuf.shift();
    this.sinceControl += dt;
    if (this.sinceControl >= 0.1) {
      const ctlDt = this.sinceControl; this.sinceControl = 0;
      const old = this.attBuf[0].a, n = p.actuator.imuNoiseDeg * RAD;
      this.noisyAtt = { yaw: old.yaw + gauss(this.rnd) * n * 0.2, pitch: old.pitch + gauss(this.rnd) * n, roll: old.roll + gauss(this.rnd) * n };
      const ctx = { att: this.noisyAtt, sun, irr, minDeg: lim.minDeg, maxDeg: lim.maxDeg, winterStow: stowed };
      this.targets = limitHeel(d, petalTargets(p.strategy, ctx), hp.gmM);
      this.ideal = petalTargets('track', { ...ctx, att, minDeg: -89, maxDeg: 89, winterStow: false });
      let dem = 0;
      for (const id of PETAL_IDS) dem = Math.max(dem, Math.abs(this.ideal[id] - this.prevIdeal[id]) / ctlDt);
      this.demand += (dem - this.demand) * 0.15;
      this.prevIdeal = this.ideal;
    }
    const act = actuate(this.tilts, this.targets, dt, p.actuator.rateDegS, lim.minDeg, lim.maxDeg);
    this.tilts = act.tilts; this.movedDeg += act.movedDeg;

    // --- environment forces and station keeping (world frame, x east / z south) ---
    const cur: [number, number] = [p.currentEastMs, -p.currentNorthMs];
    const rel: [number, number] = [cur[0] - this.vel[0], cur[1] - this.vel[1]];
    const fCur = currentDragN(rel);
    const toward = ((p.windFromDeg + 180) * RAD);
    const fWind = windForceN(p.windMs, [Math.sin(toward), -Math.cos(toward)], d, hp.freeboardM, PETAL_IDS.map((id) => this.tilts[id]));
    const fDrift = this.sea.driftForceN(d.hullSideM);
    this.driftFilt = [this.driftFilt[0] + (fDrift[0] - this.driftFilt[0]) * 0.05, this.driftFilt[1] + (fDrift[1] - this.driftFilt[1]) * 0.05];

    if (p.maneuver === 'dodge') {
      const h = p.dodgeHeadingDeg * RAD;
      this.target = [this.target[0] + Math.sin(h) * p.dodgeSpeedMs * dt, this.target[1] - Math.cos(h) * p.dodgeSpeedMs * dt];
    } else this.target = [0, 0];
    const M = hp.massKg * 1.2, w = 0.2, kp = M * w * w, kd = 2 * M * w;
    const err: [number, number] = [this.target[0] - this.pos[0], this.target[1] - this.pos[1]];
    const velT = p.maneuver === 'dodge' ? [Math.sin(p.dodgeHeadingDeg * RAD) * p.dodgeSpeedMs, -Math.cos(p.dodgeHeadingDeg * RAD) * p.dodgeSpeedMs] : [0, 0];
    for (let i = 0; i < 2; i++) this.integral[i] = Math.max(-250, Math.min(250, this.integral[i] + err[i] * dt * kp * 0.03));
    const want: [number, number] = [kp * err[0] + kd * (velT[0] - this.vel[0]) + this.integral[0], kp * err[1] + kd * (velT[1] - this.vel[1]) + this.integral[1]];

    // yaw assist: pick the hull heading that maximises tracked PV, then ask the thrusters for torque
    this.sinceYaw += dt;
    if (p.yawAssist && this.sinceYaw > 5) { this.sinceYaw = 0; this.pickYaw(sun, irr, lim); }
    let yawTorque = 0;
    const thr = thrustersFromDesign(d, p.layout);
    if (p.yawAssist && this.yawTarget !== null) {
      let e = this.yawTarget - this.hull.yaw; e = Math.atan2(Math.sin(e), Math.cos(e));
      yawTorque = Math.max(-40, Math.min(40, 60 * e - 90 * this.hull.yawRate));
    }
    const c = Math.cos(this.hull.yaw), s = Math.sin(this.hull.yaw);
    const bodyWant: [number, number] = [want[0] * c - want[1] * s, want[0] * s + want[1] * c];
    const alloc = allocate(thr, bodyWant[0], bodyWant[1], yawTorque);
    this.uCmd = alloc.u;
    const k = Math.min(1, dt / 0.6);
    this.u = this.u.map((v, i) => v + (alloc.u[i] - v) * k);
    const fb: [number, number] = [this.u.reduce((a, v, i) => a + v * thr[i].ax, 0), this.u.reduce((a, v, i) => a + v * thr[i].az, 0)];
    const fThrust: [number, number] = [fb[0] * c + fb[1] * s, -fb[0] * s + fb[1] * c];
    const yawNm = this.u.reduce((a, v, i) => a + v * (thr[i].z * thr[i].ax - thr[i].x * thr[i].az), 0);
    this.lastAlloc = { alloc, thr, fThrust, env: { current: fCur, wind: fWind, drift: this.driftFilt } };

    for (let i = 0; i < 2; i++) {
      const F = fCur[i] + fWind[i] + fDrift[i] + fThrust[i];
      this.vel[i] += (F / M) * dt;
      this.pos[i] += this.vel[i] * dt;
    }
    const I = (hp.massKg * d.hullSideM ** 2) / 6 * 1.5;
    this.hull = { ...this.hull, yawRate: this.hull.yawRate + ((yawNm - 150 * this.hull.yawRate) / I) * dt };
    this.hull.yaw += this.hull.yawRate * dt;

    // --- hull attitude from the shared sea ---
    const heel = staticHeel(d, this.tilts, hp.gmM);
    const arm = Math.max(0, hp.freeboardM) / 2 + hp.draftM / 2;
    const ws: [number, number] = [-(fWind[0] * arm) / (hp.massKg * G * hp.gmM), -(fWind[1] * arm) / (hp.massKg * G * hp.gmM)];
    this.hull = stepHull(this.hull, hp, this.sea, this.pos[0], this.pos[1], this.tPhys, { biasRoll: heel.roll, biasPitch: heel.pitch, windSlope: ws }, dt);

    this.sinceLog += dt;
    if (this.sinceLog >= 0.1) {
      this.sinceLog = 0;
      const a = this.attitude(), pv = pvBreakdown(d, a, this.tilts, sun, irr).total;
      const fixed = pvBreakdown(d, a, uniformTilts(20), sun, irr).total, idealW = this.idealPv(a, sun, irr);
      this.history.push({
        t: this.tPhys, roll: a.roll, pitch: a.pitch, heave: this.hull.heave, eta: this.sea.elevation(this.pos[0], this.pos[1], this.tPhys),
        tilt: PETAL_IDS.map((id) => this.tilts[id]), target: PETAL_IDS.map((id) => this.targets[id]), ideal: PETAL_IDS.map((id) => this.ideal[id]),
        pvW: pv, pvFixedW: fixed, pvIdealW: idealW, thrustW: this.thrustPower(thr), thrustN: Math.hypot(fThrust[0], fThrust[1]),
      });
      if (this.history.length > 600) this.history.shift();
    }
  }

  lastAlloc: { alloc: ReturnType<typeof allocate>; thr: ReturnType<typeof thrustersFromDesign>; fThrust: [number, number]; env: { current: [number, number]; wind: [number, number]; drift: [number, number] } } | null = null;

  private thrustPower(thr: ReturnType<typeof thrustersFromDesign>): number {
    const rel: [number, number] = [this.params.currentEastMs - this.vel[0], -this.params.currentNorthMs - this.vel[1]];
    const c = Math.cos(this.hull.yaw), s = Math.sin(this.hull.yaw);
    const relB = [rel[0] * c - rel[1] * s, rel[0] * s + rel[1] * c];
    return this.u.reduce((sum, u, i) => sum + thrusterPowerW(u, Math.abs(relB[0] * thr[i].ax + relB[1] * thr[i].az)), 0);
  }

  /** Upper bound for tilt-only control: each petal at its best unclamped angle for the true attitude, never stowed. */
  private idealPv(att: Attitude, sun: V3, irr: Irradiance): number {
    const t = petalTargets('track', { att, sun, irr, minDeg: -89, maxDeg: 89, winterStow: false });
    return pvBreakdown(this.design, att, t, sun, irr).total;
  }

  private pickYaw(sun: V3, irr: Irradiance, lim: { minDeg: number; maxDeg: number }) {
    const base = this.attitude(); let best = -1, bestYaw = base.yaw, here = 0;
    for (let k = 0; k < 18; k++) {
      const yaw = base.yaw + (k * 5 - 40) * RAD, a = { ...base, yaw };
      const t = petalTargets('track', { att: a, sun, irr, minDeg: lim.minDeg, maxDeg: lim.maxDeg, winterStow: false });
      const pv = pvBreakdown(this.design, a, t, sun, irr).total;
      if (k === 8) here = pv;
      if (pv > best) { best = pv; bestYaw = yaw; }
    }
    this.yawTarget = bestYaw; this.yawGain = here > 0 ? ((best - here) / here) * 100 : 0;
  }

  private snapshot(_dt: number): Telemetry {
    const p = this.params, d = this.design, hp = this.hullP;
    const sunS = this.sky.sun(this.tSky), f = this.sky.shadowFactor(this.tSky, this.pos[0], -this.pos[1]);
    const irr = decompose(sunS.ghiWm2, f, sunS.elevDeg), sun = sunVector(sunS.azDeg, sunS.elevDeg), att = this.attitude();
    const cosInc: Record<string, number> = {}, petalWm2: Record<string, number> = {};
    for (const id of PETAL_IDS) {
      const n = bodyToWorld(att, petalNormalBody(PETAL_DIRS[id], this.tilts[id] * RAD));
      cosInc[id] = Math.max(0, n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]);
      petalWm2[id] = petalIrradiance(att, PETAL_DIRS[id], this.tilts[id], sun, irr);
    }
    const act = pvBreakdown(d, att, this.tilts, sun, irr), fixed = pvBreakdown(d, att, uniformTilts(20), sun, irr), flat = pvBreakdown(d, att, uniformTilts(0), sun, irr);
    const la = this.lastAlloc, thr = thrustersFromDesign(d, p.layout);
    const F: [number, number] = la ? la.fThrust : [0, 0];
    const lim = tiltLimits(d, hp.freeboardM, this.sea.hsM, p.actuator);
    return {
      tPhys: this.tPhys, tSky: this.tSky, sun: { azDeg: sunS.azDeg, elevDeg: sunS.elevDeg, clearGhi: sunS.ghiWm2 }, shade: f, irr, att, heaveM: this.hull.heave,
      tilts: { ...this.tilts }, targets: { ...this.targets }, ideal: { ...this.ideal }, limits: lim, stowed: p.windMs > STOW_WIND_MS,
      cosInc, petalWm2, heel: staticHeel(d, this.tilts, hp.gmM),
      pv: { actualW: act.total, fixedW: fixed.total, flatW: flat.total, idealW: this.idealPv(att, sun, irr), swarmModelW: pvPowerW(d, sunS.ghiWm2, f), deckW: act.deck },
      prop: {
        u: [...this.u], powerW: this.thrustPower(thr), thrustN: Math.hypot(F[0], F[1]), posErrM: Math.hypot(this.target[0] - this.pos[0], this.target[1] - this.pos[1]),
        speedMs: Math.hypot(...this.vel), yawAuthority: la?.alloc.yawAuthority ?? false, saturated: la?.alloc.saturated ?? false,
        env: la?.env ?? { current: [0, 0], wind: [0, 0], drift: [0, 0] }, force: F, yawTargetDeg: this.yawTarget === null ? null : (this.yawTarget / RAD),
        yawBestGainPct: this.yawGain,
      },
      actuatorW: p.actuator.powerW * PETAL_IDS.filter((id) => Math.abs(this.targets[id] - this.tilts[id]) > 0.05).length, demandDegS: this.demand,
    };
  }
}
export { MAX_THRUST_N };
