import { masterDesign, workerDesign } from './nodeDesign';
import { batteryCapacityWh } from './swarm';
import { createWeather, environment, network, SCENARIOS, stepWeather } from './weather';
import { weatherSun } from './weatherRecovery';
const designs={master:masterDesign(),worker:workerDesign()};
const calm={...SCENARIOS[0].conditions,wind:0,current:0,tide:0,swell:0};

test.each(['worker','master'] as const)('%s automatically rights itself on the live map and spends its one-shot kit',role=>{
 let s=createWeather(designs);const i=role==='master'?0:1;s.nodes[i].inverted=true;
 s=stepWeather(s,calm,'day',30,designs);
 expect(s.nodes[i].inverted).toBe(true);
 expect(s.nodes[i].righting.inflation).toBe(1);
 expect(s.nodes[i].righting.phase).toBe('Rolling');
 s=stepWeather(s,calm,'day',31,designs);
 expect(s.nodes[i].inverted).toBe(false);
 expect(s.nodes[i].righting.phase).toBe('Upright');
 expect(s.nodes[i].righting.gasAvailable).toBe(false);
 expect(s.nodes[i].pvW).toBeGreaterThan(0);
 s.nodes[i].inverted=true;
 s=stepWeather(s,calm,'day',1,designs);
 expect(s.nodes[i].righting.phase).toBe('Failed');
 expect(s.nodes[i].inverted).toBe(true);
});
test.each(['bag','ingress','power'] as const)('%s failure leaves inversion latched and propulsion isolated',failure=>{
 let s=createWeather(designs);s.nodes[1].inverted=true;
 if(failure==='bag')s.rightingOperational=false;
 if(failure==='ingress')s.nodes[1].ingress=true;
 if(failure==='power'){s.nodes[1].wh=0;s.nodes[1].beaconWh=0;}
 s=stepWeather(s,calm,'day',120,designs);
 expect(s.nodes[1].inverted).toBe(true);
 expect(s.nodes[1].righting.phase).toBe('Failed');
 expect(s.nodes[1].pvW).toBe(0);
 expect(s.nodes[1].x).toBeCloseTo(-50);
});
test('night reaches sunrise without resetting the node or battery',()=>{
 expect(weatherSun(0,'night').ghi).toBe(0);
 expect(weatherSun(11*3600,'night').ghi).toBe(0);
 expect(weatherSun(13*3600,'night').ghi).toBeGreaterThan(0);
 expect(weatherSun(13*3600,'night').day).toBe(2);
});
test.each(['escort','fleet'] as const)('%s formation reaches the low-battery node while retaining mesh links',formation=>{
 let s=createWeather(designs);s.recoveryFormation=formation;s.nodes[1].wh=batteryCapacityWh(designs.worker)*.08;
 s=stepWeather(s,calm,'night',1500,designs);
 expect(s.rescue?.status).toBe('Shelter & recharge');
 expect(s.rescue?.escortIds).toHaveLength(formation==='escort'?3:12);
 for(const id of s.rescue!.escortIds){
  const n=s.nodes.find(n=>n.id===id)!;
  expect(Math.hypot(n.x-s.nodes[1].x,n.y-s.nodes[1].y)).toBeGreaterThan(25);
  expect(Math.hypot(n.x-s.nodes[1].x,n.y-s.nodes[1].y)).toBeLessThan(48);
 }
 expect(network(s,250).connected.size).toBe(13);
 expect(s.nodes[1].loadW).toBeCloseTo(23.2);
 expect(s.nodes[1].reserveHold).toBe(true);
});
test.each(['escort','fleet'] as const)('%s formation follows overnight drift, then solar restores independent operation at 25%',formation=>{
 let s=createWeather(designs);s.recoveryFormation=formation;s.nodes[1].wh=batteryCapacityWh(designs.worker)*.08;
 const mild=SCENARIOS.find(p=>p.id==='night')!.conditions;
 s=stepWeather(s,mild,'night',12*3600,designs);
 expect(s.nodes[1].reserveHold).toBe(true);
 expect(s.rescue?.status).toBe('Shelter & recharge');
 expect(s.nodes[1].wh).toBeGreaterThan(0);
 expect(Math.hypot(s.nodes[1].x-s.nodes[1].homeX,s.nodes[1].y-s.nodes[1].homeY)).toBeGreaterThan(1000);
 expect(network(s,environment(mild,s.t).range).connected.size).toBe(13);
 s=stepWeather(s,mild,'night',5*3600,designs);
 expect(s.nodes[1].pvW).toBeGreaterThan(0);
 expect(s.nodes[1].wh/batteryCapacityWh(designs.worker)).toBeGreaterThan(.25);
 expect(s.nodes[1].reserveHold).toBe(false);
});

test('a capsize and a second low-battery node recover concurrently without losing the reserve request',()=>{
 let s=createWeather(designs);s.nodes[1].inverted=true;s.nodes[2].wh=batteryCapacityWh(designs.worker)*.08;
 s=stepWeather(s,calm,'night',1800,designs);
 expect(s.nodes[1].inverted).toBe(false);
 expect(s.nodes[2].reserveHold).toBe(true);
 expect(s.rescue?.targetId).toBe(s.nodes[2].id);
 expect(s.rescue?.status).toBe('Shelter & recharge');
 s.wildlife=true;s=stepWeather(s,calm,'night',1,designs);
 expect(s.nodes[2].loadW).toBeCloseTo(23.2);
});
