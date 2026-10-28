import { render, screen, fireEvent, act } from '@testing-library/react';
import { MasterApp } from './MasterApp';
import { msim, useMaster, layoutRects } from '../../state/master';
import { useStore } from '../../state/store';
import { readView } from '../../scene/urlState';

beforeEach(() => {
  useStore.getState().reset(); useMaster.getState().setRole('master');
  useMaster.getState().set({ dimensions: false, analysisOpen: false, controlsOpen: false, exploded: false });
});

it('supports unit links while retaining the master alias', () => {
  expect(readView('?view=unit&role=worker')).toBe('unit');
  expect(readView('?view=master')).toBe('master');
});

it('switches hardware roles and exposes real card dimensions without master-only equipment on workers', () => {
  render(<MasterApp />);
  fireEvent.click(screen.getByRole('button', { name: 'Worker' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dimensions' }));
  expect(msim.design.role).toBe('worker');
  expect(window.location.search).toContain('role=worker');
  expect(screen.queryByRole('option', { name: 'Starlink terminal' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Dimension component'), { target: { value: 'gpu-1' } });
  expect(screen.getByText('20.32 mm × 68.90 mm × 168.54 mm')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Master' }));
  expect(screen.getByRole('option', { name: 'Starlink terminal' })).toBeInTheDocument();
  expect(msim.design.role).toBe('master');
});

it('shared design edits feed the unit simulation', () => {
  render(<MasterApp />);
  fireEvent.click(screen.getByRole('button', { name: 'Dimensions' }));
  act(() => {
    const outcome = useStore.getState().applyDesignEdit('master', { knob: 'hullSideM', value: 1.8 });
    expect(outcome.status).toBe('ok');
  });
  expect(screen.getByText('1800 mm × 900 mm × 1800 mm')).toBeInTheDocument();
  expect(msim.design).toBe(useStore.getState().designs.master);
  expect(msim.design.hullSideM).toBe(1.8);
});

it('keeps a usable camera rectangle above compact dimension panels', () => {
  useMaster.getState().set({ analysisOpen: true, dimensions: true });
  const rect = layoutRects(615, 724, 'close', false).scene!;
  expect(rect.w).toBeGreaterThan(500);
  expect(rect.h).toBeGreaterThan(200);
  expect(rect.y + rect.h).toBeLessThanOrEqual(724 * 0.58);
});
