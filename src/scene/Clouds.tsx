import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, Object3D, DoubleSide } from 'three';
import { sim } from '../state/sim';
import { puffTexture, shadowTexture } from './textures';

const MAX_PUFFS = 14000;
const MAX_DECKS = 64;
const MAX_SHADOWS = 2400;
const PUFFS_PER_CLOUD = 6;
const DECK_RADIUS_M = 1500; // clouds this wide render as flat sheets
const RAD = Math.PI / 180;

/** Makes instanced quads face whichever camera renders them (main view or a node camera). */
function billboard(shader: { vertexShader: string }) {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  vec3 center = instanceMatrix[3].xyz;
  vec2 sz = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  mvPosition = modelViewMatrix * vec4(center, 1.0);
  mvPosition.xy += position.xy * sz;
#else
  mvPosition = modelViewMatrix * mvPosition;
#endif
gl_Position = projectionMatrix * mvPosition;`,
  );
}

function rand(id: number, k: number) {
  const x = Math.sin(id * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 3D clouds as camera-facing puffs (cumulus) and flat sheets (marine layer), plus their shadows on the water. */
export function Clouds() {
  const puffs = useRef<InstancedMesh>(null);
  const decks = useRef<InstancedMesh>(null);
  const shadowsCu = useRef<InstancedMesh>(null);
  const shadowsDeck = useRef<InstancedMesh>(null);
  const tex = useMemo(() => ({ puff: puffTexture(), shadow: shadowTexture() }), []);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);

  useFrame(() => {
    const p = puffs.current, d = decks.current, sc = shadowsCu.current, sd = shadowsDeck.current;
    if (!p || !d || !sc || !sd) return;
    const clouds = sim.sky.clouds(sim.timeS);
    const sun = sim.sky.sun(sim.timeS);
    const tanE = Math.tan(Math.max(sun.elevDeg, 5) * RAD);
    const sx = Math.sin(sun.azDeg * RAD), sy = Math.cos(sun.azDeg * RAD);
    let np = 0, nd = 0, ncs = 0, nds = 0;
    for (const c of clouds) {
      const isDeck = c.radiusM >= DECK_RADIUS_M;
      if (isDeck) {
        if (nd < MAX_DECKS) {
          dummy.position.set(c.x, c.altM, -c.y);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.quaternion.setFromEuler(dummy.rotation);
          dummy.scale.set(c.radiusM * 2, c.radiusM * 2, 1);
          dummy.updateMatrix();
          d.setMatrixAt(nd, dummy.matrix);
          color.setScalar(0.92 - c.opacity * 0.2);
          d.setColorAt(nd, color);
          nd++;
        }
      } else {
        for (let k = 0; k < PUFFS_PER_CLOUD && np < MAX_PUFFS; k++) {
          const ox = (rand(c.id, k) - 0.5) * c.radiusM * 1.2, oz = (rand(c.id, k + 20) - 0.5) * c.radiusM * 1.2;
          const rel = rand(c.id, k + 40);
          dummy.position.set(c.x + ox, c.altM + rel * c.thicknessM, -c.y + oz);
          dummy.quaternion.identity();
          const s = c.radiusM * (0.9 + rand(c.id, k + 60) * 0.7);
          dummy.scale.set(s, s * 0.7, 1);
          dummy.updateMatrix();
          p.setMatrixAt(np, dummy.matrix);
          color.setScalar(0.7 + 0.3 * rel);
          p.setColorAt(np, color);
          np++;
        }
      }
      if (sun.elevDeg > 0) {
        const throwM = c.altM / tanE;
        const wx = c.x - sx * throwM, wz = -(c.y - sy * throwM);
        const target = isDeck ? sd : sc;
        const n = isDeck ? nds : ncs;
        if (n < (isDeck ? MAX_DECKS : MAX_SHADOWS)) {
          dummy.position.set(wx, 0.25, wz);
          dummy.quaternion.setFromEuler(dummy.rotation.set(-Math.PI / 2, 0, 0));
          dummy.scale.set(c.radiusM * 2, c.radiusM * 2, 1);
          dummy.updateMatrix();
          target.setMatrixAt(n, dummy.matrix);
          if (isDeck) nds++; else ncs++;
        }
      }
    }
    p.count = np; d.count = nd; sc.count = ncs; sd.count = nds;
    for (const m of [p, d, sc, sd]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={puffs} args={[undefined, undefined, MAX_PUFFS]} frustumCulled={false} renderOrder={3}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={tex.puff} transparent depthWrite={false} opacity={0.9} side={DoubleSide} onBeforeCompile={billboard} />
      </instancedMesh>
      <instancedMesh ref={decks} args={[undefined, undefined, MAX_DECKS]} frustumCulled={false} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={tex.puff} transparent depthWrite={false} opacity={0.6} side={DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={shadowsCu} args={[undefined, undefined, MAX_SHADOWS]} frustumCulled={false} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={tex.shadow} transparent depthWrite={false} opacity={0.5} />
      </instancedMesh>
      <instancedMesh ref={shadowsDeck} args={[undefined, undefined, MAX_DECKS]} frustumCulled={false} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={tex.shadow} transparent depthWrite={false} opacity={0.28} />
      </instancedMesh>
    </>
  );
}
