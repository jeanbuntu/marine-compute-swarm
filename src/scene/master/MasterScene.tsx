import { useRef } from 'react';
import { Canvas, events, useFrame } from '@react-three/fiber';
import type { DirectionalLight, HemisphereLight } from 'three';
import { layoutRects, msim, useMaster } from '../../state/master';
import { Clouds } from '../Clouds';
import { FlowParticles } from './FlowParticles';
import { MasterCamera } from './MasterCamera';
import { MasterNode } from './MasterNode';
import { MasterRender } from './MasterRender';
import { SkyDome } from './SkyDome';
import { WaveSurface } from './WaveSurface';

const RAD = Math.PI / 180;

/** Steps the master simulation before anything else reads it each frame. */
function MasterDriver() {
  useFrame((_, dt) => {
    if (!useMaster.getState().paused) msim.step(dt * useMaster.getState().speed);
  }, -1);
  return null;
}

function Lights() {
  const sun = useRef<DirectionalLight>(null), hemi = useRef<HemisphereLight>(null);
  useFrame(() => {
    const t = msim.telemetry, el = t.sun.elevDeg * RAD, az = t.sun.azDeg * RAD, up = Math.max(0, Math.sin(el)), day = Math.min(1, up * 3);
    if (sun.current) {
      sun.current.position.set(msim.pos[0] + Math.sin(az) * Math.cos(el) * 100, Math.max(0.05, Math.sin(el)) * 100, msim.pos[1] - Math.cos(az) * Math.cos(el) * 100);
      sun.current.target.position.set(msim.pos[0], 0, msim.pos[1]); sun.current.target.updateMatrixWorld();
      sun.current.intensity = 3.4 * up * (0.25 + 0.75 * t.shade);
    }
    if (hemi.current) hemi.current.intensity = 0.3 + 1.0 * day;
  });
  return <>
    <directionalLight ref={sun} />
    <hemisphereLight ref={hemi} args={['#cfe6ff', '#0b4f66', 0.8]} />
  </>;
}

export function MasterScene() {
  return (
    <Canvas events={state => ({ ...events(state), compute(event, state) {
      const ui = useMaster.getState(), rect = layoutRects(state.size.width, state.size.height, ui.view, ui.pip).scene;
      const bounds = state.gl.domElement.getBoundingClientRect();
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      if (!rect || x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) state.pointer.set(10000, 10000);
      else state.pointer.set(2 * (x - rect.x) / rect.w - 1, 1 - 2 * (y - rect.y) / rect.h);
      state.raycaster.setFromCamera(state.pointer, state.camera);
    } })} gl={{ antialias: true }} dpr={[1, window.matchMedia?.("(pointer: coarse)").matches ? 1.25 : 2]} camera={{ position: [3, 1.5, 3.4], fov: 50, near: 0.05, far: 60000 }}>
      <MasterDriver />
      <Lights />
      <SkyDome />
      <WaveSurface />
      <Clouds source={msim} shadows={false} />
      <MasterNode />
      <FlowParticles />
      <MasterCamera />
      <MasterRender />
    </Canvas>
  );
}
