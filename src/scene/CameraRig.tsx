import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MOUSE, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore } from '../state/store';
import { sim } from '../state/sim';
import { frameSwarmNodes, swarmIntro, SWARM_INTRO_NODES } from './swarmIntro';
import { followDelta } from './cameraFollow';
import { clampCamera, MAX_DIST_M, MIN_DIST_M } from './cameraLimits';

const FOCUS_DIST_M = 9;
const _target = new Vector3();
const _delta = new Vector3();

/** Orbit controls with a dive floor, plus smooth follow of the selected node. */
export function CameraRig({ target = [0, 0, 0], frameIntro = false, interactive = true }: { target?: [number, number, number]; frameIntro?:boolean; interactive?:boolean }) {
  const {camera,size}=useThree();
  const config=useStore(s=>s.config);
  const manual=useRef(false);
  const controls = useRef<OrbitControlsImpl>(null);
  const focusUntil = useRef(0);
  const previousAnchor = useRef<[number, number, number] | null>(null);
  const selected = useStore((s) => s.selectedNodeId);

  useEffect(()=>{
    if(!frameIntro||manual.current||selected||!controls.current)return;
    const intro=swarmIntro(size.width/size.height,config.spacingM,config.nodes);
    camera.position.fromArray(intro.position);controls.current.target.fromArray(intro.target);controls.current.update();
  },[camera,size.width,size.height,frameIntro,config.spacingM,config.nodes,selected]);

  useEffect(() => {
    previousAnchor.current = null;
    focusUntil.current = selected ? performance.now() + 1400 : 0;
  }, [selected]);

  useFrame(({ camera }) => {
    const c = controls.current;
    if (!c) return;
    if(frameIntro&&!manual.current&&!useStore.getState().selectedNodeId){
      const intro=frameSwarmNodes(sim.swarm.nodes.slice(0,SWARM_INTRO_NODES).map(n=>[n.pos[0],-n.pos[1]]),size.width/size.height);
      c.target.fromArray(intro.target);camera.position.fromArray(intro.position);c.update();
    }
    const id = useStore.getState().selectedNodeId;
    const n = id ? sim.swarm.nodes[Number(id.slice(1))] : null;
    if (n) {
      _target.set(n.pos[0], useStore.getState().explodedNodeId === id && useStore.getState().inspectionExploded ? 2.3 : 0.4, -n.pos[1]);
      const focusing = performance.now() < focusUntil.current;
      _delta.fromArray(followDelta(_target.toArray(), previousAnchor.current, c.target.toArray(), focusing));
      previousAnchor.current = _target.toArray();
      c.target.add(_delta);
      camera.position.add(_delta);
      if (focusing) {
        const dist = camera.position.distanceTo(c.target);
        const want = dist + (Math.min(dist, FOCUS_DIST_M * 1.5) - dist) * 0.1;
        camera.position.sub(c.target).multiplyScalar(want / dist).add(c.target);
      }
    } else previousAnchor.current = null;
    const t = c.target;
    const p = clampCamera([camera.position.x, camera.position.y, camera.position.z], [t.x, t.y, t.z]);
    camera.position.set(p[0], p[1], p[2]);
  });

  return <OrbitControls ref={controls} enabled={interactive} makeDefault minDistance={MIN_DIST_M} maxDistance={MAX_DIST_M} target={target} enablePan screenSpacePanning panSpeed={1} mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }} onStart={() => { manual.current = true; focusUntil.current = 0; }} enableDamping dampingFactor={0.08} />;
}
