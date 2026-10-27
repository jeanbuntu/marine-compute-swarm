import { followDelta } from './cameraFollow';

test('stationary selected node does not undo a manual pan', () => {
  expect(followDelta([0, 0.4, 0], [0, 0.4, 0], [3, 2, -4], false)).toEqual([0, 0, 0]);
});

test('following node motion preserves the user pan offset', () => {
  const target: [number, number, number] = [3, 2, -4];
  const delta = followDelta([2, 0.4, 1], [0, 0.4, 0], target, false);
  expect(delta).toEqual([2, 0, 1]);
  expect(target.map((v, i) => v + delta[i])).toEqual([5, 2, -3]);
});

test('initial focus eases toward the selected node', () => {
  expect(followDelta([10, 5, 0], null, [0, 0, 0], true)).toEqual([1.2, 0.6, 0]);
});
