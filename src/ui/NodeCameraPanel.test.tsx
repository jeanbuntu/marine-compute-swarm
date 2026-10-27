import { render, screen, act } from '@testing-library/react';
import { NodeCameraPanel } from './NodeCameraPanel';
import { useStore } from '../state/store';
import { sim } from '../state/sim';
import { defaultConfig } from '../model/config';

beforeEach(() => {
  useStore.getState().reset();
  sim.rebuild({ ...defaultConfig(), coverage: 0.7, trackerDropRate: 0 });
  sim.step(1);
});

test('prompts to select a node when none is selected', () => {
  render(<NodeCameraPanel />);
  expect(screen.getByText(/Select a node/)).toBeInTheDocument();
});

test('draws one box per tracked cloud and shows the navigator reason', () => {
  useStore.getState().select('n1');
  const { container } = render(<NodeCameraPanel />);
  const tracked = sim.lastTracked['n1'];
  expect(tracked.length).toBeGreaterThan(0);
  expect(container.querySelectorAll('rect[data-cloud]').length).toBe(tracked.length);
  const cmd = sim.lastCmds.find((c) => c.nodeId === 'n1')!;
  expect(screen.getByText(new RegExp(cmd.reason))).toBeInTheDocument();
});

test('the close button clears the selection', () => {
  useStore.getState().select('n1');
  render(<NodeCameraPanel />);
  act(() => screen.getByRole('button', { name: 'Close' }).click());
  expect(useStore.getState().selectedNodeId).toBeNull();
});
