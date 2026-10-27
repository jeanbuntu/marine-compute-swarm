import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MOUSE } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { msim, useMaster, type ViewMode } from '../../state/master';

/** Camera offset from the node [x, y, z] and the height it looks at. */
const PRESETS: Record<Exclude<ViewMode, 'sky'>, [number, number, number, number]> = {
  close: [3.0, 1.5, 3.4, 0.5],
  under: [2.4, -1.7, 3.0, -0.45],
  top: [0.01, 6.5, 0.01, 0],
};

/** Orbit controls that ride along with the node, with presets for above-water, underwater and top-down. */
export function MasterCamera() {
  const controls = useRef<OrbitControlsImpl>(null);
  const prev = useRef<[number, number]>([0, 0]);
  const view = useMaster((s) => s.view);
  const { camera } = useThree();

  useEffect(() => {
    const c = controls.current;
    if (!c || view === 'sky') return;
    const [ox, oy, oz, ty] = PRESETS[view];
    camera.position.set(msim.pos[0] + ox, oy, msim.pos[1] + oz);
    c.target.set(msim.pos[0], ty, msim.pos[1]);
    c.update();
    prev.current = [msim.pos[0], msim.pos[1]];
  }, [view, camera]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    c.enabled = useMaster.getState().view !== 'sky';
    const dx = msim.pos[0] - prev.current[0], dz = msim.pos[1] - prev.current[1];
    prev.current = [msim.pos[0], msim.pos[1]];
    c.target.x += dx; c.target.z += dz; camera.position.x += dx; camera.position.z += dz;
  });

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} minDistance={0.8} maxDistance={90} screenSpacePanning
    mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }} />;
}
