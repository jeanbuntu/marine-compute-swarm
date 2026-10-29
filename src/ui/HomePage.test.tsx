import { fireEvent, render, screen } from '@testing-library/react';
import { HomePage } from './HomePage';
import { readView } from '../scene/urlState';

test('home explains the project and offers the three integrated module destinations without WebGL', () => {
  render(<HomePage />);
  expect(readView('')).toBe('home');
  expect(readView('?view=swarm')).toBe('swarm');
  expect(readView('?cam=1,2,3')).toBe('swarm');
  expect(screen.getByRole('heading', { name: /Compute that follows/ })).toBeInTheDocument();
  const destinations = screen.getAllByRole('link').filter(a => a.classList.contains('preview-card'));
  expect(destinations.map(a => a.getAttribute('href'))).toEqual(['/?view=swarm','/?view=weather','/?view=unit']);
  fireEvent.focus(destinations[2]);
  expect(screen.getByText(/Meet the hardware/, {selector:'.home-guide p'})).toBeInTheDocument();
});


test('Swarm uses an isolated live preview instead of illustrative markers',()=>{
  render(<HomePage />);
  const preview=screen.getByTitle('Live isometric Swarm preview at 10× speed');
  expect(preview).toHaveAttribute('src','/?view=swarm&preview=swarm');
  expect(preview).toHaveAttribute('tabindex','-1');
});
