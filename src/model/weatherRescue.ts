import { batteryCapacityWh, type Designs } from './swarm';
import type { Conditions, WeatherState } from './weather';

/** Scenario assumptions, not modem specifications or a service guarantee. */
export const DISTRESS = { capacityWh:20, standbyW:.05, packetWh:.2, acquisitionS:60, reportIntervalS:300 };
export interface PositionReport { x:number;y:number;t:number;source:'mesh'|'satellite';batteryPct?:number;fault?:string }
export interface RescueWaypoint { id:string;x:number;y:number;anchorId:string;kind?:'bridge'|'ring'|'fleet' }
export interface RescuePlan {
  targetId:string;
  status:'Maintain contact'|'Await position'|'Extend relay chain'|'Shore retrieval'|'Wildlife hold'|'Form escort ring'|'Shelter & recharge'|'Fleet rendezvous';
  reason:string;report:PositionReport|null;relayIds:string[];escortIds:string[];waypoints:RescueWaypoint[];uncertaintyM:number;ringRadiusM:number;anchorOffset?:{x:number;y:number};
}
/** Coordinates used for navigation are received fixes, never disconnected truth positions. */
export function planRescue(s:WeatherState,c:Conditions,range:number,driftMs:number,connected:Set<string>,designs:Designs):RescuePlan|null {
  const master=s.nodes[0];
  const distressed=s.nodes.filter(n=>n.reserveHold||n.wh/batteryCapacityWh(designs[n.role])<.1||n.lostS>=15||n.inverted||n.ingress);
  const prior=s.nodes.find(n=>n.id===s.rescue?.targetId);
  if(prior?.report&&s.rescue?.relayIds.length&&Math.hypot(prior.report.x-master.x,prior.report.y-master.y)>range*.7&&!distressed.includes(prior))distressed.push(prior);
  const reserves=distressed.filter(n=>n.reserveHold);
  const target=reserves.find(n=>n.id===s.rescue?.targetId)??reserves[0]??distressed.find(n=>n.id===s.rescue?.targetId)??distressed[0];
  if(!target)return null;
  const report=target.report,age=report?Math.max(0,s.t-report.t):Infinity;
  const plan:RescuePlan={targetId:target.id,status:'Maintain contact',reason:'',report,relayIds:[],escortIds:[],waypoints:[],uncertaintyM:report?10+age*(c.current+c.tide+c.wind*.018+c.speed):0,ringRadiusM:0};
  if(s.wildlife)return {...plan,status:'Wildlife hold',reason:'Thrusters idle around wildlife. Local righting can continue, but escort movement waits until wildlife clears.'};
  if(!connected.has(master.id)||(master.id!==target.id&&master.wh/batteryCapacityWh(designs.master)<.2))return {...plan,status:'Shore retrieval',reason:'Coordinator unavailable or without dispatch reserve. Distress reports may still reach shore.'};
  if(target.inverted)return {...plan,status:target.righting.phase==='Failed'?'Shore retrieval':'Maintain contact',reason:target.righting.phase==='Failed'?'Righting failed or the one-shot gas charge is unavailable. Physical retrieval required.':'The onboard controller is isolating propulsion, inflating the bag and rolling upright. No coordinator link is needed for the local attempt; completion is a conditional mechanism assumption.'};
  if(target.ingress||target.wh<=0)return {...plan,status:'Shore retrieval',reason:'Ingress or main-bus failure requires physical retrieval. A separate sealed distress pod may still report.'};
  if(!report||age>900)return {...plan,status:'Shore retrieval',reason:'No fix within 15 minutes. Preserve the fleet rather than pursue an increasingly uncertain position.'};
  const dx=report.x-master.x,dy=report.y-master.y,distance=Math.hypot(dx,dy);
  if(driftMs>c.speed*.85)return {...plan,status:'Shore retrieval',reason:'Too little propulsion headroom to station-keep or maintain an escort ring. The survivor keeps solar and essential controls; physical retrieval is requested.'};
  if(!connected.has(target.id)&&report.source==='mesh')return {...plan,status:'Await position',reason:'Await a satellite fix before leaving the last known mesh position. The target’s actual map position is not used for navigation.'};
  const stableIds=[...(s.rescue?.escortIds??[]),...(s.rescue?.relayIds??[])];
  const eligible=s.nodes.filter(n=>n.id!==target.id&&n.role==='worker'&&connected.has(n.id)&&!n.inverted&&!n.ingress&&!n.reserveHold&&n.wh/batteryCapacityWh(designs.worker)>=.35)
    .sort((a,b)=>{
      const order=(id:string)=>{const i=stableIds.indexOf(id);return i<0?99:i;};
      return order(a.id)-order(b.id)||Math.hypot(a.x-report.x,a.y-report.y)-Math.hypot(b.x-report.x,b.y-report.y)||a.id.localeCompare(b.id);
    });
  const hop=range*.7;
  if(target.reserveHold){
    const radius=Math.min(40,range*.16);
    const unready=s.nodes.some(n=>n.id!==target.id&&(!connected.has(n.id)||n.inverted||n.ingress||n.reserveHold||n.wh/batteryCapacityWh(designs[n.role])<.35));
    if(unready)return {...plan,status:'Shore retrieval',reason:'Another node is damaged, disconnected or below the 35% escort reserve. Do not relocate the fleet while abandoning it; preserve contact and request retrieval.'};
    if(radius<12)return {...plan,status:'Shore retrieval',reason:'Radio margin is too small for a separated protective formation.'};
    if(s.recoveryFormation==='fleet'){
      const helpers=s.nodes.filter(n=>n.id!==target.id);
      if(helpers.some(n=>!connected.has(n.id)||n.inverted||n.ingress||n.reserveHold||n.wh/batteryCapacityWh(designs[n.role])<.35))return {...plan,status:'Shore retrieval',reason:'Whole-fleet rendezvous would abandon another disconnected, damaged or low-reserve node. Restore that node or use a three-node escort instead.'};
      const ordered=helpers.slice().sort((a,b)=>a.role==='master'?-1:b.role==='master'?1:a.id.localeCompare(b.id));
      const waypoints:RescueWaypoint[]=ordered.map((n,i)=>{const a=Math.PI+2*Math.PI*i/ordered.length;return {id:n.id,x:report.x+radius*Math.cos(a),y:report.y+radius*Math.sin(a),anchorId:master.id,kind:n.role==='master'?'fleet':'ring'};});
      const arrived=waypoints.every(w=>{const n=s.nodes.find(n=>n.id===w.id)!;return Math.hypot(n.x-w.x,n.y-w.y)<8;});
      return {...plan,status:arrived?'Shelter & recharge':'Fleet rendezvous',reason:'The healthy fleet moves around the survivor, idles compute and stays together until its battery reaches 25%. The formation follows the survivor’s drift; it does not anchor, tow or transfer energy.',escortIds:ordered.map(n=>n.id),waypoints,ringRadiusM:radius};
    }
    const bridges=Math.max(0,Math.ceil(Math.max(0,distance-radius)/hop)-1);
    if(bridges>3||eligible.length<3+bridges)return {...plan,status:'Shore retrieval',reason:'Need three healthy escorts plus sufficient relay bridges (at most three). Preserve the remaining fleet when that energy or radio margin is unavailable.'};
    const escorts=eligible.slice(0,3),relays=eligible.slice(3,3+bridges);
    const raw=s.rescue?.targetId===target.id&&s.rescue.anchorOffset?s.rescue.anchorOffset:{x:master.x-report.x,y:master.y-report.y};
    const norm=Math.hypot(raw.x,raw.y),factor=Math.min(1,hop/Math.max(norm,1e-6));
    const anchorOffset={x:raw.x*factor,y:raw.y*factor};
    const waypoints:RescueWaypoint[]=relays.map((n,i)=>({id:n.id,x:master.x+dx*(i+1)/(bridges+1),y:master.y+dy*(i+1)/(bridges+1),anchorId:i===0?master.id:relays[i-1].id,kind:'bridge'}));
    escorts.forEach((n,i)=>{const a=Math.PI+2*Math.PI*i/3;waypoints.push({id:n.id,x:report.x+radius*Math.cos(a),y:report.y+radius*Math.sin(a),anchorId:relays.at(-1)?.id??master.id,kind:'ring'});});
    if(master.id!==target.id) waypoints.push({id:master.id,x:report.x+anchorOffset.x,y:report.y+anchorOffset.y,anchorId:master.id,kind:'fleet'});
    s.nodes.filter(n=>n.id!==master.id&&n.id!==target.id&&!waypoints.some(w=>w.id===n.id)).forEach(n=>waypoints.push({id:n.id,x:master.x+n.homeX-master.homeX,y:master.y+n.homeY-master.homeY,anchorId:master.id,kind:'fleet'}));
    const arrived=connected.has(target.id)&&escorts.every(n=>{const w=waypoints.find(w=>w.id===n.id)!;return Math.hypot(n.x-w.x,n.y-w.y)<8;});
    return {...plan,status:arrived?'Shelter & recharge':'Form escort ring',reason:'Three healthy workers surround the survivor. Relay bridges retain contact while the coordinator and remaining fleet shift their rendezvous to accompany the survivor’s drift. The survivor keeps only navigation, BMS and communications; escorts keep compute off and wait through sunrise until 25% charge. No physical restraint or towing is assumed.',escortIds:escorts.map(n=>n.id),relayIds:relays.map(n=>n.id),waypoints,ringRadiusM:radius,anchorOffset};
  }
  if(connected.has(target.id)&&distance<range*.8)return {...plan,reason:'Contact restored. The charged node and its escorts return to their cached formation slots.'};
  const count=Math.max(1,Math.ceil(distance/hop)-1);
  if(count>3||eligible.length<count)return {...plan,status:'Shore retrieval',reason:'Outside the three-relay envelope or too few workers have 35% charge.'};
  const relays=eligible.slice(0,count),relayIds=relays.map(n=>n.id);
  return {...plan,status:'Extend relay chain',reason:'Healthy workers extend contact toward the reported fix while retaining a 30% link maneuver margin.',relayIds,waypoints:relayIds.map((id,i)=>({id,x:master.x+dx*(i+1)/(count+1),y:master.y+dy*(i+1)/(count+1),anchorId:i===0?master.id:relayIds[i-1],kind:'bridge'}))};
}
