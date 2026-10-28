import { advanceRighting, initialRighting, weatherSun, type RightingState } from './weatherRecovery';
import type { Designs } from './swarm';
import { batteryCapacityWh, hexSlots, thrustPowerW } from './swarm';
import { DISTRESS, planRescue, type PositionReport, type RescuePlan } from './weatherRescue';
import { loadW, pvPowerW, stepBattery } from './power';

export type ScenarioId = 'day' | 'night' | 'wind' | 'storm' | 'swells' | 'tides' | 'current';
export interface Conditions {
  wind: number; swell: number; period: number; rain: number; current: number;
  direction: number; tide: number; range: number; speed: number;
}
export interface Scenario { id: ScenarioId; name: string; subtitle: string; question: string; rationale: string; conditions: Conditions }
const base: Conditions = { wind: 3, swell: 0.4, period: 8, rain: 0, current: 0.08, direction: 90, tide: 0.1, range: 250, speed: 0.4 };
export const SCENARIOS: Scenario[] = [
  { id: 'day', name: 'Day', subtitle: 'The reference run', question: 'Can the fleet hold formation without spending its solar budget?', rationale: 'Start with mild conditions. Compare station keeping, battery trend and relay paths before adding a failure.', conditions: { ...base } },
  { id: 'night', name: 'Night', subtitle: 'No solar safety net', question: 'What stays powered when the sun disappears?', rationale: 'Starts at sunset and advances through sunrise. Shed compute below 25% battery; preserve navigation and communications. Below 10%, idle propulsion and report distress. Preserve essentials, charge from solar when available, and resume movement at 25%; request retrieval if recovery is not feasible.', conditions: { ...base } },
  { id: 'wind', name: 'Heavy winds', subtitle: 'Windage & separation', question: 'Does a gust push a worker beyond the last relay?', rationale: 'A simple wind-slip estimate adds drift. Request panel stow at 12 m/s; this reduces modeled PV and windage, but is not a validated folding sequence.', conditions: { ...base, wind: 22, swell: 1.5, current: 0.2 } },
  { id: 'storm', name: 'Storm', subtitle: 'Rain, spray & link loss', question: 'What survives when power, visibility and radio margin fall together?', rationale: 'Rain reduces solar input; spray and wave masking reduce the assumed radio radius. Ingress is injected separately: rainfall alone does not prove a sealed hull leaks.', conditions: { ...base, wind: 28, swell: 3.5, period: 7, rain: 45, current: 0.45 } },
  { id: 'swells', name: 'High swells', subtitle: 'Motion & capsize drills', question: 'Can a node report its position after it turns upside down?', rationale: 'Roll is a visual wave-following estimate, not a capsize predictor. Inject a full inversion to rehearse shutdown and retrieval; the proposed 60 s automatic righting state machine runs directly on the fleet map. Its successful roll is a conditional design assumption, not a wave-basin result.', conditions: { ...base, wind: 9, swell: 5, period: 11, current: 0.25 } },
  { id: 'tides', name: 'Tides', subtitle: 'Reversing tidal stream', question: 'Can it return before the tidal stream outruns its thrusters?', rationale: 'Water level and horizontal tidal flow are separate. A 12.42-hour sinusoid changes level and current; this is a conceptual tide, not a local forecast or grounding model.', conditions: { ...base, current: 0.1, tide: 0.7, swell: 0.6 } },
  { id: 'current', name: 'Current', subtitle: 'Beyond propulsion authority', question: 'What happens when the water moves faster than the node?', rationale: 'Ground velocity equals through-water propulsion plus current and estimated wind slip. When return makes no headway, stop promising recovery and request retrieval.', conditions: { ...base, current: 0.75, tide: 0.15, swell: 1 } },
];
export type Mode = 'Holding' | 'Drifting' | 'Link grace' | 'Returning' | 'Retrieval' | 'Inverted' | 'Wildlife hold' | 'Power reserve' | 'Relay escort' | 'Self-righting' | 'Recovery escort' | 'Offline';
export interface WeatherNode {
  id: string; role: 'master' | 'worker'; x: number; y: number; homeX: number; homeY: number;
  righting: RightingState;
  reserveHold: boolean; beaconWh: number; beaconWaitS: number; lastSatelliteS: number | null;
  beaconStatus: 'Standby' | 'Mesh report' | 'Acquiring' | 'Satellite ACK' | 'Sky blocked' | 'Channel unavailable' | 'Reserve empty';
  report: PositionReport | null;
  wh: number; lostS: number; inverted: boolean; ingress: boolean; mode: Mode; pvW: number; loadW: number;
}
export interface WeatherState { rightingOperational: boolean; recoveryFormation: 'escort'|'fleet'; satelliteAvailable: boolean; skyView: boolean; rescue: RescuePlan | null; t: number; nodes: WeatherNode[]; masterOnline: boolean; wildlife: boolean; events: { t: number; message: string }[] }
export const logEvent = (s: WeatherState, message: string): WeatherState => ({ ...s, events: [{ t: s.t, message }, ...s.events].slice(0, 40) });
export function createWeather(designs: Designs): WeatherState {
  return { rightingOperational: true, recoveryFormation: 'escort', satelliteAvailable: true, skyView: true, rescue: null, t: 0, masterOnline: true, wildlife: false, events: [], nodes: hexSlots(13, 100).map(([x, y], i) => {
    const role = i === 0 ? 'master' : 'worker';
    return { righting: initialRighting(), reserveHold: false, beaconWh: DISTRESS.capacityWh, beaconWaitS: 0, lastSatelliteS: null, beaconStatus: 'Standby', report: { x, y, t: 0, source: 'mesh', batteryPct:60, fault:'Healthy' }, id: i === 0 ? 'M' : `W${String(i).padStart(2, '0')}`, role, x, y, homeX: x, homeY: y, wh: batteryCapacityWh(designs[role]) * 0.6, lostS: 0, inverted: false, ingress: false, mode: 'Holding', pvW: 0, loadW: 0 };
  }) };
}
export function environment(c: Conditions, t: number) {
  const phase = 2 * Math.PI * t / (12.42 * 3600);
  const stream = c.current + c.tide * Math.cos(phase);
  const angle = (c.direction - 90) * Math.PI / 180;
  const stowed = c.wind >= 12;
  const slip = c.wind * (stowed ? 0.008 : 0.018); // EST; no force-balance calibration
  return { vx: Math.cos(angle) * (stream + slip), vy: Math.sin(angle) * (stream + slip),
    tideLevel: 1.5 * Math.sin(phase), stream, stowed,
    range: c.range * Math.max(0.25, 1 - c.rain * 0.004 - c.swell * 0.025) };
}
/** A link exists only between powered, upright radios; flood-fill supports multi-hop paths to the master. */
export function network(s: WeatherState, range: number): { connected: Set<string>; edges: [string, string][] } {
  const live = s.nodes.filter(n => n.wh > 0 && !n.inverted && !n.ingress && (n.role !== 'master' || s.masterOnline));
  const edges: [string, string][] = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++)
    if (Math.hypot(live[i].x - live[j].x, live[i].y - live[j].y) <= range) edges.push([live[i].id, live[j].id]);
  const connected = new Set<string>(live.some(n => n.role === 'master') ? ['M'] : []);
  let changed = true;
  while (changed) { changed = false; for (const [a, b] of edges) if (connected.has(a) !== connected.has(b)) { connected.add(a); connected.add(b); changed = true; } }
  return { connected, edges };
}
/** Conceptual velocity controller, not CFD or a radio link budget. Always integrate in <= 1 s steps. */
export function stepWeather(state: WeatherState, c: Conditions, scenario: ScenarioId, dt: number, designs: Designs): WeatherState {
  let s = state;
  for (let elapsed = 0; elapsed < Math.max(dt, 1); elapsed += 1) {
    const h = Math.min(1, dt - elapsed), env = environment(c, s.t);
    const righted=s.nodes.map(n=>{
      const result=advanceRighting(n.righting,n.inverted,n.ingress,s.rightingOperational,n.wh>0||n.beaconWh>=.1,h,designs[n.role]);
      return {...n,righting:result.state,inverted:result.inverted,wh:Math.max(0,n.wh-(result.fire&&n.wh>0?.1:0)),beaconWh:Math.max(0,n.beaconWh-(result.fire&&n.wh<=0?.1:0))};
    });
    const net=network({...s,nodes:righted},env.range);
    const sunlight=weatherSun(s.t,scenario);
    const reported = righted.map(n => {
      const linked = net.connected.has(n.id);
      const soc = n.wh / batteryCapacityWh(designs[n.role]);
      const reserveHold = soc < .1 || (n.reserveHold && soc < .25);
      const payload={batteryPct:soc*100,fault:n.ingress?'Ingress':n.inverted?'Inverted':reserveHold?'Low battery':linked?'Healthy':'Link lost'};
      let report = linked ? { x: n.x, y: n.y, t: s.t, source: 'mesh' as const, ...payload } : n.report;
      let beaconWh = Math.max(0,n.beaconWh-DISTRESS.standbyW*h/3600);
      const beaconWaitS = linked ? 0 : n.beaconWaitS+h;
      let lastSatelliteS = n.lastSatelliteS;
      let beaconStatus = (linked ? 'Mesh report' : 'Acquiring') as typeof n.beaconStatus;
      if (!linked) {
        if (beaconWh < DISTRESS.packetWh) beaconStatus='Reserve empty';
        else if (n.inverted || !s.skyView) beaconStatus='Sky blocked';
        else if (!s.satelliteAvailable) beaconStatus='Channel unavailable';
        else if (beaconWaitS >= DISTRESS.acquisitionS && (lastSatelliteS === null || s.t-lastSatelliteS >= DISTRESS.reportIntervalS)) {
          if (h > 0) {
            beaconWh-=DISTRESS.packetWh;
            report={x:n.x,y:n.y,t:s.t,source:'satellite',...payload};
            lastSatelliteS=s.t;
          }
          beaconStatus=h>0?'Satellite ACK':'Acquiring';
        } else if (lastSatelliteS !== null) beaconStatus='Satellite ACK';
      }
      return {...n,reserveHold,report,beaconWh,beaconWaitS,lastSatelliteS,beaconStatus};
    });
    const reportState={...s,nodes:reported};
    const rescue=planRescue(reportState,c,env.range,Math.hypot(env.vx,env.vy),net.connected,designs);
    const nodes = reported.map(n => {
      const d = designs[n.role], capacity = batteryCapacityWh(d), soc = n.wh / capacity;
      const lostS = net.connected.has(n.id) ? 0 : n.lostS + h;
      const isolated = lostS >= 15;
      // Cached formation slots are the agreed rendezvous. No master election or extra backhaul is invented.
      const relay = rescue?.waypoints.find(w=>w.id===n.id);
      let goalX=n.homeX, goalY=n.homeY;
      if (relay) {
        goalX=relay.x;goalY=relay.y;
        if(n.role!=='master') {
          const anchor=reported.find(p=>p.id===relay.anchorId)!;
          const ax=relay.x-anchor.x,ay=relay.y-anchor.y,dist=Math.hypot(ax,ay);
          const scale=Math.min(1,env.range*.7/Math.max(dist,1e-6));
          goalX=anchor.x+ax*scale;goalY=anchor.y+ay*scale;
        }
      }
      const dx = goalX - n.x, dy = goalY - n.y, distance = Math.hypot(dx, dy);
      const vx = distance > 2 ? dx / distance * Math.min(c.speed, distance / 20) : 0;
      const vy = distance > 2 ? dy / distance * Math.min(c.speed, distance / 20) : 0;
      let tx = vx - env.vx, ty = vy - env.vy;
      const need = Math.hypot(tx, ty);
      if (need > c.speed) { tx *= c.speed / need; ty *= c.speed / need; }
      const headway = distance > 2 ? ((tx + env.vx) * dx + (ty + env.vy) * dy) / distance : 0;
      let mode: Mode = isolated ? 'Returning' : net.connected.has(n.id) ? 'Holding' : 'Link grace';
      if (!isolated && net.connected.has(n.id) && need > c.speed && distance > 2 && headway <= 0.01) mode = 'Drifting';
      if (isolated && distance > 2 && headway <= 0.01) mode = 'Retrieval';
      if (relay) mode = relay.kind==='ring'||relay.kind==='fleet'?'Recovery escort':'Relay escort';
      if (n.reserveHold) mode = 'Power reserve';
      if (s.wildlife) mode = 'Wildlife hold';
      if (n.inverted) mode = n.righting.phase==='Failed'?'Inverted':'Self-righting';
      if (n.ingress || n.wh <= 0 || (n.role === 'master' && !s.masterOnline)) mode = 'Offline';
      const stopped = ['Power reserve', 'Wildlife hold', 'Inverted', 'Self-righting', 'Offline'].includes(mode);
      if (stopped) { tx = 0; ty = 0; }
      const pv = n.inverted || mode === 'Offline' ? 0 : pvPowerW(d, sunlight.ghi, Math.max(0.05, 1 - c.rain / 60)) * (env.stowed ? 0.2 : 1);
      const computeW = d.parts.filter(p => p.subsystem === 'compute').reduce((v, p) => v + p.powerW, 0);
      const essentialW=d.parts.filter(p=>p.subsystem==='navigation' || ['mesh-radio','bms'].includes(p.id)).reduce((sum,p)=>sum+p.powerW,0);
      const load = mode === 'Offline' ? 0 : n.inverted ? 15 : n.reserveHold ? essentialW : loadW(d, thrustPowerW(Math.hypot(tx, ty))) - (soc < 0.25 || s.wildlife || relay ? computeW : 0);
      const wh = stepBattery(n.wh, capacity, pv - load, h);
      return { ...n, x: n.x + (tx + env.vx) * h, y: n.y + (ty + env.vy) * h, lostS, mode, wh, pvW: mode === 'Offline' ? 0 : pv, loadW: load };
    });
    let next: WeatherState = { ...s, t: s.t + h, nodes, rescue };
    for(const n of nodes) {
      const previous=s.nodes.find(p=>p.id===n.id)!;
      if(n.righting.phase!==previous.righting.phase) next=logEvent(next,`${n.id}: righting ${n.righting.phase}${n.righting.phase==='Upright'?' — upright confirmed; bag remains deployed, service required':''}`);
      if(n.reserveHold!==previous.reserveHold) next=logEvent(next,`${n.id}: ${n.reserveHold?'survival power; escort requested':'25% charge reached; independent operation restored'}`);
      if(n.lastSatelliteS!==previous.lastSatelliteS) next=logEvent(next,`${n.id}: simulated satellite ACK — position + battery + fault to shore, independent of master`);
    }
    const rescueKey=(r: RescuePlan|null)=>r?`${r.targetId}:${r.status}:${r.relayIds.join(',')}`:'';
    if(rescue && rescueKey(rescue)!==rescueKey(s.rescue)) next=logEvent(next,`${rescue.targetId}: ${rescue.status}${rescue.relayIds.length?' · '+rescue.relayIds.join(' → '):''}`);
    nodes.forEach((n, i) => { if (n.mode !== s.nodes[i].mode) next = logEvent(next, `${n.id}: ${n.mode}${n.mode === 'Inverted' ? ' — propulsion off; retrieval required' : ''}`); });
    s = next;
  }
  return s;
}
