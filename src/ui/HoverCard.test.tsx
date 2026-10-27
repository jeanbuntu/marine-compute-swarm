import { render, screen } from '@testing-library/react';
import { HoverCard } from './HoverCard';
import { useStore } from '../state/store';

beforeEach(() => useStore.getState().reset());

test('shows nothing when nothing is hovered', () => {
  const { container } = render(<HoverCard />);
  expect(container.firstChild).toBeNull();
});

test('describes a hovered petal', () => {
  useStore.getState().hover('n2/petal-E');
  render(<HoverCard />);
  expect(screen.getByText('Petal E')).toBeInTheDocument();
  expect(screen.getByText(/Hinged PV petal/)).toBeInTheDocument();
});

test('describes a hovered node and invites a click', () => {
  useStore.getState().hover('n0');
  render(<HoverCard />);
  expect(screen.getByText(/Master node/)).toBeInTheDocument();
  expect(screen.getByText(/Click to open/)).toBeInTheDocument();
});
