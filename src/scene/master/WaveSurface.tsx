import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, DoubleSide, ShaderMaterial, Vector2, Vector3 } from 'three';
import { msim, useMaster } from '../../state/master';
import { WAVE_COMPONENTS } from '../../model/master/waves';
import { SKY_GLSL } from './SkyDome';

const RINGS = 210, SEGS = 200, R0 = 0.16, RATIO = 1.056;

/** Polar grid centred under the node: fine near the hull, kilometres wide at the horizon. */
function polarGrid() {
  const pos = new Float32Array((RINGS + 1) * SEGS * 3), idx: number[] = [];
  for (let i = 0; i <= RINGS; i++) {
    const r = R0 * Math.pow(RATIO, i);
    for (let j = 0; j < SEGS; j++) {
      const a = (j / SEGS) * 2 * Math.PI, k = (i * SEGS + j) * 3;
      pos[k] = r * Math.cos(a); pos[k + 1] = 0; pos[k + 2] = r * Math.sin(a);
    }
  }
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEGS; j++) {
    const a = i * SEGS + j, b = i * SEGS + ((j + 1) % SEGS), c = (i + 1) * SEGS + j, d = (i + 1) * SEGS + ((j + 1) % SEGS);
    idx.push(a, c, b, b, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const VERT = /* glsl */ `
uniform float uTime; uniform vec2 uCenter;
uniform float uA[${WAVE_COMPONENTS}]; uniform float uK[${WAVE_COMPONENTS}]; uniform float uW[${WAVE_COMPONENTS}]; uniform float uPh[${WAVE_COMPONENTS}]; uniform vec2 uDir[${WAVE_COMPONENTS}];
varying vec3 vWorld; varying vec3 vNormal; varying float vSteep;
void main() {
  vec2 xz = uCenter + position.xz;
  float h = 0.0; vec2 g = vec2(0.0);
  for (int i = 0; i < ${WAVE_COMPONENTS}; i++) {
    float th = uK[i] * dot(uDir[i], xz) - uW[i] * uTime + uPh[i];
    h += uA[i] * cos(th);
    g += -uA[i] * uK[i] * sin(th) * uDir[i];
  }
  vec3 w = vec3(xz.x, h, xz.y);
  vWorld = w; vNormal = normalize(vec3(-g.x, 1.0, -g.y)); vSteep = length(g);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uSun; uniform vec3 uCam; uniform vec2 uCenterV; uniform float uCutAlpha; uniform float uCutR; uniform float uDay; uniform float uShade;
varying vec3 vWorld; varying vec3 vNormal; varying float vSteep;
${SKY_GLSL}
void main() {
  vec3 V = normalize(uCam - vWorld);
  float dist = length(uCam - vWorld);
  vec3 N = normalize(vNormal);
  float cut = mix(uCutAlpha, 1.0, smoothstep(uCutR, uCutR * 1.7, length(vWorld.xz - uCenterV)));
  if (gl_FrontFacing) {
    float f0 = 0.02, cosv = clamp(dot(N, V), 0.0, 1.0);
    float fres = f0 + (1.0 - f0) * pow(1.0 - cosv, 5.0);
    vec3 R = reflect(-V, N);
    vec3 sky = skyColor(vec3(R.x, abs(R.y), R.z), uSun, uDay);
    vec3 deep = vec3(0.012, 0.18, 0.26) * (0.25 + 0.75 * uDay), shallow = vec3(0.04, 0.42, 0.50) * (0.2 + 0.8 * uDay);
    vec3 body = mix(deep, shallow, pow(clamp(N.y, 0.0, 1.0), 6.0) * 0.6 + 0.2);
    vec3 H = normalize(uSun + V);
    float spec = pow(max(dot(N, H), 0.0), 400.0) * 6.0 * uDay * uShade;
    vec3 col = mix(body, sky, fres) + spec;
    float foam = smoothstep(0.34, 0.62, vSteep);
    col = mix(col, vec3(0.88, 0.94, 0.97) * (0.4 + 0.6 * uDay), foam * 0.7);
    float fog = 1.0 - exp(-dist * 0.00007);
    col = mix(col, skyColor(vec3(normalize(vec3(V.x * -1.0, 0.02, V.z * -1.0))), uSun, uDay), fog);
    gl_FragColor = vec4(col, cut);
  } else {
    // seen from below: bright window where light comes through, mirror-dark elsewhere
    float cosv = clamp(dot(-N, V), 0.0, 1.0);
    float window = smoothstep(0.55, 0.95, cosv);
    vec3 col = mix(vec3(0.01, 0.12, 0.18), vec3(0.18, 0.62, 0.72), window) * (0.15 + 0.85 * uDay);
    col += pow(max(dot(refract(-uSun, vec3(0.0, -1.0, 0.0), 1.33), -V), 0.0), 40.0) * 0.5 * uDay * uShade;
    gl_FragColor = vec4(col, 1.0);
  }
  gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(2.2));
  #include <colorspace_fragment>
}`;

/** Wave surface driven by the same components the physics samples. */
export function WaveSurface() {
  const geo = useMemo(polarGrid, []);
  const mat = useMemo(() => new ShaderMaterial({
    side: DoubleSide, transparent: true, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uCenter: { value: new Vector2() }, uCenterV: { value: new Vector2() },
      uA: { value: new Array(WAVE_COMPONENTS).fill(0) }, uK: { value: new Array(WAVE_COMPONENTS).fill(0) }, uW: { value: new Array(WAVE_COMPONENTS).fill(0) },
      uPh: { value: new Array(WAVE_COMPONENTS).fill(0) }, uDir: { value: Array.from({ length: WAVE_COMPONENTS }, () => new Vector2()) },
      uSun: { value: new Vector3(0, 1, 0) }, uCam: { value: new Vector3() }, uCutAlpha: { value: 0.3 }, uCutR: { value: 7 }, uDay: { value: 1 }, uShade: { value: 1 },
    },
    vertexShader: VERT, fragmentShader: FRAG,
  }), []);

  useFrame(({ camera }) => {
    const u = mat.uniforms, comps = msim.sea.components, st = useMaster.getState();
    comps.forEach((c, i) => { u.uA.value[i] = c.a; u.uK.value[i] = c.k; u.uW.value[i] = c.omega; u.uPh.value[i] = c.phase; u.uDir.value[i].set(c.dirX, c.dirZ); });
    u.uTime.value = msim.tPhys;
    u.uCenter.value.set(msim.pos[0], msim.pos[1]); u.uCenterV.value.set(msim.pos[0], msim.pos[1]);
    const s = msim.telemetry.sun, el = (s.elevDeg * Math.PI) / 180, az = (s.azDeg * Math.PI) / 180;
    u.uSun.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    u.uCam.value.copy(camera.position);
    u.uCutAlpha.value = st.cutaway ? 0.28 : 1; u.uCutR.value = 7;
    u.uDay.value = Math.min(1, Math.max(0, (s.elevDeg + 4) / 14)); u.uShade.value = 0.25 + 0.75 * msim.telemetry.shade;
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={10} />;
}
