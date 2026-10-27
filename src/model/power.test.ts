import { pvPowerW, loadW, stepBattery } from './power';
import { workerDesign, masterDesign } from './nodeDesign';

describe('power', () => {
  test('no sun gives no PV', () => expect(pvPowerW(workerDesign(), 0, 1)).toBe(0));
  test('shadow scales PV', () => {
    const d = workerDesign();
    expect(pvPowerW(d, 1000, 0.2)).toBeCloseTo(pvPowerW(d, 1000, 1) * 0.2, 6);
  });
  test('clear noon worker PV is between 1.2 and 2.2 kW', () => {
    const p = pvPowerW(workerDesign(), 1000, 1);
    expect(p).toBeGreaterThan(1200);
    expect(p).toBeLessThan(2200);
  });
  test('battery stays within bounds', () => {
    expect(stepBattery(100, 1000, 1e6, 3600)).toBe(1000);
    expect(stepBattery(100, 1000, -1e6, 3600)).toBe(0);
    expect(stepBattery(500, 1000, 360, 3600)).toBeCloseTo(860, 6);
  });
  test('master load exceeds worker load', () => {
    expect(loadW(masterDesign(), 0)).toBeGreaterThan(loadW(workerDesign(), 0));
  });
});
