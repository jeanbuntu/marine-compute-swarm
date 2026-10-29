import { createWeather, environment, network, SCENARIOS, stepWeather } from './weather';
import { masterDesign, workerDesign } from './nodeDesign';
import { batteryCapacityWh } from './swarm';
const designs = { master: masterDesign(), worker: workerDesign() };
const conditions = { ...SCENARIOS[0].conditions, current: 0, tide: 0, wind: 0 };

test('mesh relays connect a worker outside direct master range', () => {
  const s = createWeather(designs);
  s.nodes = s.nodes.slice(0, 3).map((n, i) => ({ ...n, x: i * 200, y: 0 }));
  expect(network(s, 250).connected.size).toBe(3);
  s.nodes[1].inverted = true;
  expect(network(s, 250).connected.has(s.nodes[2].id)).toBe(false);
});
test('loss timeout enters autonomous return; a restored link clears the timer', () => {
  let s = createWeather(designs);
  s.nodes[1].x = 1000;
  s = stepWeather(s, conditions, 'day', 14, designs);
  expect(s.nodes[1].mode).toBe('Link grace');
  s = stepWeather(s, conditions, 'day', 2, designs);
  expect(s.nodes[1].mode).toBe('Returning');
  expect(s.nodes[1].x).toBeLessThan(1000);
  s.nodes[1].x = 65;
  s = stepWeather(s, conditions, 'day', 1, designs);
  expect(s.nodes[1].lostS).toBe(0);
  expect(s.nodes[1].mode).toBe('Holding');
});
test('opposing current faster than propulsion causes a retrieval alert', () => {
  const s = createWeather(designs); s.nodes[1].x = 1000;
  const next = stepWeather(s, { ...conditions, current: 0.8 }, 'current', 20, designs);
  expect(next.nodes[1].mode).toBe('Retrieval');
  expect(next.nodes[1].x).toBeGreaterThan(1000);
});
test('failed righting cannot generate PV or propel', () => {
  const s = createWeather(designs); s.rightingOperational=false; s.nodes[1].inverted = true; s.nodes[1].x = 1000;
  const next = stepWeather(s, conditions, 'swells', 60, designs);
  expect(next.nodes[1].mode).toBe('Inverted');
  expect(next.nodes[1].inverted).toBe(true);
  expect(next.nodes[1].x).toBe(1000);
  expect(next.nodes[1].pvW).toBe(0);
  expect(next.nodes[1].wh).toBeLessThan(s.nodes[1].wh);
});
test('night drains the battery; compute is shed at reserve thresholds', () => {
  const s = createWeather(designs);
  const normal = stepWeather(s, conditions, 'night', 1, designs);
  expect(normal.nodes[1].pvW).toBe(0);
  expect(normal.nodes[1].wh).toBeLessThan(s.nodes[1].wh);
  s.nodes[1].wh = batteryCapacityWh(designs.worker) * .08;
  s.nodes[1].x = 1000;
  const reserve = stepWeather(s, conditions, 'night', 1, designs);
  expect(reserve.nodes[1].mode).toBe('Power reserve');
  expect(reserve.nodes[1].x).toBe(1000);
  expect(reserve.nodes[1].loadW).toBeLessThan(normal.nodes[1].loadW);
});
test('ingress isolates electrical loads and the mesh, without charging', () => {
  const s = createWeather(designs); s.nodes[1].ingress = true;
  const next = stepWeather(s, conditions, 'day', 60, designs);
  expect(next.nodes[1].mode).toBe('Offline');
  expect(next.nodes[1].pvW).toBe(0);
  expect(next.nodes[1].wh).toBe(s.nodes[1].wh);
  expect(network(next, 250).connected.has(s.nodes[1].id)).toBe(false);
});
test('wildlife hold idles thrust fleet-wide, leaving environmental drift', () => {
  const s = createWeather(designs); s.wildlife = true;
  const next = stepWeather(s, { ...conditions, current: .3 }, 'day', 10, designs);
  next.nodes.forEach((n, i) => {
    expect(n.mode).toBe('Wildlife hold');
    expect(n.x - s.nodes[i].x).toBeCloseTo(3);
  });
});
test('master failure disconnects every worker and does not invent a satellite backup', () => {
  const s = createWeather(designs); s.masterOnline = false;
  expect(network(s, 250).connected.size).toBe(0);
  const next = stepWeather(s, conditions, 'day', 20, designs);
  expect(next.nodes[0].mode).toBe('Offline');
  expect(next.nodes[1].lostS).toBe(20);
});
test('tidal current reverses; heavy seas reduce assumed link radius', () => {
  const tide = { ...conditions, tide: .7 };
  expect(environment(tide, 0).stream).toBeCloseTo(.7);
  expect(environment(tide, 12.42 * 3600 / 2).stream).toBeCloseTo(-.7);
  expect(environment(SCENARIOS[3].conditions, 0).range).toBeLessThan(conditions.range);
});
test('fixed substeps give deterministic results at accelerated playback', () => {
  const s = createWeather(designs);
  let a = stepWeather(s, conditions, 'night', 60, designs);
  let b = s;
  for (let i = 0; i < 60; i++) b = stepWeather(b, conditions, 'night', 1, designs);
  expect(a).toEqual(b);
});
test('paused failure refresh updates status and telemetry without advancing time or position', () => {
  const s = createWeather(designs); s.nodes[1].inverted = true;
  const next = stepWeather(s, conditions, 'day', 0, designs);
  expect(next.t).toBe(0);
  expect(next.nodes[1].x).toBe(s.nodes[1].x);
  expect(next.nodes[1].wh).toBe(s.nodes[1].wh);
  expect(next.nodes[1].mode).toBe('Self-righting');
  expect(next.nodes[1].pvW).toBe(0);
});

test('terminal failure pins the teaching marker while physical drift and telemetry stay independent', () => {
  const designs = {master:masterDesign(),worker:workerDesign()};
  let state=createWeather(designs);
  state.nodes[1].ingress=true;
  const c=SCENARIOS[0].conditions;
  state=stepWeather(state,c,'day',0,designs);
  const anchor=state.nodes[1].displayAnchor!;
  expect(anchor).toEqual({x:state.nodes[1].x,y:state.nodes[1].y});
  state=stepWeather(state,c,'day',60,designs);
  expect(state.nodes[1].displayAnchor).toEqual(anchor);
  expect(state.nodes[1].x).not.toBe(anchor.x);
  expect(state.nodes[2].displayAnchor).toBeUndefined();
});
