import { fireEvent, render, screen, within } from '@testing-library/react';
import { SiteHeader } from './SiteHeader';

test('landing title bar exposes every page from a single discoverable menu',()=>{
  render(<SiteHeader page="swarm" />);
  expect(screen.getByLabelText('Current page')).toHaveTextContent('Swarm');
  expect(screen.getByRole('link',{name:'Marine Compute Swarm home'})).toHaveAttribute('href','/');
  expect(screen.queryByRole('navigation',{name:'Project navigation'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Project menu'}));
  const nav=screen.getByRole('navigation',{name:'Project navigation'});
  expect(within(nav).getAllByRole('link')).toHaveLength(4);
  expect(within(nav).getByRole('link',{name:/^Home /})).toHaveAttribute('href','/');
  expect(within(nav).getByRole('link',{name:/Weather Simulator/})).toHaveAttribute('href','/?view=weather');
  expect(within(nav).getByRole('link',{name:/Unit Bench/})).toHaveAttribute('href','/?view=unit');
  expect(within(nav).getByRole('link',{name:/Swarm Follow sunlight/})).toHaveAttribute('aria-current','page');
});
test('keyboard navigation, Escape and outside click dismiss the dropdown correctly',()=>{
  render(<SiteHeader page="weather" />);
  const toggle=screen.getByRole('button',{name:'Project menu'});
  fireEvent.keyDown(toggle,{key:'ArrowDown'});
  const nav=screen.getByRole('navigation',{name:'Project navigation'});
  expect(within(nav).getByRole('link',{name:/Weather Simulator/})).toHaveFocus();
  fireEvent.keyDown(document.activeElement!,{key:'End'});
  expect(within(nav).getByRole('link',{name:/Weather Simulator/})).toHaveFocus();
  fireEvent.keyDown(document,{key:'Escape'});
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute('aria-expanded','false');
  fireEvent.click(toggle);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('navigation',{name:'Project navigation'})).not.toBeInTheDocument();
});
test('home and combined unit bench have clear titles',()=>{
  const {rerender}=render(<SiteHeader page="home" />);
  expect(document.title).toBe('Home · Marine Compute Swarm');
  rerender(<SiteHeader page="unit" />);
  expect(screen.getByLabelText('Current page')).toHaveTextContent('Unit Bench');
});
