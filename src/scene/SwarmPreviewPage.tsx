import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { hasWebGL } from './webgl';
import { SwarmScene } from './SwarmScene';
import { SWARM_INTRO_NODES } from './swarmIntro';

export function SwarmPreviewPage() {
  const playing=useStore(s=>s.playing);
  const [webgl]=useState(hasWebGL);
  useEffect(()=>{
    useStore.getState().setConfig({nodes:SWARM_INTRO_NODES});
    useStore.getState().setSpeed(10);
    const receive=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin||event.source!==window.parent||event.data?.type!=='swarm-preview-playback'||typeof event.data.playing!=='boolean')return;
      useStore.getState().setPlaying(event.data.playing);
    };
    window.addEventListener('message',receive);window.parent.postMessage({type:'swarm-preview-ready'},window.location.origin);return()=>window.removeEventListener('message',receive);
  },[]);
  return <div data-swarm-preview data-playing={playing} style={{position:'fixed',inset:0,background:'#091322'}}>{webgl?<SwarmScene preview />:<div className="swarm-preview-fallback"><b>Swarm · master + two workers</b><span>Open Swarm to explore the fleet. Live 3D requires WebGL.</span></div>}</div>;
}
