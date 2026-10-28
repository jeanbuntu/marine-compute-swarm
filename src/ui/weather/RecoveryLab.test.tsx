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

test('live close-up follows the actual fleet righting state rather than a second animation',()=>{
  const live={phase:'Rolling' as const,elapsedS:40,progress:.72,rollDeg:80,inflation:1,gasAvailable:false};
  const {rerender}=render(<RecoveryLab design={workerDesign()} nodeId="W01" swell={0} inverted ingress={false} liveRighting={live} onClose={()=>{}} />);
  expect(screen.getByRole('button',{name:'Play recovery'})).toBeDisabled();
  expect(screen.getByText('ROLLING · LIVE')).toBeInTheDocument();
  rerender(<RecoveryLab design={workerDesign()} nodeId="W01" swell={0} inverted={false} ingress={false} liveRighting={{...live,phase:'Upright',progress:1,rollDeg:0,elapsedS:60}} onClose={()=>{}} />);
  expect(screen.getByText('UPRIGHT · LIVE')).toBeInTheDocument();
});
