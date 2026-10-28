import { DISTRESS } from '../../model/weatherRescue';
import type { WeatherNode, WeatherState } from '../../model/weather';

export function FleetRecovery({ state, node, onToggle, onFormation }: { state: WeatherState; node: WeatherNode; onToggle(key: 'satelliteAvailable'|'skyView'|'rightingOperational'): void; onFormation?(formation:'escort'|'fleet'):void }) {
  const plan=state.rescue, report=node.report;
  const age=report?Math.max(0,state.t-report.t):null;
  return <section id="recovery-plan" className="w-recovery-plan" aria-label="Lost-node recovery plan">
    <div className="w-recovery-columns"><div>
      <span className="w-eyebrow">RECOVERY COORDINATOR · {plan?.targetId??node.id}</span>
      <h2>{plan?.status??'Ready for a low-battery or lost-link drill'}</h2>
      <p>{plan?.reason??'At 8%: stop nonessential loads, gather escorts around the survivor, wait through sunrise and recharge to 25%. The fleet accompanies its drift. Beyond mesh: acquire a satellite distress link on a separate reserve cell. Healthy escorts can then extend contact toward the received fix.'}</p>
      {plan?.escortIds.length ? <p><strong>{state.recoveryFormation==='fleet'?'Protective fleet':'Close escorts'}:</strong> {plan.escortIds.join(', ')} · {plan.ringRadiusM.toFixed(0)} m standoff</p>:null}
      {plan?.relayIds.length ? <p><strong>Relay chain:</strong> M → {plan.relayIds.join(' → ')} → reported {plan.targetId}</p>:null}
      {plan?.report && <p>Search target: ({plan.report.x.toFixed(0)}, {plan.report.y.toFixed(0)}) m · {plan.report.source==='satellite'?'satellite fix':'last mesh fix'} · {Math.max(0,state.t-plan.report.t).toFixed(0)} s old · uncertainty envelope ±{plan.uncertaintyM.toFixed(0)} m (EST).</p>}
    </div><div className="w-recovery-metrics">
      <div>{node.id} · distress channel<b>{node.beaconStatus}{node.beaconStatus==='Satellite ACK'?' · simulated':''}</b></div>
      <div>Independent beacon battery<b>{node.beaconWh.toFixed(2)} / {DISTRESS.capacityWh} Wh · EST</b></div>
      <div>Latest received position<b>{report?`(${report.x.toFixed(0)}, ${report.y.toFixed(0)}) m · ${report.source}`:'No fix received'}</b></div>
      <div>Report age / payload<b>{age===null?'Unknown':`${age.toFixed(0)} s · ${report?.batteryPct?.toFixed(1)??'—'}% · ${report?.fault??'no fault'}`}</b></div>
      <div>Main battery policy<b>{node.reserveHold?'Essentials only · independent operation at 25%':'Compute sheds below 25%; propulsion below 10%'}</b></div>
      <div>Search dispatch limits<b>{state.recoveryFormation==='fleet'?'All healthy nodes · ≥35% reserve':'3 close escorts + ≤3 relay bridges · ≥35% battery'}</b></div>
    </div></div>
    <div className="w-channel-controls"><label>Recovery formation <select aria-label="Recovery formation" value={state.recoveryFormation} onChange={e=>onFormation?.(e.target.value as 'escort'|'fleet')}><option value="escort">Three-node escort</option><option value="fleet">Whole-fleet ring</option></select></label><label><input type="checkbox" checked={state.rightingOperational} onChange={()=>onToggle('rightingOperational')} />Righting kit operational</label><label><input type="checkbox" checked={state.satelliteAvailable} onChange={()=>onToggle('satelliteAvailable')} />Satellite test channel available</label><label><input type="checkbox" checked={state.skyView} onChange={()=>onToggle('skyView')} />Satellite antenna has sky view</label></div>
    <p className="w-channel-note">Design rehearsal: independent GNSS + low-rate satellite modem + sealed reserve cell. GPS receives position signals; it does not relay messages. A satellite report goes to shore and reaches the coordinator only while its backhaul is online. Assumptions: {DISTRESS.acquisitionS} s acquisition, {DISTRESS.reportIntervalS/60} min updates, {DISTRESS.packetWh} Wh/report, {DISTRESS.standbyW} W reserve standby. Not provider specifications. Inversion blocks the antenna until the conditional automatic righting sequence succeeds; ingress isolates main power but the separate sealed pod is assumed intact. The ring is protective positioning, not a physical enclosure. It follows drift; no anchoring, wave shelter, towing or energy transfer is credited. Sunrise is modeled at 06:00 each day, not a local forecast. <a href="https://www.gps.gov/faq" target="_blank" rel="noreferrer">GPS reference ↗</a> · <a href="https://ifp.iridium.com/products/iridium-9603/" target="_blank" rel="noreferrer">Satellite modem candidate ↗</a></p>
  </section>;
}
