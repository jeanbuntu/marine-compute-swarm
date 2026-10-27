import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../App';
import { useStore } from '../state/store';
import { evaluateWorst } from '../model/hydrostatics';

beforeEach(() => {
  useStore.getState().reset();
  useStore.getState().setConfig({ nodes: 3 });
});

test('first screen shows no sliders and a closed drawer', () => {
  render(<App />);
  expect(screen.queryAllByRole('slider')).toHaveLength(0);
  expect(useStore.getState().drawerOpen).toBe(false);
  expect(screen.getByText('Solar Swarm')).toBeInTheDocument();
});

test('without WebGL a message replaces the canvas and the impact numbers still render', async () => {
  render(<App />);
  expect(screen.getByText(/needs WebGL/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText(/Energy harvested/)).toBeInTheDocument());
  await waitFor(() => expect(screen.getAllByText(/kWh/).length).toBeGreaterThan(0), { timeout: 8000 });
});

test('opening the controls reveals grouped knobs, and a knob updates the config', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Controls' }));
  expect(screen.getByRole('heading', { name: 'Environment' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Hardware' })).toBeInTheDocument();
  const slider = screen.getByRole('slider', { name: 'Cloud coverage' });
  fireEvent.change(slider, { target: { value: '0.2' } });
  expect(useStore.getState().config.coverage).toBeCloseTo(0.2);
});

test('estimated knobs carry the EST label', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Controls' }));
  expect(screen.getAllByText('EST').length).toBeGreaterThan(3);
});

test('hardware knobs can never leave the design unstable', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Controls' }));
  for (const [name, v] of [['Battery mass', '1000'], ['Ballast', '600'], ['Compute pod mass', '200'], ['Hull depth', '0.5'], ['Hull side', '1']]) {
    fireEvent.change(screen.getByRole('slider', { name }), { target: { value: v } });
    expect(evaluateWorst(useStore.getState().designs.worker).ok).toBe(true);
  }
});

test('a blocked knob shows the stability explanation', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Controls' }));
  fireEvent.change(screen.getByRole('slider', { name: 'Hull depth' }), { target: { value: '0.5' } });
  fireEvent.change(screen.getByRole('slider', { name: 'Battery mass' }), { target: { value: '1000' } });
  fireEvent.change(screen.getByRole('slider', { name: 'Ballast' }), { target: { value: '600' } });
  expect(screen.queryByRole('alert')).not.toBeNull();
  expect(screen.getByRole('alert').textContent).toMatch(/hydrodynamic stability/);
});
