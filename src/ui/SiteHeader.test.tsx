import { fireEvent, render, screen, within } from '@testing-library/react';
import { SiteHeader } from './SiteHeader';

test('landing title bar exposes every page from a single discoverable menu',()=>{
  render(<SiteHeader page="swarm" />);
  expect(screen.getByLabelText('Current page')).toHaveTextContent('Swarm');
  expect(screen.getByRole('link',{name:'Marine Compute Swarm home'})).toHaveAttribute('href','/');
  expect(screen.queryByRole('navigation',{name:'Project navigation'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Project menu'}));
  const nav=screen.getByRole('navigation',{name:'Project navigation'});
  expect(within(nav).getAllByRole('link')).toHaveLength(6);
  expect(within(nav).getByRole('link',{name:/Weather Simulator/})).toHaveAttribute('href','/?view=weather');
  expect(within(nav).getByRole('link',{name:/Master Recovery Close-up/})).toHaveAttribute('href','/?view=weather&inspect=master');
  expect(within(nav).getByRole('link',{name:/Worker Unit Bench/})).toHaveAttribute('href','/?view=unit&role=worker');
  expect(within(nav).getByRole('link',{name:/Swarm Project overview/})).toHaveAttribute('aria-current','page');
});
test('keyboard navigation, Escape and outside click dismiss the dropdown correctly',()=>{
  render(<SiteHeader page="weather" />);
  const toggle=screen.getByRole('button',{name:'Project menu'});
  fireEvent.keyDown(toggle,{key:'ArrowDown'});
  const nav=screen.getByRole('navigation',{name:'Project navigation'});
  expect(within(nav).getByRole('link',{name:/Weather Simulator/})).toHaveFocus();
  fireEvent.keyDown(document.activeElement!,{key:'End'});
  expect(within(nav).getByRole('link',{name:/Worker Recovery Close-up/})).toHaveFocus();
  fireEvent.keyDown(document,{key:'Escape'});
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute('aria-expanded','false');
  fireEvent.click(toggle);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('navigation',{name:'Project navigation'})).not.toBeInTheDocument();
});
test('page title tracks unit role changes',()=>{
  const {rerender}=render(<SiteHeader page="master" />);
  expect(document.title).toBe('Master Unit Bench · Marine Compute Swarm');
  rerender(<SiteHeader page="worker" />);
  expect(screen.getByLabelText('Current page')).toHaveTextContent('Worker Unit Bench');
  expect(document.title).toBe('Worker Unit Bench · Marine Compute Swarm');
});
