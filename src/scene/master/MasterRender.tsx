import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CubeCamera, Euler, Matrix3, Matrix4, Mesh, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector3, WebGLCubeRenderTarget, WebGLRenderTarget, FogExp2, Color,
} from 'three';
import { layoutRects, msim, useMaster } from '../../state/master';
import { buildExport, groundTruth, projectDir } from '../../model/master/skyCam';
import { sunVector } from '../../model/master/solar';
import { skyCameraLocal } from './MasterNode';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`;
const FRAG = /* glsl */ `
uniform samplerCube tCube; uniform mat3 uRot; uniform float uFov; uniform vec3 uSun; uniform float uGlare; uniform float uManual;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float u = p.x, vd = -p.y, r = length(vec2(u, vd));
  if (r > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float th = r * uFov * 0.5, s = r < 1e-5 ? 0.0 : sin(th) / r;
  vec3 w = uRot * vec3(-u * s, cos(th), vd * s);
  vec3 col = textureCube(tCube, w).rgb;
  // lens glare around the sun: a tight core, a soft halo and a veiling haze (EST)
  float ang = acos(clamp(dot(normalize(w), uSun), -1.0, 1.0));
  float glare = 0.9 * exp(-ang / 0.035) + 0.28 * exp(-ang / 0.16) + 0.07 * exp(-ang / 0.7);
  col += vec3(1.0, 0.96, 0.88) * glare * uGlare;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  if (uManual > 0.5) gl_FragColor.rgb = pow(max(gl_FragColor.rgb, 0.0), vec3(1.0 / 2.2));
}`;

const _e = new Euler(), _m4 = new Matrix4(), _w = new Vector3();
const CUBE = 512;

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/**
 * The only priority-1 frame callback in the master scene, so it owns rendering: it draws the 3D view into one
 * rectangle and the node's fisheye sky camera into another. The fisheye is built from a cube map rendered at the
 * camera's position on the deck, so the node's own petals and mast are in the picture.
 */
export function MasterRender() {
  const { gl, scene, camera } = useThree();
  const frame = useRef(0), handled = useRef(0);
  const rt = useMemo(() => new WebGLCubeRenderTarget(CUBE, { generateMipmaps: false }), []);
  const cubeCam = useMemo(() => { const c = new CubeCamera(0.05, 60000, rt); return c; }, [rt]);
  const quad = useMemo(() => {
    const mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: { tCube: { value: rt.texture }, uRot: { value: new Matrix3() }, uFov: { value: Math.PI }, uSun: { value: new Vector3(0, 1, 0) }, uGlare: { value: 1 }, uManual: { value: 0 } },
    });
    const m = new Mesh(new PlaneGeometry(1, 1), mat); m.frustumCulled = false;
    const s = new Scene(); s.add(m);
    return { scene: s, mat, cam: new OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  }, [rt]);
  const exportRt = useMemo(() => new WebGLRenderTarget(1024, 1024), []);
  const fog = useMemo(() => new FogExp2('#a9d4ff', 0.00002), []);
  const tint = useMemo(() => new Color(), []);

  function setFisheye(manual: boolean) {
    const tel = msim.telemetry, lens = useMaster.getState().lens;
    _e.set(tel.att.pitch, tel.att.yaw, tel.att.roll, 'YXZ');
    quad.mat.uniforms.uRot.value.setFromMatrix4(_m4.makeRotationFromEuler(_e));
    quad.mat.uniforms.uFov.value = (lens.fovDeg * Math.PI) / 180;
    const sv = sunVector(tel.sun.azDeg, tel.sun.elevDeg);
    quad.mat.uniforms.uSun.value.set(sv[0], sv[1], sv[2]);
    quad.mat.uniforms.uGlare.value = tel.sun.elevDeg > -1 ? Math.min(1, 0.15 + tel.shade) : 0;
    quad.mat.uniforms.uManual.value = manual ? 1 : 0;
  }
  function drawRect(r: { x: number; y: number; w: number; h: number }, height: number) {
    gl.setScissorTest(true);
    gl.setScissor(r.x, height - r.y - r.h, r.w, r.h);
    gl.setViewport(r.x, height - r.y - r.h, r.w, r.h);
  }

  useFrame((state) => {
    const { width, height } = state.size, st = useMaster.getState();
    const L = layoutRects(width, height, st.view, st.pip);
    frame.current++;

    // fog: murky teal under the surface, clear air above
    const under = camera.position.y < msim.sea.elevation(camera.position.x, camera.position.z, msim.tPhys) - 0.02;
    const day = Math.min(1, Math.max(0, (msim.telemetry.sun.elevDeg + 4) / 14));
    if (under) { tint.set('#0a5568').multiplyScalar(0.25 + 0.75 * day); fog.color.copy(tint); fog.density = 0.075; } else { fog.color.set('#a9d4ff').multiplyScalar(0.05 + 0.95 * day); fog.density = 0.00002; }
    scene.fog = fog;

    const wantFisheye = !!L.fisheye;
    if (wantFisheye && (st.view === 'sky' || frame.current % 2 === 0)) {
      const c = skyCameraLocal();
      _w.set(c[0], c[1], c[2]);
      _e.set(msim.telemetry.att.pitch, msim.telemetry.att.yaw, msim.telemetry.att.roll, 'YXZ');
      _w.applyEuler(_e);
      _w.x += msim.pos[0]; _w.y += msim.telemetry.heaveM; _w.z += msim.pos[1];
      cubeCam.position.copy(_w);
      cubeCam.update(gl, scene);
    }

    gl.setScissorTest(false);
    gl.setViewport(0, 0, width, height);
    gl.setClearColor('#050b18'); gl.clear();

    const drawScene = () => {
      if (!L.scene) return;
      drawRect(L.scene, height);
      gl.clearDepth();
      if ((camera as PerspectiveCamera).isPerspectiveCamera) { (camera as PerspectiveCamera).aspect = L.scene.w / L.scene.h; (camera as PerspectiveCamera).updateProjectionMatrix(); }
      gl.render(scene, camera);
    };
    const drawFisheye = () => {
      if (!L.fisheye) return;
      drawRect(L.fisheye, height);
      setFisheye(false);
      gl.render(quad.scene, quad.cam);
    };
    // the small picture goes on top of the large one
    if (st.view === 'sky') { drawFisheye(); drawScene(); } else { drawScene(); drawFisheye(); }
    gl.setScissorTest(false);

    // frame export: fisheye at the lens size to a PNG, plus ground truth as JSON
    if (st.exportRequest !== handled.current) {
      handled.current = st.exportRequest;
      const lens = st.lens, tel = msim.telemetry;
      const size = Math.min(1024, lens.sizePx);
      if (exportRt.width !== size) exportRt.setSize(size, size);
      cubeCam.update(gl, scene);
      setFisheye(true);
      gl.setRenderTarget(exportRt); gl.setViewport(0, 0, size, size); gl.render(quad.scene, quad.cam); gl.setRenderTarget(null);
      const buf = new Uint8Array(size * size * 4);
      gl.readRenderTargetPixels(exportRt, 0, 0, size, size, buf);
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      const ctx = cv.getContext('2d')!, img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      ctx.putImageData(img, 0, 0);
      const l2 = { ...lens, sizePx: size };
      const gt = groundTruth(msim.sky.clouds(msim.tSky), msim.pos[0], -msim.pos[1], 1.5, tel.att, l2);
      const sv = sunVector(tel.sun.azDeg, tel.sun.elevDeg), sp = projectDir(tel.att, sv, l2);
      const json = buildExport(msim.tSky, st.prompt, st.model, l2, tel.att, tel.sun.elevDeg > 0 && sp.inside ? sp.px : null, gt);
      const stamp = `skycam_t${Math.round(msim.tSky)}`;
      cv.toBlob((b) => b && download(`${stamp}.png`, b));
      download(`${stamp}.json`, new Blob([JSON.stringify(json, null, 1)], { type: 'application/json' }));
      useMaster.getState().set({ exportFrame: json });
    }
  }, 1);
  return null;
}
