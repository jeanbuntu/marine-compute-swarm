import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders the product name', () => {
  render(<App />);
  expect(screen.getByText('Marine Compute Swarm')).toBeInTheDocument();
});
