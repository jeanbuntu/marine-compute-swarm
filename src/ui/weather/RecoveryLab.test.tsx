import { fireEvent, render, screen } from '@testing-library/react';
import { RecoveryLab } from './RecoveryLab';
import { workerDesign } from '../../model/nodeDesign';

test('stages and failure branch remain usable without WebGL',()=>{
  render(<RecoveryLab design={workerDesign()} nodeId="W01" swell={3} inverted ingress={false} onClose={()=>{}} />);
  expect(screen.getByText('3D requires WebGL')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Roll upright/}));
  expect(screen.getByText('SERVICE REQUIRED')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox',{name:'Test inflation failure'}));
  fireEvent.change(screen.getByRole('slider',{name:'Recovery sequence'}),{target:{value:'.9'}});
  expect(screen.getByRole('heading',{name:'Bag unavailable. Retrieve.'})).toBeInTheDocument();
  expect(screen.getByText('INVERTED / NOT AUTO-CLEARED')).toBeInTheDocument();
});
test('hardware selection switches detail and exposes component rationale',()=>{
  render(<RecoveryLab design={workerDesign()} nodeId="W01" swell={0} inverted={false} ingress onClose={()=>{}} />);
  fireEvent.click(screen.getByRole('button',{name:'Gas supply'}));
  expect(screen.getByRole('button',{name:'02 Cutaway'})).toHaveAttribute('aria-pressed','true');
  expect(screen.getByText('Righting gas cylinder and valve')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Verify & hold/}));
  expect(screen.getByText('INGRESS / RESTART BLOCKED')).toBeInTheDocument();
});
