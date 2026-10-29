import { readUrlState } from './urlState';

test('parses camera, target and explode', () => {
  expect(readUrlState('?cam=1,2,3&target=0,0,0&explode=n4')).toEqual({ cam: [1, 2, 3], target: [0, 0, 0], explode: 'n4' });
});
test('ignores malformed values', () => {
  expect(readUrlState('?cam=1,2&target=a,b,c&explode=x')).toEqual({ cam: null, target: null, explode: null });
});

describe('readView', () => {
  it('opens the master bench only when asked', async () => {
    const { readView } = await import('./urlState');
    expect(readView('?view=master')).toBe('master');
    expect(readView('')).toBe('home');
    expect(readView('?view=other')).toBe('home');
  });
});
