import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { msim, useMaster } from '../../state/master';
import { LeftDrawer, ScenarioSelect } from './LeftDrawer';
import { PetalsTab } from './PetalsTab';
import { PropulsionTab } from './PropulsionTab';

describe('master panels', () => {
  it('petal tab shows all four petals and the power comparison', () => {
    msim.step(0.1);
    render(<PetalsTab />);
    for (const id of ['E', 'S', 'W', 'N']) expect(screen.getAllByText(id).length).toBeGreaterThan(0);
    expect(screen.getByText(/Fixed 20° \(as built\)/)).toBeTruthy();
    expect(screen.getByText(/Swarm model assumption/)).toBeTruthy();
  });
  it('propulsion tab explains the missing yaw authority of the as-built layout', () => {
    msim.step(0.1);
    render(<PropulsionTab />);
    expect(screen.getByText(/No yaw authority/)).toBeTruthy();
  });
  it('a scenario dropdown changes the simulation conditions', () => {
    render(<><ScenarioSelect /><LeftDrawer /></>);
    fireEvent.change(screen.getByLabelText('Conditions'), { target: { value: 'Storm' } });
    expect(useMaster.getState().params.windMs).toBe(18);
    expect(msim.params.sea.hsM).toBeCloseTo(3.5, 5);
    expect(msim.params.sun.mode).toBe('manual');
  });
});
