import { fireEvent, render, screen } from '@testing-library/react';
import { FleetRecovery } from './FleetRecovery';
import { createWeather, SCENARIOS, stepWeather } from '../../model/weather';
import { masterDesign, workerDesign } from '../../model/nodeDesign';
const designs={master:masterDesign(),worker:workerDesign()};

test('low-battery recovery and satellite failure controls are visible',()=>{
  const initial=createWeather(designs);initial.nodes[1].wh=960;
  const state=stepWeather(initial,SCENARIOS[0].conditions,'night',0,designs);
  const toggle=vi.fn();
  render(<FleetRecovery state={state} node={state.nodes[1]} onToggle={toggle} />);
  expect(screen.getByText('Form escort ring')).toBeInTheDocument();
  expect(screen.getByText('Essentials only · independent operation at 25%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox',{name:'Satellite test channel available'}));
  expect(toggle).toHaveBeenCalledWith('satelliteAvailable');
  fireEvent.click(screen.getByRole('checkbox',{name:'Satellite antenna has sky view'}));
  expect(toggle).toHaveBeenCalledWith('skyView');
});
