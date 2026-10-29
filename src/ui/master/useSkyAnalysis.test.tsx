import { act, render } from '@testing-library/react';
import { useSkyAnalysis } from './useSkyAnalysis';
import { useMaster } from '../../state/master';

function Pipeline() { useSkyAnalysis(); return null; }
test('pause freezes segmentation and tracker history; play resumes the pipeline', () => {
  vi.useFakeTimers();
  useMaster.getState().set({ paused:false, analysis:null, imported:null });
  const {unmount} = render(<Pipeline />);
  act(() => { vi.advanceTimersByTime(250); });
  const first = useMaster.getState().analysis!;
  expect(first.frames).toBe(1);
  act(() => { useMaster.getState().set({ paused:true }); vi.advanceTimersByTime(1000); });
  expect(useMaster.getState().analysis).toBe(first);
  act(() => { useMaster.getState().set({ paused:false }); vi.advanceTimersByTime(250); });
  expect(useMaster.getState().analysis!.frames).toBe(2);
  act(() => { useMaster.getState().set({paused:true, lens:{...useMaster.getState().lens,fovDeg:160}}); vi.advanceTimersByTime(250); });
  expect(useMaster.getState().analysis!.frames).toBe(2);
  expect(useMaster.getState().analysis).not.toBe(first);
  unmount(); vi.useRealTimers();
});
