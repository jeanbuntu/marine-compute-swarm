import { compact, money, pctVs, signed, clock } from './format';

test('compact and money', () => {
  expect(compact(1234)).toBe('1.2K');
  expect(money(2_500_000)).toBe('$2.5M');
  expect(compact(NaN)).toBe('–');
});
test('pctVs handles zero baselines', () => {
  expect(pctVs(110, 100)).toBeCloseTo(10);
  expect(pctVs(5, 0)).toBe(0);
});
test('signed shows a plus for gains', () => {
  expect(signed(2.34)).toBe('+2.3%');
  expect(signed(-1)).toBe('-1.0%');
});
test('clock wraps past midnight', () => {
  expect(clock(9 * 3600 + 30 * 60)).toBe('09:30');
  expect(clock(25 * 3600)).toBe('01:00');
});
