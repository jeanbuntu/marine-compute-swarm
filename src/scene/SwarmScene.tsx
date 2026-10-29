import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useStore } from '../state/store';
import { Atmosphere } from './Atmosphere';
import { CameraRig } from './CameraRig';
import { Clouds } from './Clouds';
import { NodeCameraView } from './NodeCameraView';
import { Nodes } from './Nodes';
import { Ocean } from './Ocean';
import { SimDriver } from './SimDriver';
import { swarmIntro } from './swarmIntro';
import { readUrlState } from './urlState';

const START = typeof window === 'undefined' ? readUrlState('') : readUrlState(window.location.search);

export function SwarmScene({preview=false}:{preview?:boolean}) {
  const playing=useStore(s=>preview?s.playing:true);
  const start=useMemo(()=>{
    const config=useStore.getState().config,intro=swarmIntro(16/9,config.spacingM,config.nodes);
    const explicit=!!START.cam||!!START.target;
    return {camera:{position:START.cam??intro.position,fov:50,near:.1,far:300000},target:START.target??(explicit?[0,0,0] as [number,number,number]:intro.target),frameIntro:!explicit};
  },[]);
  useEffect(() => {
    if (START.explode) useStore.getState().explode(START.explode);
  }, []);
  return (
    <Canvas
      frameloop={preview&&!playing?'demand':'always'}
      dpr={preview?1:[1, window.matchMedia?.("(pointer: coarse)").matches ? 1.25 : 2]}
      gl={{ antialias: true, logarithmicDepthBuffer: true }}
      camera={start.camera}
      onPointerMissed={() => useStore.getState().hover(null)}
    >
      <Atmosphere />
      <SimDriver />
      <Ocean />
      <Clouds />
      <Nodes forceDetail={preview} />
      {!preview&&<NodeCameraView />}
      <CameraRig target={start.target} frameIntro={start.frameIntro} interactive={!preview} />
    </Canvas>
  );
}
