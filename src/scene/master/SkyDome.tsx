import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, ShaderMaterial, Vector3 } from 'three';
import { msim } from '../../state/master';

/** Shared GLSL: sky radiance for a view direction, used by the dome and by water reflections. */
export const SKY_GLSL = /* glsl */ `
vec3 skyColor(vec3 d, vec3 sun, float day) {
  float up = clamp(d.y, 0.0, 1.0);
  vec3 zenith = mix(vec3(0.01, 0.015, 0.05), vec3(0.10, 0.32, 0.72), day);
  vec3 horizon = mix(vec3(0.02, 0.03, 0.07), vec3(0.62, 0.78, 0.95), day);
  vec3 c = mix(horizon, zenith, pow(up, 0.55));
  float cosS = clamp(dot(d, sun), -1.0, 1.0);
  float low = 1.0 - smoothstep(0.0, 0.35, sun.y);
  c += vec3(1.0, 0.55, 0.25) * low * day * pow(max(cosS, 0.0), 6.0) * (1.0 - up) * 0.9;
  c += vec3(1.0, 0.9, 0.75) * pow(max(cosS, 0.0), 80.0) * 0.35 * day;
  c += vec3(1.0, 0.97, 0.9) * smoothstep(0.99996, 0.99998, cosS) * 40.0 * day;
  return c;
}`;

const VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `uniform vec3 uSun; uniform float uDay; varying vec3 vDir; ${SKY_GLSL}
void main(){ gl_FragColor = vec4(pow(skyColor(vDir, uSun, uDay), vec3(2.2)), 1.0);
#include <colorspace_fragment>
}`;

export function SkyDome() {
  const mat = useMemo(() => new ShaderMaterial({
    side: BackSide, depthWrite: false, depthTest: false, uniforms: { uSun: { value: new Vector3(0, 1, 0) }, uDay: { value: 1 } },
    vertexShader: VERT, fragmentShader: FRAG,
  }), []);
  useFrame(({ camera }) => {
    const s = msim.telemetry.sun, el = (s.elevDeg * Math.PI) / 180, az = (s.azDeg * Math.PI) / 180;
    mat.uniforms.uSun.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    mat.uniforms.uDay.value = Math.min(1, Math.max(0, (s.elevDeg + 4) / 14));
    mesh.current?.position.copy(camera.position);
  });
  const mesh = useMemo(() => ({ current: null as import('three').Mesh | null }), []);
  return <mesh ref={(m) => { mesh.current = m; }} material={mat} renderOrder={-10} frustumCulled={false}><sphereGeometry args={[30000, 48, 24]} /></mesh>;
}
