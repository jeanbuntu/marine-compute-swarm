import { showDetail, DETAIL_DIST_M } from './lod';

test('shows the model inside the range and hides it far away', () => {
  expect(showDetail(10, false, false)).toBe(true);
  expect(showDetail(DETAIL_DIST_M * 3, false, false)).toBe(false);
});
test('hysteresis: stays on slightly beyond the range, but does not turn on there', () => {
  expect(showDetail(DETAIL_DIST_M * 1.05, false, true)).toBe(true);
  expect(showDetail(DETAIL_DIST_M * 1.05, false, false)).toBe(false);
});
test('an exploded node always shows its model', () => {
  expect(showDetail(1e6, true, false)).toBe(true);
});
