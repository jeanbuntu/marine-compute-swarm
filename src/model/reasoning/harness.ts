import { batteryCapacityWh, type Designs } from '../swarm';
import { environment, network, type Conditions, type ScenarioId, type WeatherState } from '../weather';
import { weatherSun } from '../weatherRecovery';
import { makeSky } from '../sky';
import { simulatedTracker } from '../tracker';

export { decisionSchema, observationSchema, messages, SYSTEM_PROMPT } from './protocol';
export type { Decision, Observation } from './protocol';
import type { Decision, Observation } from './protocol';

export function observe(s:WeatherState,c:Conditions,scenario:ScenarioId,designs:Designs,skyConfig:{seed:number;coverage:number;windEastMs:number;windNorthMs:number;latDeg:number;lonDeg:number}):Observation {
  const env=environment(c,s.t), connected=network(s,env.range).connected;
  const nodes=s.nodes.map(n=>{const linked=connected.has(n.id); const report=n.report;
    return {id:n.id,role:n.role,connected:linked,report,reportAgeS:report?Math.max(0,s.t-report.t):null,
      batteryPct:linked?n.wh/batteryCapacityWh(designs[n.role])*100:report?.batteryPct??null,
      fault:linked?n.ingress?'Ingress':n.inverted?'Inverted':n.reserveHold?'Low battery':'Healthy':report?.fault??null,
      pvW:linked?n.pvW:null,loadW:linked?n.loadW:null};});
  const sky=makeSky({...skyConfig,windMs:[skyConfig.windEastMs,skyConfig.windNorthMs]});
  const tracker=simulatedTracker(sky,{noiseM:0,dropRate:0,seed:skyConfig.seed});
  const master=nodes.find(n=>n.role==='master');
  const count=master?.connected&&master.report?tracker.track({t:s.t,nodeId:master.id,x:master.report.x,y:master.report.y,widthPx:640,heightPx:640}).length:0;
  const adverse=[...(!s.masterOnline?['coordinator-offline']:[]),...(s.wildlife?['wildlife']:[]),...(c.wind>=12?['survival-weather']:[]),...(Math.hypot(env.vx,env.vy)>c.speed*.85?['insufficient-thrust-margin']:[]),...nodes.filter(n=>!n.connected||n.fault!=='Healthy'||(n.batteryPct!==null&&n.batteryPct<25)).map(n=>`${n.id}:${!n.connected?'lost-link':n.fault==='Healthy'?'low-charge':n.fault}`)];
  const sun=weatherSun(s.t,scenario);
  return {version:1,t:s.t,scenario,conditions:c,coordinatorOnline:!!master?.connected,wildlife:s.wildlife,environment:{vx:env.vx,vy:env.vy,range:env.range,stowed:env.stowed},sun:{hour:sun.hour,ghi:sun.ghi},nodes,
    clouds:{source:'seeded simulated tracker; advisory, separate from weather PV',count,coverage:skyConfig.coverage,windEastMs:skyConfig.windEastMs,windNorthMs:skyConfig.windNorthMs},
    baseline:{status:s.rescue?.status??'Routine formation',reason:s.rescue?.reason??'Local station keeping and energy thresholds',targetId:s.rescue?.targetId??null},adverse};
}
export const signature=(o:Observation)=>JSON.stringify([o.scenario,o.conditions,o.coordinatorOnline,o.wildlife,o.adverse,o.baseline.status,o.baseline.targetId,o.clouds.coverage,o.clouds.windEastMs,o.clouds.windNorthMs]);
export function demoDecision(o:Observation):Decision {return {strategy:o.wildlife?'hold':o.adverse.includes('insufficient-thrust-margin')?'retrieve':o.adverse.length?'conserve':'baseline',summary:'Deterministic rehearsal response. No model was called.',evidence:o.adverse,uncertainty:['Conceptual weather, radio and recovery estimates'],nextCheckS:60};}
export function validateDecision(d:Decision,o:Observation):string|null {
  if(!o.coordinatorOnline)return 'Coordinator/backhaul unavailable; local autonomy continues.';
  if(o.wildlife&&d.strategy!=='hold'&&d.strategy!=='baseline')return 'Wildlife hold cannot be overridden.';
  if(d.strategy==='search'&&(o.baseline.status!=='Extend relay chain'||!o.nodes.some(n=>n.id===o.baseline.targetId&&!n.connected&&n.report?.source==='satellite'&&n.reportAgeS!==null&&n.reportAgeS<=900)))return 'Search requires a fresh satellite fix and a feasible relay chain.';
  if(['escort','fleet'].includes(d.strategy)) {
    if(o.baseline.status==='Shore retrieval'||o.baseline.status==='Wildlife hold')return 'Local recovery planner refuses dispatch.';
    if(!o.nodes.some(n=>n.fault==='Low battery'&&n.reportAgeS!==null&&n.reportAgeS<=900))return 'No fresh low-charge survivor report for a recovery ring.';
  }
  return null;
}
