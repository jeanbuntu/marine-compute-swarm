import { clampCamera, isUnderwater, MAX_DIVE_M } from './cameraLimits';

describe('camera limits', () => {
  test('passes through a valid position', () => expect(clampCamera([10, 5, 10])).toEqual([10, 5, 10]));
  test('clamps below the maximum dive depth', () => expect(clampCamera([10, -100, 10])[1]).toBe(-MAX_DIVE_M));
  test('keeps the camera at least 2 m from the target', () => {
    const [x, y, z] = clampCamera([0.1, 0.1, 0.1], [0, 0, 0]);
    expect(Math.hypot(x, y, z)).toBeGreaterThanOrEqual(2 - 1e-9);
  });
  test('keeps the camera within 40 km of the target', () => {
    const [x, y, z] = clampCamera([1e6, 100, 0], [0, 0, 0]);
    expect(Math.hypot(x, y, z)).toBeLessThanOrEqual(40000 + 1e-6);
  });
  test('handles NaN by returning a safe position', () => {
    const p = clampCamera([NaN, 3, 4]);
    expect(p.every(Number.isFinite)).toBe(true);
  });
  test('isUnderwater', () => {
    expect(isUnderwater(-0.1)).toBe(true);
    expect(isUnderwater(0.1)).toBe(false);
  });
});
