import { workerDesign, masterDesign } from '../nodeDesign';
import { createWeather, SCENARIOS, stepWeather } from '../weather';
import { defaultConfig } from '../config';
import { batteryCapacityWh } from '../swarm';
import { decisionSchema, demoDecision, observe, validateDecision } from './harness';
const designs={worker:workerDesign(),master:masterDesign()},c=SCENARIOS[0].conditions;
const snapshot=()=>observe(createWeather(designs),c,'day',designs,defaultConfig());
test('disconnected truth coordinates, power and battery never enter the observation',()=>{
  const s=createWeather(designs);s.nodes[1]={...s.nodes[1],x:123456,y:654321,wh:1,pvW:9999};
  const o=observe(s,c,'day',designs,defaultConfig());
  expect(o.nodes[1].connected).toBe(false);expect(o.nodes[1].report?.x).not.toBe(123456);
  expect(o.nodes[1].batteryPct).toBe(60);expect(o.nodes[1].pvW).toBeNull();
  expect(JSON.stringify(o)).not.toContain('654321');
});
test('decision schema rejects invented tools, unbounded expiry and extra executable fields',()=>{
  const d=demoDecision(snapshot());expect(decisionSchema.safeParse({...d,strategy:'tow'}).success).toBe(false);
  expect(decisionSchema.safeParse({...d,nextCheckS:10000}).success).toBe(false);
  expect(decisionSchema.safeParse({...d,code:'execute()'}).success).toBe(false);
});
test('coordinator loss and wildlife constrain model proposals',()=>{
  const o=snapshot(),d=demoDecision(o);
  expect(validateDecision({...d,strategy:'fleet'},{...o,coordinatorOnline:false})).toMatch(/unavailable/);
  expect(validateDecision({...d,strategy:'escort'},{...o,wildlife:true})).toMatch(/Wildlife/);
});
test('conserve reduces real loads, expires, and cannot restart an isolated node',()=>{
  const initial=createWeather(designs);
  const base=stepWeather(initial,c,'day',1,designs);
  const conserved=stepWeather({...initial,reasoningPolicy:{strategy:'conserve',expiresAt:60}},c,'day',1,designs);
  expect(conserved.nodes[1].loadW).toBeLessThan(base.nodes[1].loadW);
  const expired=stepWeather({...initial,reasoningPolicy:{strategy:'conserve',expiresAt:0}},c,'day',1,designs);
  expect(expired.nodes[1].loadW).toBe(base.nodes[1].loadW);
  const damaged={...initial,nodes:initial.nodes.map((n,i)=>i===1?{...n,ingress:true}:n),reasoningPolicy:{strategy:'fleet' as const,expiresAt:60}};
  const result=stepWeather(damaged,c,'day',1,designs);
  expect(result.nodes[1].mode).toBe('Offline');expect(result.nodes[1].loadW).toBe(0);
});
test('hold idles propulsion without bypassing survival battery latch',()=>{
  const s=createWeather(designs);s.nodes[1].wh=batteryCapacityWh(designs.worker)*.08;
  const next=stepWeather({...s,reasoningPolicy:{strategy:'hold',expiresAt:60}},c,'day',1,designs);
  expect(next.nodes[1].reserveHold).toBe(true);
  expect(next.nodes[1].x-s.nodes[1].x).toBeCloseTo(c.current+c.tide+c.wind*.018);
});
