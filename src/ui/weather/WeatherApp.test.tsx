import { fireEvent, render, screen, within } from '@testing-library/react';
import { WeatherApp } from './WeatherApp';
import { readView } from '../../scene/urlState';

test('weather has a separate route and seven scenario tabs', () => {
  expect(readView('?view=weather')).toBe('weather');
  render(<WeatherApp />);
  expect(screen.getAllByRole('tab')).toHaveLength(7);
  fireEvent.click(screen.getByRole('tab', { name: /Night/ }));
  expect(screen.getByRole('tab', { name: /Night/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('heading', { name: 'What stays powered when the sun disappears?' })).toBeInTheDocument();
});
test('failure injection, fleet reset, and design rationale are accessible', () => {
  render(<WeatherApp />);
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  fireEvent.click(screen.getByRole('button', { name: /Capsize node/ }));
  expect(within(screen.getByRole('log')).getByText(/Full capsize injected/)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '3D recovery close-up' })).not.toBeInTheDocument();
  expect(screen.getByText(/Auto-fit · all 13 nodes visible/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Fit fleet' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '3D recovery close-up' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Follow live node' }));
  fireEvent.change(screen.getByRole('slider', { name: 'Recovery sequence' }), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close close-up' }));
  expect(screen.getByText('Self-righting')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Recovery & design rationale/ }));
  expect(screen.getByRole('region', { name: 'Recovery and design rationale' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reset fleet' }));
  expect(within(screen.getByRole('log')).queryByText(/Full capsize injected/)).not.toBeInTheDocument();
});
