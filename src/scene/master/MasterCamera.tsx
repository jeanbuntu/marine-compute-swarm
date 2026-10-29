import { partPosition } from '../../model/hydrostatics';
import { partEnvelope } from '../../model/nodeDesign';
import { explodeOffsets, EXPLODE_FACTOR } from '../explode';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MOUSE, Vector3, Euler } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { msim, useMaster, type ViewMode } from '../../state/master';

/** Camera offset from the node [x, y, z] and the height it looks at. */
const PRESETS: Record<Exclude<ViewMode, 'sky'>, [number, number, number, number]> = {
  close: [4.0, 2.5, 4.4, 0.5],
  under: [2.4, -1.7, 3.0, -0.45],
  top: [0.01, 6.5, 0.01, 0],
};

/** Orbit controls that ride along with the node, with presets for above-water, underwater and top-down. */
export function MasterCamera() {
  const controls = useRef<OrbitControlsImpl>(null);
  const prev = useRef<[number, number]>([0, 0]);
  const view = useMaster((s) => s.view);
  const focusRequest = useMaster(s => s.focusRequest);
  const exploded = useMaster(s => s.exploded);
  const { camera, size } = useThree();

  useEffect(() => {
    const c = controls.current;
    if (!c || view === 'sky') return;
    const [ox, oy, oz, ty] = PRESETS[view];
    const fit = Math.max(1, Math.min(2.2, size.height / size.width));
    const scale = (exploded ? 1.6 : 1) * fit, lift = exploded ? 2.1 : 0;
    camera.position.set(msim.pos[0] + ox * scale, oy * scale + lift, msim.pos[1] + oz * scale);
    c.target.set(msim.pos[0], ty + lift, msim.pos[1]);
    c.update();
    prev.current = [msim.pos[0], msim.pos[1]];
  }, [view, camera, exploded, size.width, size.height]);

  useEffect(() => {
    const c = controls.current;
    if (!c || !focusRequest) return;
    const st = useMaster.getState(), d = msim.design, p = d.parts.find(p => p.id === st.selectedPart);
    if (!p) return;
    const pos = partPosition(d, p, 'deployed'), off = st.exploded ? explodeOffsets(d.parts, EXPLODE_FACTOR)[p.id] : [0, 0, 0];
    if (p.id === 'hull-shell') pos[1] = d.keelDepthM + d.hullDepthM / 2;
    const a = msim.telemetry.att;
    const target = new Vector3(pos[0] + off[0], pos[1] + off[1] + (st.exploded ? 1.8 : -msim.hullP.draftM), pos[2] + off[2]);
    target.applyEuler(new Euler(a.pitch, a.yaw, a.roll, 'YXZ')).add(new Vector3(msim.pos[0], msim.telemetry.heaveM, msim.pos[1]));
    const distance = Math.max(0.45, Math.max(...partEnvelope(d, p)) * 2.6);
    c.target.copy(target); camera.position.copy(target).add(new Vector3(1, 0.8, 1).normalize().multiplyScalar(distance));
    c.update();
  }, [focusRequest, camera]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    c.enabled = useMaster.getState().view !== 'sky';
    const dx = msim.pos[0] - prev.current[0], dz = msim.pos[1] - prev.current[1];
    prev.current = [msim.pos[0], msim.pos[1]];
    c.target.x += dx; c.target.z += dz; camera.position.x += dx; camera.position.z += dz;
  });

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} minDistance={0.2} maxDistance={90} screenSpacePanning
    mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }} />;
}
