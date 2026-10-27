import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, DirectionalLight, FogExp2, HemisphereLight } from 'three';
import { sim } from '../state/sim';
import { isUnderwater } from './cameraLimits';

const RAD = Math.PI / 180;
const NIGHT = new Color('#0a1228'), DAY = new Color('#a9d4ff'), DEEP = new Color('#06384a'), SHALLOW = new Color('#12839a');

/** Sun light, sky and haze; switches to teal fog when the camera is under the surface. */
export function Atmosphere() {
  const { scene, camera } = useThree();
  const sunLight = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const fog = useMemo(() => new FogExp2('#a9d4ff', 0.00002), []);
  const bg = useMemo(() => new Color(), []);

  useFrame(() => {
    const s = sim.sky.sun(sim.timeS);
    const el = s.elevDeg * RAD, az = s.azDeg * RAD;
    const up = Math.max(0, Math.sin(el));
    const day = Math.min(1, up * 3);
    if (sunLight.current) {
      sunLight.current.position.set(Math.sin(az) * Math.cos(el) * 800, Math.max(0.05, Math.sin(el)) * 800, -Math.cos(az) * Math.cos(el) * 800);
      sunLight.current.intensity = 3.2 * up;
    }
    if (hemi.current) hemi.current.intensity = 0.25 + 0.9 * day;
    const under = isUnderwater(camera.position.y);
    if (under) {
      const depth = Math.min(1, -camera.position.y / 15);
      bg.copy(SHALLOW).lerp(DEEP, depth).multiplyScalar(0.25 + 0.75 * day);
      fog.density = 0.07;
    } else {
      bg.copy(NIGHT).lerp(DAY, day);
      fog.density = 0.00002;
    }
    fog.color.copy(bg);
    scene.background = bg;
    scene.fog = fog;
  });

  return (
    <>
      <directionalLight ref={sunLight} />
      <hemisphereLight ref={hemi} args={['#cfe6ff', '#0b4f66', 0.8]} />
    </>
  );
}
