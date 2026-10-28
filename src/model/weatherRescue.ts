import { batteryCapacityWh, type Designs } from './swarm';
import type { Conditions, WeatherState } from './weather';

/** Scenario assumptions only, not modem specifications or a service-level guarantee. */
export const DISTRESS = { capacityWh: 20, standbyW: .05, packetWh: .2, acquisitionS: 60, reportIntervalS: 300 };
export interface PositionReport { x: number; y: number; t: number; source: 'mesh' | 'satellite'; batteryPct?: number; fault?: string }
export interface RescuePlan {
  targetId: string;
  status: 'Maintain contact' | 'Await position' | 'Extend relay chain' | 'Shore retrieval' | 'Wildlife hold';
  reason: string;
  report: PositionReport | null;
  relayIds: string[];
  waypoints: { id: string; x: number; y: number; anchorId: string }[];
  uncertaintyM: number;
}

/** Plans use received reports, never a disconnected node's simulation-truth position. */
export function planRescue(s: WeatherState, c: Conditions, range: number, driftMs: number, connected: Set<string>, designs: Designs): RescuePlan | null {
  const distressed = s.nodes.filter(n => n.reserveHold || n.wh / batteryCapacityWh(designs[n.role]) < .1 || n.lostS >= 15 || n.inverted || n.ingress);
  const prior=s.nodes.find(n=>n.id===s.rescue?.targetId);
  if(prior?.report && s.rescue?.relayIds.length && Math.hypot(prior.report.x-s.nodes[0].x,prior.report.y-s.nodes[0].y)>range*.7 && !distressed.includes(prior)) distressed.push(prior);
  const target = distressed.find(n => n.id === s.rescue?.targetId) ?? distressed[0];
  if (!target) return null;
  const report = target.report;
  const age = report ? Math.max(0, s.t - report.t) : Infinity;
  const uncertaintyM = report ? 10 + age * (c.current + c.tide + c.wind * .018 + c.speed) : 0;
  const plan: RescuePlan = { targetId: target.id, status: 'Maintain contact', reason: '', report, relayIds: [], waypoints: [], uncertaintyM };
  if (s.wildlife) return { ...plan, status: 'Wildlife hold', reason: 'No search movement near wildlife. Keep distress reporting; request human retrieval if drift becomes unsafe.' };
  const master = s.nodes[0];
  if (!connected.has(master.id) || master.wh / batteryCapacityWh(designs.master) < .2)
    return { ...plan, status: 'Shore retrieval', reason: 'Coordinator unavailable or below its dispatch reserve. Satellite reports may reach shore, but there is no autonomous leader election.' };
  if (target.inverted || target.ingress || target.wh <= 0)
    return { ...plan, status: 'Shore retrieval', reason: 'Capsize, ingress or main-power failure needs physical retrieval. The sealed distress reserve can still try to report if the antenna has sky view.' };
  if (!report || age > 900)
    return { ...plan, status: 'Shore retrieval', reason: 'No position report within 15 minutes. Do not send escorts toward an increasingly uncertain position.' };
  const dx = report.x - master.x, dy = report.y - master.y, distance = Math.hypot(dx, dy);
  if (connected.has(target.id) && distance < range * .8)
    return { ...plan, reason: target.reserveHold ? 'At low battery: propulsion and compute off, essentials only. Maintain contact and solar charging; resume propulsion above 15%. Escorts cannot tow or recharge this node.' : 'Contact restored. Monitor autonomous return; escorts return to formation. Physical retrieval remains available if return fails.' };
  if (driftMs > c.speed * .85)
    return { ...plan, status: 'Shore retrieval', reason: 'Insufficient propulsion headroom against drift. Do not expose additional nodes to the same failure.' };
  if (!connected.has(target.id) && report.source === 'mesh')
    return { ...plan, status: 'Await position', reason: 'Lost mesh contact. Cached coordinates are shown with growing uncertainty. Wait for a fresh satellite fix before extending a chain; the live map is not a received fix.' };
  const hop = range * .7; // retain 30% of assumed radius as a maneuver margin
  const count = Math.max(1, Math.ceil(distance / hop) - 1);
  const eligible = s.nodes.filter(n => n.role === 'worker' && n.id !== target.id && connected.has(n.id) && !n.inverted && !n.ingress && !n.reserveHold && n.wh / batteryCapacityWh(designs.worker) >= .35)
    .sort((a,b) => {
      const order=(id:string)=>{const index=s.rescue?.relayIds.indexOf(id)??-1;return index<0?99:index;};
      return order(a.id)-order(b.id) || Math.hypot(a.x - master.x, a.y - master.y) - Math.hypot(b.x - master.x, b.y - master.y) || a.id.localeCompare(b.id); });
  if (count > 3 || eligible.length < count)
    return { ...plan, status: 'Shore retrieval', reason: 'Position exceeds the three-escort envelope, or too few connected workers have 35% battery. Preserve the fleet; use satellite updates for physical retrieval.' };
  const relayIds = eligible.slice(0,count).map(n=>n.id);
  const waypoints = relayIds.map((id,i) => ({ id, x: master.x + dx * (i+1)/(count+1), y: master.y + dy * (i+1)/(count+1), anchorId: i===0 ? master.id : relayIds[i-1] }));
  return { ...plan, status: 'Extend relay chain', reason: 'Up to three healthy workers extend a chain toward the reported fix. Each stays within its preceding relay’s maneuver margin. No towing or energy transfer is modeled.', relayIds, waypoints };
}
