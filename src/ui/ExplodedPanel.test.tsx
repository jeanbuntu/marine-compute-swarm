import { render, screen, fireEvent } from '@testing-library/react';
import { ExplodedPanel } from './ExplodedPanel';
import { useStore } from '../state/store';

function setup() {
  useStore.getState().reset();
  useStore.getState().explode('n0');
  useStore.getState().selectPart('battery');
  render(<ExplodedPanel />);
}
const enter = (v: string) => {
  const input = screen.getByLabelText('Mass (kg)');
  fireEvent.change(input, { target: { value: v } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
};

describe('ExplodedPanel', () => {
  test('renders nothing when no node is exploded', () => {
    useStore.getState().reset();
    const { container } = render(<ExplodedPanel />);
    expect(container.firstChild).toBeNull();
  });

  test('shows the master role and live stability numbers', () => {
    setup();
    expect(screen.getByText(/Master/)).toBeInTheDocument();
    expect(screen.getByText(/Draft/)).toBeInTheDocument();
    expect(screen.getByText(/Floats and stays upright/)).toBeInTheDocument();
  });

  test('a safe edit applies without a warning', () => {
    setup();
    enter('130');
    expect(useStore.getState().designs.master.parts.find((p) => p.id === 'battery')!.massKg).toBe(130);
    expect(screen.queryByText(/hydrodynamic stability/)).toBeNull();
  });

  test('an unstable edit is blocked, explained, and offers a fix', () => {
    setup();
    enter('1500');
    expect(screen.getByText(/hydrodynamic stability/)).toBeInTheDocument();
    expect(useStore.getState().designs.master.parts.find((p) => p.id === 'battery')!.massKg).toBe(120);
    fireEvent.click(screen.getByRole('button', { name: 'Apply all' }));
    expect(useStore.getState().designs.master.parts.find((p) => p.id === 'battery')!.massKg).toBe(1500);
    expect(screen.queryByText(/hydrodynamic stability/)).toBeNull();
  });

  test('an impossible edit is blocked with no fix button', () => {
    setup();
    enter('99999999');
    expect(screen.getByText(/hydrodynamic stability/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply all' })).toBeNull();
  });
});


test('inspection switches assembly mode and shows equipment dimensions', () => {
  setup();
  expect(screen.getByText(/700 mm × 250 mm × 500 mm/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Assembled' }));
  expect(useStore.getState().inspectionExploded).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Exploded' }));
  expect(useStore.getState().inspectionExploded).toBe(true);
});
