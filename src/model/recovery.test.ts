import { masterDesign, workerDesign, partMassKg } from './nodeDesign';
import { evaluateWorst } from './hydrostatics';
import { loadW } from './power';
import { recoveryHardware, recoveryPose, RECOVERY_STAGES } from './recovery';

test.each([workerDesign(),masterDesign()])('$role recovery hardware has mass and overhead, and retains upright stability',d=>{
  const ids=['recovery-cassette','righting-gas','safety-controller','distress-beacon','leak-sensor','perimeter-bumper','panel-restraints'];
  for(const id of ids)expect(d.parts.find(p=>p.id===id)?.massKg).toBeGreaterThan(0);
  const without={...d,parts:d.parts.filter(p=>!ids.includes(p.id))};
  expect(partMassKg(d)-partMassKg(without)).toBeCloseTo(recoveryHardware(d).massKg);
  expect(loadW(d,0)).toBeGreaterThan(loadW(without,0));
  expect(evaluateWorst(d).ok).toBe(true);
  expect(d.parts.filter(p=>p.id.startsWith('thruster-'))).toHaveLength(4);
});
test('sequence isolates before inflation, rolls only after inflation and ends with inspection',()=>{
  expect(recoveryPose(.16).propulsionIsolated).toBe(true);
  expect(recoveryPose(.16).inflation).toBe(0);
  expect(recoveryPose(.32).roll).toBeCloseTo(Math.PI);
  expect(recoveryPose(.54).inflation).toBe(1);
  expect(recoveryPose(.54).roll).toBeCloseTo(Math.PI);
  expect(recoveryPose(.72).roll).toBeGreaterThan(0);
  expect(recoveryPose(1).roll).toBe(0);
  expect(recoveryPose(1).inflation).toBe(1);
  expect(recoveryPose(1).verificationRequired).toBe(true);
  expect(recoveryPose(1).needsService).toBe(true);
  expect(RECOVERY_STAGES[recoveryPose(1).stage].label).toBe('Verify & hold');
});
test('scrubbing clamps at the endpoints, without spending or inventing fleet energy',()=>{
  expect(recoveryPose(-1)).toEqual(recoveryPose(0));
  expect(recoveryPose(2)).toEqual(recoveryPose(1));
  expect(recoveryHardware(workerDesign()).bagVolumeM3).toBeCloseTo(.526028,4);
});
