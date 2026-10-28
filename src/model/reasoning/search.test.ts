import { createWeather, environment, network, SCENARIOS } from '../weather';
import { masterDesign,workerDesign } from '../nodeDesign';
import { planRescue } from '../weatherRescue';
import { searchPlan } from './search';
const designs={master:masterDesign(),worker:workerDesign()},c=SCENARIOS[0].conditions;
test('search follows a received fix and current estimate without reading target truth',()=>{
  const s=createWeather(designs);s.t=120;
  s.nodes[1]={...s.nodes[1],x:5000,y:5000,lostS:120,report:{x:420,y:0,t:0,source:'satellite',batteryPct:60,fault:'Link lost'}};
  const env=environment(c,s.t),connected=network(s,env.range).connected;
  const baseline=planRescue(s,c,env.range,Math.hypot(env.vx,env.vy),connected,designs);
  expect(baseline?.status).toBe('Extend relay chain');
  const plan=searchPlan(s,c,env.range,env,connected,designs,baseline,100);
  expect(plan?.reason).toContain('square search');expect(plan?.report).toEqual(s.nodes[1].report);
  expect(plan?.waypoints).not.toEqual(baseline?.waypoints);
  const moved={...s,nodes:s.nodes.map(n=>n.id==='W01'?{...n,x:9999,y:-8888}:n)};
  expect(searchPlan(moved,c,env.range,env,connected,designs,baseline,100)).toEqual(plan);
});
test('stale reports and infeasible recovery never trigger a sweep',()=>{
  const s=createWeather(designs);s.t=1000;
  s.nodes[1]={...s.nodes[1],x:5000,lostS:1000,report:{x:420,y:0,t:0,source:'satellite'}};
  const env=environment(c,s.t),connected=network(s,env.range).connected;
  const baseline=planRescue(s,c,env.range,Math.hypot(env.vx,env.vy),connected,designs);
  expect(baseline?.status).toBe('Shore retrieval');
  expect(searchPlan(s,c,env.range,env,connected,designs,baseline)).toEqual(baseline);
});
