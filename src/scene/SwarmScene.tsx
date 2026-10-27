import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { useStore } from '../state/store';
import { Atmosphere } from './Atmosphere';
import { CameraRig } from './CameraRig';
import { Clouds } from './Clouds';
import { NodeCameraView } from './NodeCameraView';
import { Nodes } from './Nodes';
import { Ocean } from './Ocean';
import { SimDriver } from './SimDriver';
import { readUrlState } from './urlState';

const START = typeof window === 'undefined' ? readUrlState('') : readUrlState(window.location.search);

export function SwarmScene() {
  useEffect(() => {
    if (START.explode) useStore.getState().explode(START.explode);
  }, []);
  return (
    <Canvas
      gl={{ antialias: true, logarithmicDepthBuffer: true }}
      camera={{ position: START.cam ?? [220, 80, 260], fov: 50, near: 0.1, far: 300000 }}
      onPointerMissed={() => useStore.getState().hover(null)}
    >
      <Atmosphere />
      <SimDriver />
      <Ocean />
      <Clouds />
      <Nodes />
      <NodeCameraView />
      <CameraRig target={START.target ?? [0, 0, 0]} />
    </Canvas>
  );
}
