import { masterDesign, workerDesign } from './nodeDesign';
import { batteryCapacityWh } from './swarm';
import { createWeather, environment, network, SCENARIOS, stepWeather } from './weather';
import { DISTRESS, planRescue } from './weatherRescue';
const designs={master:masterDesign(),worker:workerDesign()};
const calm={...SCENARIOS[0].conditions,current:0,tide:0,wind:0,swell:0};
const capacity=batteryCapacityWh(designs.worker);

test('8% reserve sheds to essentials and uses 25% recovery reserve before propulsion restarts',()=>{
  let s=createWeather(designs); s.nodes[1].wh=capacity*.08; s.nodes[1].x=550;
  s=stepWeather(s,calm,'night',1,designs);
  expect(s.nodes[1].mode).toBe('Power reserve');
  expect(s.nodes[1].x).toBe(550);
  expect(s.nodes[1].loadW).toBeCloseTo(23.2);
  s.nodes[1].wh=capacity*.12;
  s=stepWeather(s,calm,'night',1,designs);
  expect(s.nodes[1].mode).toBe('Power reserve');
  s.nodes[1].wh=capacity*.26;
  s=stepWeather(s,calm,'night',1,designs);
  expect(s.nodes[1].reserveHold).toBe(false);
  expect(s.nodes[1].x).toBeLessThan(550);
});
test('satellite reports survive main-power failure using the sealed reserve and acquisition delay',()=>{
  let s=createWeather(designs);s.nodes[1].wh=0;s.nodes[1].x=550;
  s=stepWeather(s,calm,'night',59,designs);
  expect(s.nodes[1].report?.source).toBe('mesh');
  s=stepWeather(s,calm,'night',1,designs);
  expect(s.nodes[1].report?.source).toBe('satellite');
  expect(s.nodes[1].report?.x).toBe(550);
  expect(s.nodes[1].report?.batteryPct).toBe(0);
  expect(s.nodes[1].wh).toBe(0);
  expect(s.nodes[1].beaconWh).toBeLessThan(DISTRESS.capacityWh-DISTRESS.packetWh);
  expect(s.rescue?.status).toBe('Shore retrieval');
});
test.each(['channel','sky','inversion','reserve'] as const)('%s failure prevents delivery instead of exposing simulation truth',failure=>{
  let s=createWeather(designs);const cachedX=s.nodes[1].report!.x;s.nodes[1].wh=0;s.nodes[1].x=550;
  if(failure==='channel')s.satelliteAvailable=false;
  if(failure==='sky')s.skyView=false;
  if(failure==='inversion'){s.nodes[1].inverted=true;s.rightingOperational=false;}
  if(failure==='reserve')s.nodes[1].beaconWh=.01;
  s=stepWeather(s,calm,'night',120,designs);
  expect(s.nodes[1].report?.source).toBe('mesh');
  expect(s.nodes[1].report?.x).toBe(cachedX);
  expect(s.nodes[1].lastSatelliteS).toBeNull();
});
test('no chase uses an unreported displaced position; a received satellite fix enables a bounded chain',()=>{
  let s=createWeather(designs);const cachedX=s.nodes[1].report!.x;s.nodes[1].x=550;s.nodes[1].wh=capacity*.08;
  s=stepWeather(s,calm,'night',20,designs);
  expect(s.rescue?.status).toBe('Await position');
  expect(s.rescue?.report?.x).toBe(cachedX);
  expect(s.rescue?.relayIds).toHaveLength(0);
  s=stepWeather(s,calm,'night',40,designs);
  expect(s.rescue?.status).toBe('Form escort ring');
  expect(s.rescue?.report?.x).toBe(550);
  expect(s.rescue?.escortIds).toHaveLength(3);
  expect(s.rescue?.relayIds.length).toBeLessThanOrEqual(3);
  const ids=s.rescue!.escortIds;
  for(let i=0;i<24;i++){
    s=stepWeather(s,calm,'night',50,designs);
    const net=network(s,environment(calm,s.t).range);
    expect(s.rescue?.escortIds).toEqual(ids);
    for(const id of ids)expect(net.connected.has(id)).toBe(true);
  }
  expect(network(s,250).connected.has(s.nodes[1].id)).toBe(true);
  expect(s.nodes[1].x).toBe(550); // contact restored, no invented tow
});
test('strong drift, insufficient energy, distant fixes and stale reports abort dispatch',()=>{
  const s=createWeather(designs); s.nodes[1].x=550;s.nodes[1].lostS=30;s.nodes[1].report={x:550,y:0,t:0,source:'satellite'};
  const net=network(s,250);
  expect(planRescue(s,calm,250,.5,net.connected,designs)?.status).toBe('Shore retrieval');
  const low={...s,nodes:s.nodes.map(n=>n.role==='worker'&&n.id!==s.nodes[1].id?{...n,wh:capacity*.3}:n)};
  expect(planRescue(low,calm,250,0,net.connected,designs)?.status).toBe('Shore retrieval');
  s.nodes[1].report.x=2000;
  expect(planRescue(s,calm,250,0,net.connected,designs)?.status).toBe('Shore retrieval');
  s.nodes[1].report.x=550;s.t=901;
  expect(planRescue(s,calm,250,0,net.connected,designs)?.status).toBe('Shore retrieval');
});
test('wildlife hold prevents search movement; master loss still allows reports to shore without dispatch',()=>{
  let s=createWeather(designs);s.masterOnline=false;s.nodes[1].x=550;
  s=stepWeather(s,calm,'night',60,designs);
  expect(s.nodes[1].report?.source).toBe('satellite');
  expect(s.rescue?.relayIds).toHaveLength(0);
  expect(network(s,250).connected.size).toBe(0);
  s.masterOnline=true;s.wildlife=true;
  s=stepWeather(s,calm,'night',1,designs);
  expect(s.rescue?.status).toBe('Wildlife hold');
  expect(s.rescue?.relayIds).toHaveLength(0);
});
