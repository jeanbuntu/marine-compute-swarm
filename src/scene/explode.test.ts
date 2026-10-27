import { explodeOffsets } from './explode';
import { workerDesign } from '../model/nodeDesign';

const parts = workerDesign().parts;

describe('explodeOffsets', () => {
  test('factor 0 gives zero offsets for every part', () => {
    const o = explodeOffsets(parts, 0);
    for (const p of parts) expect(o[p.id].every((v) => v === 0)).toBe(true);
  });
  test('offsets are distinct per subsystem group', () => {
    const o = explodeOffsets(parts, 1);
    const key = (id: string) => o[id].map((v) => v.toFixed(2)).join(',');
    expect(key('battery')).not.toBe(key('compute-pod'));
    expect(key('compute-pod')).not.toBe(key('heat-exchanger'));
    expect(key('sky-camera')).not.toBe(key('gnss'));
  });
  test('all offsets are finite and every part has one', () => {
    const o = explodeOffsets(parts, 2);
    for (const p of parts) expect(o[p.id].every(Number.isFinite)).toBe(true);
  });
  test('opposite petals move in opposite directions', () => {
    const o = explodeOffsets(parts, 1);
    expect(Math.sign(o['petal-E'][0])).toBe(-Math.sign(o['petal-W'][0]));
  });
});
