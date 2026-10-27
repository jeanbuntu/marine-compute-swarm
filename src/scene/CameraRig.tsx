import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MOUSE, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore } from '../state/store';
import { sim } from '../state/sim';
import { followDelta } from './cameraFollow';
import { clampCamera, MAX_DIST_M, MIN_DIST_M } from './cameraLimits';

const FOCUS_DIST_M = 9;
const _target = new Vector3();
const _delta = new Vector3();

/** Orbit controls with a dive floor, plus smooth follow of the selected node. */
export function CameraRig({ target = [0, 0, 0] }: { target?: [number, number, number] }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const focusUntil = useRef(0);
  const previousAnchor = useRef<[number, number, number] | null>(null);
  const selected = useStore((s) => s.selectedNodeId);

  useEffect(() => {
    previousAnchor.current = null;
    focusUntil.current = selected ? performance.now() + 1400 : 0;
  }, [selected]);

  useFrame(({ camera }) => {
    const c = controls.current;
    if (!c) return;
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

  return <OrbitControls ref={controls} makeDefault minDistance={MIN_DIST_M} maxDistance={MAX_DIST_M} target={target} enablePan screenSpacePanning panSpeed={1} mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }} onStart={() => { focusUntil.current = 0; }} enableDamping dampingFactor={0.08} />;
}
