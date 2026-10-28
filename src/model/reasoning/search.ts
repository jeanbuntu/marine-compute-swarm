import type { Designs } from '../swarm';
import type { Conditions, WeatherState } from '../weather';
import { planRescue, type RescuePlan } from '../weatherRescue';

/** A bounded drift-biased square sweep around a received fix; no target truth is read. */
export function searchPlan(s:WeatherState,c:Conditions,range:number,flow:{vx:number;vy:number},connected:Set<string>,designs:Designs,baseline:RescuePlan|null,radiusM=40):RescuePlan|null {
  if(!baseline||baseline.status!=='Extend relay chain'||!baseline.report)return baseline;
  const report=baseline.report,age=s.t-report.t;
  if(age<0||age>900||report.source!=='satellite')return baseline;
  const radius=Math.min(radiusM,range*.1);
  const leg=Math.floor(age/60)%8;
  const offsets=[[0,0],[1,0],[1,1],[-1,1],[-1,-1],[1,-1],[1,0],[0,0]];
  const [dx,dy]=offsets[leg];
  const estimated={...report,x:report.x+flow.vx*age+dx*radius,y:report.y+flow.vy*age+dy*radius};
  // The existing planner rechecks drift, reserves, helper count and chain reach at the search point.
  const input={...s,nodes:s.nodes.map(n=>n.id===baseline.targetId?{...n,report:estimated}:n)};
  const planned=planRescue(input,c,range,Math.hypot(flow.vx,flow.vy),connected,designs);
  if(!planned||planned.status!=='Extend relay chain')return baseline;
  return {...planned,report,uncertaintyM:baseline.uncertaintyM,reason:`Bounded drift-biased square search, leg ${leg+1}/8, offset radius ${radius.toFixed(0)} m. Uses the received satellite fix and estimated current, not target truth. Local relay margins remain enforced; mesh contact is the only modeled detection.`,};
}
