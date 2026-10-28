import { masterDesign, workerDesign } from '../nodeDesign';
import { PETAL_IDS, PETAL_PAIRS, PANEL_STACK_PITCH_M } from '../hardware';
import { minimumPetalClearance, petalPrism, prismSeparation, limitPetalMotion, PETAL_CLEARANCE_M } from './petalClearance';
import { uniformTilts } from './petals';
import { MasterSim, defaultMasterParams } from './masterSim';
import { SEA_PRESETS } from './waves';

it('detects the previously unchecked edge crossing at large equal tilts', () => {
  expect(minimumPetalClearance(masterDesign(),uniformTilts(75))).toBeLessThan(0);
});

it('keeps full-thickness frames and rails apart throughout ordinary independent travel, including hardware edits', () => {
  for (const side of [1,1.6,2.5]) for (const length of [0.4,1.1,2]) {
    const d = { ...workerDesign(),hullSideM:side,petalLengthM:length };
    for (let i=0;i<8;i++) for (let j=i+1;j<8;j++) for (const a of [-30,0,30]) for (const b of [-30,0,30]) {
      expect(prismSeparation(petalPrism(d,PETAL_IDS[i],a),petalPrism(d,PETAL_IDS[j],b))).toBeGreaterThanOrEqual(PETAL_CLEARANCE_M);
    }
  }
});

it('stops before contact and certifies the entire path, not only the final frame', () => {
  const d = masterDesign(), start = uniformTilts(20), goal = uniformTilts(75);
  const safe = limitPetalMotion(d,start,goal);
  expect(safe.limited).toBe(true);
  expect(safe.fraction).toBeGreaterThan(0.1);
  expect(minimumPetalClearance(d,safe.angles)).toBeGreaterThanOrEqual(PETAL_CLEARANCE_M-1e-8);
  for (let k=0;k<=100;k++) {
    const t=uniformTilts(20+(safe.angles.E-20)*k/100);
    expect(minimumPetalClearance(d,t)).toBeGreaterThanOrEqual(PETAL_CLEARANCE_M-1e-8);
  }
  const retreat=limitPetalMotion(d,safe.angles,uniformTilts(0));
  expect(retreat.limited).toBe(false);
  expect(retreat.angles.E).toBeCloseTo(0,8);
  // The next control tick must not creep through the contact boundary.
  const again=limitPetalMotion(d,safe.angles,goal);
  expect(again.limited).toBe(true);
  expect(minimumPetalClearance(d,again.angles)).toBeGreaterThanOrEqual(PETAL_CLEARANCE_M-1e-8);
});

it('allows harmless moves and retains linked-pair angles', () => {
  const d=workerDesign(), start=uniformTilts(0), target={ ...uniformTilts(0),W:25,NW:25 };
  const safe=limitPetalMotion(d,start,target);
  expect(safe.limited).toBe(false);
  for (const [a,b] of PETAL_PAIRS) expect(safe.angles[a]).toBe(safe.angles[b]);
});

it.each([workerDesign(), masterDesign()])('keeps live tracking, rapid commands and wind stowing clear ($role)', d => {
  const p=defaultMasterParams();
  const sim=new MasterSim({ ...p, sea:{ ...SEA_PRESETS.calm,seed:1 }, sun:{ ...p.sun,mode:'manual',azDeg:95,elevDeg:12 }, windMs:3, actuator:{ ...p.actuator, rateDegS:40 } },d);
  let sawInterlock = false;
  for(let k=0;k<500;k++) {
    if(k===180) sim.set({ sun:{ ...sim.params.sun,azDeg:270,elevDeg:20 } });
    if(k===350) sim.set({ windMs:18 });
    sim.step(0.1);
    sawInterlock ||= sim.telemetry.collisionLimited;
    expect(minimumPetalClearance(d,sim.tilts)).toBeGreaterThanOrEqual(PETAL_CLEARANCE_M-1e-8);
    for(const [a,b] of PETAL_PAIRS) expect(sim.tilts[a]).toBe(sim.tilts[b]);
  }
  expect(sawInterlock).toBe(true);
  expect(Math.max(...Object.values(sim.tilts).map(Math.abs))).toBeLessThan(0.1);
});


it('leaves rail and frame clearance between layers of the static stowed stack', () => {
  expect(PANEL_STACK_PITCH_M - (0.03 + 0.06)).toBeGreaterThanOrEqual(PETAL_CLEARANCE_M);
});
