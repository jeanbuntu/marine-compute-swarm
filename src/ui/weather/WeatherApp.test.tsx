import { fireEvent, render, screen, within } from '@testing-library/react';
import { WeatherApp } from './WeatherApp';
import { readView } from '../../scene/urlState';

test('weather has a separate route and a compact seven-scenario selector', () => {
  expect(readView('?view=weather')).toBe('weather');
  render(<WeatherApp />);
  expect(within(screen.getByLabelText('Conditions')).getAllByRole('option')).toHaveLength(7);
  fireEvent.change(screen.getByLabelText('Conditions'), {target:{value:'night'}});
  expect(screen.getByLabelText('Conditions')).toHaveValue('night');
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


test('reasoning locks playback to 1× while weather retains accelerated speeds', () => {
  const {unmount}=render(<WeatherApp reasoning />);
  expect(screen.getByLabelText('Speed')).toHaveValue('1');
  expect(within(screen.getByLabelText('Speed')).getAllByRole('option')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Conditions'),{target:{value:'night'}});
  fireEvent.click(screen.getByRole('button',{name:'Reset fleet'}));
  expect(screen.getByLabelText('Speed')).toHaveValue('1');
  unmount();
  render(<WeatherApp />);
  expect(screen.getByLabelText('Speed')).toHaveValue('10');
  expect(within(screen.getByLabelText('Speed')).getAllByRole('option').length).toBeGreaterThan(1);
});


test('Muse shares the fleet, hides prompt and output by default, and preserves traces when minimized', async () => {
  render(<WeatherApp />);
  fireEvent.click(screen.getByRole('button',{name:'Pause'}));
  fireEvent.click(screen.getByRole('button',{name:/Drain battery to 8%/}));
  expect(screen.getByText('Power reserve')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Evaluate snapshot'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Open Muse'}));
  expect(screen.getByLabelText('Speed')).toHaveValue('1');
  expect(screen.getByText('Inputs & prompt').closest('details')).not.toHaveAttribute('open');
  expect(screen.getByText('Decision & output').closest('details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button',{name:'Evaluate snapshot'}));
  await screen.findByText(/Validated; shadow mode/);
  expect(screen.getByText('Inputs & prompt').closest('summary')).toHaveTextContent('1 adverse signals');
  fireEvent.click(screen.getByRole('button',{name:'Hide Muse'}));
  expect(screen.getByText('Power reserve')).toBeInTheDocument();
  expect(screen.queryByText('Inputs & prompt')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Open Muse'}));
  expect(screen.getByText('Decision & output').closest('summary')).toHaveTextContent('conserve');
  fireEvent.click(screen.getByText(/Automation & execution/, {selector:'summary'}));
  fireEvent.click(screen.getByLabelText('Execute validated strategies'));
  fireEvent.click(screen.getByRole('button',{name:'Hide Muse'}));
  expect(screen.getByText('EXECUTION ENABLED')).toBeInTheDocument();
  expect(screen.getByLabelText('Speed')).toHaveValue('1');
  fireEvent.click(screen.getByRole('button',{name:'Return to baseline'}));
  expect(screen.getByLabelText('Speed')).toHaveValue('10');
});
