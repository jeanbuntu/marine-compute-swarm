import { useMemo, useEffect } from 'react';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Shape, ShapeGeometry, ExtrudeGeometry } from 'three';
import { GPU, PANEL_CORNER_M, PETAL_PAIRS, PETAL_IDS, PETAL_DIRS, petalGeometry, type PetalId } from '../model/hardware';
import type { ThreeEvent } from '@react-three/fiber';
import { CylinderGeometry, SphereGeometry, TorusGeometry, MeshStandardMaterial, CanvasTexture, DataTexture, RGBAFormat, SRGBColorSpace, LinearFilter, LinearMipmapLinearFilter, Vector3, Quaternion } from 'three';
import type { NodeDesign, Part, Subsystem } from '../model/parts';
import { RIGHTING_BAG, recoveryHardware } from '../model/recovery';
import { partPosition, PETAL_TILT_DEG, type PetalState } from '../model/hydrostatics';

type V3 = [number, number, number];
const COLORS: Record<Subsystem, string> = {
  hull: '#d5dfe0', petals: '#101c26', power: '#385e64', compute: '#adb8bb', cooling: '#637f83',
  propulsion: '#26373c', navigation: '#e0e4dc', comms: '#e4e7e2', camera: '#26373c',
};
export const subsystemColor = (s: Subsystem) => COLORS[s];

const cyl = new CylinderGeometry(1, 1, 1, 12);
const dome = new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const ring = new TorusGeometry(1, 0.12, 6, 20);
const mats = new Map<string, MeshStandardMaterial>();
function material(color: string, hot = false, ghost = false) {
  const key = `${color}|${hot}|${ghost}`;
  if (!mats.has(key)) mats.set(key, new MeshStandardMaterial({
    color, roughness: 0.48, metalness: 0.28,
    emissive: hot ? '#ffd24a' : '#000000', emissiveIntensity: hot ? 0.32 : 0,
    transparent: ghost, opacity: ghost ? 0.14 : 1, depthWrite: !ghost,
  }));
  return mats.get(key)!;
}
export function Block({ at = [0, 0, 0], size, color = '#83969a', hot = false, ghost = false }: { at?: V3; size: V3; color?: string; hot?: boolean; ghost?: boolean }) {
  const geometry = useMemo(() => new RoundedBoxGeometry(...size, 3, Math.min(0.025, Math.min(...size) * 0.18)), [size[0], size[1], size[2]]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material(color, hot, ghost)} position={at} />;
}
/** A real length of tube between mounting points, in meters. */
export function Tube({ a, b, radius = 0.015, color = '#8e9b9d' }: { a: V3; b: V3; radius?: number; color?: string }) {
  const start = new Vector3(...a), end = new Vector3(...b), delta = end.clone().sub(start);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.clone().normalize());
  return <mesh geometry={cyl} material={material(color)} position={start.add(end).multiplyScalar(0.5)} quaternion={q} scale={[radius, delta.length(), radius]} />;
}
const solarMats = new Map<string, MeshStandardMaterial>();
/** Cell gaps and silver busbars baked into one map; no per-cell draw calls. */
function solarMaterial(width: number, depth: number, hot: boolean) {
  const cols = Math.max(2, Math.round(width / 0.17)), rows = Math.max(2, Math.round(depth / 0.17));
  const key = `${cols}/${rows}/${hot}`;
  if (!solarMats.has(key)) {
    const n = 512, data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = ((x + 0.5) * cols / n) % 1, v = ((y + 0.5) * rows / n) % 1;
      const gap = u < 0.018 || v < 0.018;
      const bus = Math.abs(u - 0.25) < 0.008 || Math.abs(u - 0.75) < 0.008;
      const k = (y * n + x) * 4, shade = gap ? 182 : bus ? 139 : 16;
      data[k] = shade; data[k + 1] = shade + (gap || bus ? 0 : 7); data[k + 2] = shade + (gap || bus ? 0 : 13); data[k + 3] = 255;
    }
    const map = new DataTexture(data, n, n, RGBAFormat);
    map.colorSpace = SRGBColorSpace; map.magFilter = LinearFilter; map.minFilter = LinearMipmapLinearFilter; map.generateMipmaps = true; map.needsUpdate = true;
    solarMats.set(key, new MeshStandardMaterial({ map, roughness: 0.34, metalness: 0.12, emissive: hot ? '#725b18' : '#000000' }));
  }
  return solarMats.get(key)!;
}
const labelMats = new Map<string, MeshStandardMaterial>();
function Label({ text, at, width, top = false }: { text: string; at: V3; width: number; top?: boolean }) {
  if (!labelMats.has(text)) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#e3e9e6'; ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#1c3036'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 68, 480);
    }
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
    labelMats.set(text, new MeshStandardMaterial({ map, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
  }
  return <mesh position={at} rotation={top ? [-Math.PI / 2, 0, 0] : [0, 0, 0]} material={labelMats.get(text)}><planeGeometry args={[width, width / 4]} /></mesh>;
}
export function SolarPanel({ width, depth, thickness, hot }: { width: number; depth: number; thickness: number; hot: boolean }) {
  return <group>
    <Block size={[width, thickness, depth]} color="#a9b7b9" hot={hot} />
    <mesh position={[0, thickness / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} material={solarMaterial(width, depth, hot)}>
      <planeGeometry args={[Math.max(0.05, width - 0.035), Math.max(0.05, depth - 0.035)]} />
    </mesh>
    {[-0.3, 0.3].map(z => <Block key={z} at={[0, -thickness / 2 - 0.012, depth * z]} size={[width, 0.024, 0.025]} color="#6f858c" />)}
  </group>;
}
function roundedOutline(width: number, radius: number) {
  const h = width / 2, k = h - radius, s = new Shape();
  s.moveTo(-k, -h); s.lineTo(k, -h); s.quadraticCurveTo(h, -h, h, -k);
  s.lineTo(h, k); s.quadraticCurveTo(h, h, k, h); s.lineTo(-k, h);
  s.quadraticCurveTo(-h, h, -h, k); s.lineTo(-h, -k); s.quadraticCurveTo(-h, -h, -k, -h);
  return s;
}
function facetShape(length: number, inner: number, outer: number, inset = 0) {
  const s = new Shape(), x0 = -length / 2 + inset, x1 = length / 2 - inset;
  const wi = inner / 2 + (outer - inner) * inset / (2 * length) - inset;
  const wo = outer / 2 - (outer - inner) * inset / (2 * length) - inset;
  const points = [[x0,-wi],[x1,-wo],[x1,wo],[x0,wi]];
  const radius = Math.max(0.004,PANEL_CORNER_M-inset);
  const cuts = points.map((p,i) => {
    const prev=points[(i+3)%4], next=points[(i+1)%4];
    const along=(q: number[]) => { const len=Math.hypot(q[0]-p[0],q[1]-p[1]); return [p[0]+(q[0]-p[0])*radius/len,p[1]+(q[1]-p[1])*radius/len]; };
    return { p, a: along(prev), b: along(next) };
  });
  s.moveTo(...cuts[0].a as [number,number]);
  for (const cut of cuts) { s.lineTo(cut.a[0],cut.a[1]); s.quadraticCurveTo(cut.p[0],cut.p[1],cut.b[0],cut.b[1]); }
  s.closePath(); return s;
}
export function FacetPanel({ design, hot = false, center = 0 }: { design: NodeDesign; hot?: boolean; center?: number }) {
  const pg = petalGeometry(design);
  const [frame, cells] = useMemo(() => {
    const frame = new ExtrudeGeometry(facetShape(pg.length - 0.006, pg.innerWidth - 0.006, pg.outerWidth - 0.006), { depth: 0.044, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, steps: 1 });
    const cells = new ShapeGeometry(facetShape(pg.length, pg.innerWidth, pg.outerWidth, 0.018));
    const pos = cells.attributes.position, uv = cells.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / pg.length + 0.5, pos.getY(i) / pg.outerWidth + 0.5);
    return [frame, cells];
  }, [pg.length, pg.innerWidth, pg.outerWidth]);
  useEffect(() => () => { frame.dispose(); cells.dispose(); }, [frame, cells]);
  return <group position={[center, 0, 0]}>
    <mesh geometry={frame} material={material('#85989b', hot)} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.022, 0]} />
    <mesh geometry={cells} material={solarMaterial(pg.length, pg.outerWidth, hot)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.026, 0]} />
    {[-0.28, 0.28].map(t => <Block key={t} at={[pg.length * t, -0.038, 0]} size={[0.025, 0.025, pg.innerWidth + (pg.outerWidth - pg.innerWidth) * (t + 0.5) - 0.02]} color="#667c80" />)}
  </group>;
}
function DeckPanel({ side, thickness, hot }: { side: number; thickness: number; hot: boolean }) {
  const [frame, cells] = useMemo(() => {
    const shape = (inset: number) => {
      const s = new Shape(), radius = (side / 2 - inset) / Math.cos(Math.PI / 8);
      for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; if (!i) s.moveTo(radius * Math.cos(a), radius * Math.sin(a)); else s.lineTo(radius * Math.cos(a), radius * Math.sin(a)); }
      s.closePath(); return s;
    };
    const cells = new ShapeGeometry(shape(0.018)), pos = cells.attributes.position, uv = cells.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / side + 0.5, pos.getY(i) / side + 0.5);
    return [new ExtrudeGeometry(shape(0), { depth: thickness, bevelEnabled: false }), cells];
  }, [side, thickness]);
  useEffect(() => () => { frame.dispose(); cells.dispose(); }, [frame, cells]);
  return <group>
    <mesh geometry={frame} material={material('#95a6a6', hot)} rotation={[-Math.PI / 2, 0, 0]} position={[0, -thickness / 2, 0]} />
    <mesh geometry={cells} material={solarMaterial(side, side, hot)} rotation={[-Math.PI / 2, 0, 0]} position={[0, thickness / 2 + 0.001, 0]} />
  </group>;
}

/** Watertight shell drawn as walls, so inspection can reveal the equipment inside. */
function Shell({ width, height, hot, ghost, keel = false }: { width: number; height: number; hot: boolean; ghost: boolean; keel?: boolean }) {
  const geometry = useMemo(() => {
    const outline = roundedOutline(width, 0.08), inner = roundedOutline(width - 0.05, 0.055);
    outline.holes.push(inner);
    return new ExtrudeGeometry(outline, { depth: height, bevelEnabled: false, steps: 1, curveSegments: 6 });
  }, [width, height]);
  const cap = useMemo(() => new ExtrudeGeometry(roundedOutline(width, 0.08), { depth: 0.025, bevelEnabled: false, curveSegments: 6 }), [width]);
  useEffect(() => () => { geometry.dispose(); cap.dispose(); }, [geometry, cap]);
  const mat = material(keel ? '#637d83' : '#d5dfe0', hot, ghost);
  return <group>
    <mesh geometry={geometry} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -height / 2, 0]} />
    <mesh geometry={cap} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, keel ? -height / 2 : height / 2 - 0.025, 0]} />
    {!keel && [-1, 1].map(s => <Block key={s} at={[s * (width / 2 - 0.025), height / 2 - 0.05, 0]} size={[0.045, 0.06, width - 0.06]} color="#344b52" ghost={ghost} />)}
  </group>;
}

export interface NodeModelProps {
  design: NodeDesign; petals: PetalState; offsets?: Record<string, V3>;
  highlightId?: string | null; hotAll?: boolean; ghostShell?: boolean; hidePetals?: boolean;
  recoveryInflation?: number; recoveryHatch?: number;
  onPartOver?(id: string | null): void; onPartClick?(id: string): void;
}

export function NodeModel({ design, petals, offsets = {}, highlightId, hotAll, ghostShell, hidePetals, recoveryInflation = 0, recoveryHatch = 0, onPartOver, onPartClick }: NodeModelProps) {
  const separated = Object.keys(offsets).length > 0;
  const battery = design.parts.find(p => p.id === 'battery');
  const bus = design.parts.find(p => p.id === 'mppt-bus');
  const compute = design.parts.find(p => p.id === 'compute-pod');
  const exchanger = design.parts.find(p => p.id === 'heat-exchanger');
  return <group>
    {recoveryInflation > 0.001 && <RightingBag design={design} inflation={recoveryInflation} />}
    {!separated && PETAL_PAIRS.map((pair, i) => {
      const root = design.hullSideM / 2, y = design.keelDepthM + design.hullDepthM - 0.035;
      const [a, b] = pair.map(id => PETAL_DIRS[id]);
      const start: V3 = [a[0] * root, y, a[2] * root], end: V3 = [b[0] * root, y, b[2] * root];
      return <group key={i}><Tube a={start} b={end} radius={0.018} color="#526d71" />
        <Block at={start} size={[0.09, 0.07, 0.09]} color="#82928a" /><Block at={end} size={[0.07, 0.06, 0.07]} color="#526d71" />
      </group>;
    })}
    {/* The equipment tray and keel rails are part of the hull assembly. */}
    <group position={offsets['hull-shell']}>
      {[-0.33, 0.33].map(x => <Block key={x} at={[x, design.keelDepthM + 0.035, 0]} size={[0.035, 0.04, design.hullSideM * 0.8]} color="#71868b" ghost={ghostShell} />)}
    </group>
    {!separated && battery && bus && <>
      <Tube a={[battery.pos[0] + battery.size[0] * 0.32, battery.pos[1] + battery.size[1] / 2 + 0.025, battery.pos[2] - battery.size[2] * 0.25]} b={[bus.pos[0], battery.pos[1] + battery.size[1] / 2 + 0.025, -0.1]} radius={0.009} color="#9a513b" />
      <Tube a={[bus.pos[0], battery.pos[1] + battery.size[1] / 2 + 0.025, -0.1]} b={[bus.pos[0], bus.pos[1] - bus.size[1] / 2, -0.1]} radius={0.009} color="#273b40" />
    </>}
    {!separated && compute && exchanger && [-1, 1].map(s => {
      const a: V3 = [compute.pos[0] + s * compute.size[0] * 0.28, compute.pos[1] - compute.size[1] * 0.23, compute.pos[2] - compute.size[2] / 2 - 0.05];
      const b: V3 = [a[0], design.keelDepthM + 0.025, a[2]];
      const c: V3 = [a[0], b[1], exchanger.pos[2] + 0.03];
      const e: V3 = [a[0], exchanger.pos[1] + exchanger.size[1] * 0.3, c[2]];
      return <group key={s}><Tube a={a} b={b} radius={0.012} color="#344e55" /><Tube a={b} b={c} radius={0.012} color="#344e55" /><Tube a={c} b={e} radius={0.012} color="#344e55" /></group>;
    })}
    {design.parts.filter(p => !(hidePetals && p.id.startsWith('petal-'))).map(p => <PartMesh key={p.id} part={p} design={design} petals={petals} offset={offsets[p.id]} hot={!!hotAll || highlightId === p.id} ghost={!!ghostShell && (p.subsystem === 'hull' || p.id === 'deck-pv')} separated={separated} hatch={recoveryHatch} onOver={onPartOver} onClick={onPartClick} />)}
  </group>;
}

function PartMesh({ part: p, design: d, petals, offset = [0, 0, 0], hot, ghost, separated, hatch = 0, onOver, onClick }: {
  part: Part; design: NodeDesign; petals: PetalState; offset?: V3; hot: boolean; ghost: boolean; separated: boolean; hatch?: number;
  onOver?(id: string | null): void; onClick?(id: string): void;
}) {
  const id = p.id, side = d.hullSideM, deck = d.keelDepthM + d.hullDepthM;
  let pos = partPosition(d, p, petals);
  if (id === 'hull-shell') pos = [0, d.keelDepthM + d.hullDepthM / 2, 0];
  if (id === 'keel-pod') pos = [0, d.keelDepthM / 2, 0];
  pos = pos.map((v, i) => v + offset[i]) as V3;
  const handlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onOver?.(id); },
    onPointerOut: () => onOver?.(null),
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick?.(id); },
  };
  let content;
  if (id === 'hull-shell' || id === 'keel-pod') {
    content = <Shell width={id === 'hull-shell' ? side : side * 0.6} height={id === 'hull-shell' ? d.hullDepthM : d.keelDepthM} hot={hot} ghost={ghost} keel={id === 'keel-pod'} />;
  } else if (id === 'perimeter-bumper') {
    content = <RubRail side={side} hot={hot} ghost={ghost} />;
  } else if (id === 'panel-restraints') {
    content = <>{PETAL_IDS.map(tag => { const [x,,z] = PETAL_DIRS[tag]; return <group key={tag} position={[x * side * 0.47, 0, z * side * 0.47]} rotation={[0, -Math.atan2(z,x), 0]}><Block size={[0.07,0.07,0.13]} color="#546b6d" hot={hot} /><Block at={[0,0.04,0]} size={[0.03,0.025,0.08]} color="#d49a54" hot={hot} /></group>; })}</>;
  } else if (id === 'recovery-cassette') {
    const top = p.size[1] / 2;
    content = <>
      <Block size={p.size} color="#354e56" hot={hot} ghost={ghost} />
      <Block at={[0,top + 0.018,0]} size={[0.29,0.025,0.43]} color="#253b42" />
      <group position={[-0.145,top + 0.036,0]} rotation={[0,0,hatch * 1.8]}>
        <Block at={[0.145,0,0]} size={[0.29,0.022,0.43]} color="#d3dcd7" hot={hot} />
        <Block at={[0.145,0.014,0]} size={[0.21,0.008,0.06]} color="#d89a54" />
        <Label text="RIGHTING / GAS" width={0.22} at={[0.145,0.02,0.10]} top />
      </group>
      {separated && <Block at={[0,top + .11,0]} size={[.22,.05,.32]} color="#d4914a" hot={hot} />}
    </>;
  } else if (id === 'righting-gas') {
    content = <>
      <mesh geometry={cyl} scale={[.065,.20,.065]} material={material('#b7c4c1',hot)} />
      <mesh position={[0,.10,0]} scale={[.065,.04,.065]}><sphereGeometry args={[1,16,8]} /><meshStandardMaterial color="#b7c4c1" metalness={.55} roughness={.35} /></mesh>
      <Block at={[0,.13,0]} size={[.06,.04,.05]} color="#c8964e" hot={hot} />
      <Tube a={[0,.15,0]} b={[0,.26,0]} radius={.009} color="#314c54" />
      <Block at={[0,0,.066]} size={[.07,.09,.005]} color="#db9a4d" />
    </>;
  } else if (id === 'distress-beacon') {
    content = <>
      <Block at={[0,-.04,0]} size={[.14,.07,.14]} color="#3d5359" hot={hot} />
      <mesh geometry={dome} scale={[.069,.085,.069]} material={material('#e7e8d9',hot)} />
      <mesh geometry={ring} rotation={[Math.PI/2,0,0]} scale={[.062,.062,.062]} material={material('#d99a4e',hot)} />
      <Label text="SOS / GNSS" width={.12} at={[0,-.035,.072]} />
    </>;
  } else if (id === 'safety-controller') {
    content = <><Block size={p.size} color="#466961" hot={hot} /><Block at={[0,p.size[1]/2+.008,0]} size={[.09,.012,.08]} color="#c4cfc6" /><Label text="ISOLATE" width={.10} at={[0,p.size[1]/2+.016,0]} top /></>;
  } else if (id === 'leak-sensor') {
    content = <><Block size={p.size} color="#d8a05b" hot={hot} /><Block at={[0,.014,0]} size={[.045,.005,.04]} color="#334f57" /></>;
  } else if (id.startsWith('petal-')) {
    const tag = id.slice(6) as PetalId, dir = PETAL_DIRS[tag], pg = petalGeometry(d);
    const angle = petals === 'deployed' ? PETAL_TILT_DEG * Math.PI / 180 : 0;
    const yaw = -Math.atan2(dir[2], dir[0]);
    content = <group rotation={[0, yaw, 0]}>
      <group rotation={[0, 0, angle]}>
        <FacetPanel design={d} hot={hot} center={pg.length / 2 - pg.centroid} />
      </group>
      <Block at={[-pg.centroid * Math.cos(angle), -pg.centroid * Math.sin(angle), 0]} size={[0.045, 0.05, pg.innerWidth]} color="#344b52" />
      {!separated && PETAL_IDS.indexOf(tag) % 2 === 0 && <Tube a={[-pg.centroid * Math.cos(angle) - 0.12, -pg.centroid * Math.sin(angle) - 0.14, 0]} b={[(pg.length * 0.65 - pg.centroid) * Math.cos(angle), (pg.length * 0.65 - pg.centroid) * Math.sin(angle) - 0.05, 0]} radius={0.018} />}
    </group>;
  } else if (id === 'deck-pv') {
    content = <DeckPanel side={side} thickness={p.size[1]} hot={hot} />;
  } else if (id.startsWith('thruster-')) {
    const a = Math.atan2(p.pos[0], p.pos[2]);
    content = <group rotation={[0, a, 0]}>
      <mesh geometry={cyl} material={material('#253c43', hot)} rotation={[Math.PI / 2, 0, 0]} scale={[0.065, 0.25, 0.065]} />
      {[-1, 1].map(s => <mesh key={s} geometry={ring} material={material('#acb9ba', hot)} position={[0, 0, s * 0.14]} scale={[0.08, 0.08, 0.08]} />)}
      {[-1,1].map(end => <group key={end} position={[0,0,end*.145]}>
        {[-.035,0,.035].map(v => <group key={v}><Block at={[v,0,0]} size={[.009,.125,.012]} color="#aabbb7" /><Block at={[0,v,.003]} size={[.125,.009,.012]} color="#aabbb7" /></group>)}
      </group>)}
      <Tube a={[0, 0.065, 0]} b={[0, d.keelDepthM - p.pos[1] + 0.04, -0.14]} radius={0.021} />
      <Block at={[0, d.keelDepthM - p.pos[1] + 0.04, -0.14]} size={[0.1, 0.035, 0.1]} />
    </group>;
  } else if (id.startsWith('battery')) {
    const [w, h, z] = p.size;
    content = <>
      <Block size={p.size} color="#355d62" hot={hot} />
      <Block at={[0, h / 2 - 0.018, 0]} size={[w + 0.01, 0.025, z + 0.01]} color="#172f36" hot={hot} />
      {[-0.3, 0.3].map(x => <Block key={x} at={[w * x, 0, z / 2 + 0.004]} size={[0.025, h, 0.009]} color="#82999c" />)}
      {[-1, 1].map(s => <Block key={s} at={[s * w * 0.32, h / 2 + 0.012, -z * 0.25]} size={[0.045, 0.025, 0.04]} color={s > 0 ? '#b54a39' : '#142327'} />)}
      <Label text={id === 'battery' ? 'LFP / 12 kWh' : 'LFP / 6 kWh'} width={w * 0.72} at={[0, 0, z / 2 + 0.01]} />
      <Label text={id === 'battery' ? 'LFP / 12 kWh' : 'LFP / 6 kWh'} width={w * 0.7} at={[0, h / 2 + 0.002, z * 0.12]} top />
      {[-0.38, 0.38].map(x => <Block key={x} at={[w * x, -h / 2 - 0.008, 0]} size={[0.035, 0.016, z]} color="#889c9f" />)}
    </>;
  } else if (id.startsWith('gpu-')) {
    content = <>
      <Block size={p.size} color="#313c3b" hot={hot} />
      <Block at={[-p.size[0] / 2 - 0.001, 0, 0]} size={[0.002, GPU.heightM, GPU.lengthM]} color="#315e49" />
      <Block at={[0, -GPU.heightM / 2 + 0.005, 0]} size={[0.002, 0.01, 0.09]} color="#bd984f" />
      {Array.from({ length: 10 }, (_, i) => <Block key={i} at={[0, GPU.heightM / 2 + 0.0005, -GPU.lengthM * 0.42 + i * GPU.lengthM * 0.09]} size={[p.size[0] * 0.85, 0.001, 0.002]} color="#98a596" />)}
      <group position={[p.size[0] / 2 + 0.001, 0, 0]} rotation={[0, Math.PI / 2, 0]}><Label text="NVIDIA L4" width={0.13} at={[0, 0, 0]} /></group>
    </>;
  } else if (p.subsystem === 'compute') {
    const [w, h, z] = p.size;
    content = <>
      <Block at={[0, -h / 2 + 0.01, 0]} size={[w, 0.02, z]} color="#9aaeb2" hot={hot} />
      {[-1, 1].map(s => <group key={s}>
        <Block at={[s * (w / 2 - 0.01), 0, 0]} size={[0.02, h, z]} color="#9aaeb2" hot={hot} />
        <Block at={[0, 0, s * (z / 2 - 0.01)]} size={[w - 0.04, h, 0.02]} color="#9aaeb2" hot={hot} />
      </group>)}
      <Block at={[0, h / 2 - 0.008 + (separated ? 0.12 : 0), 0]} size={[w + 0.012, 0.016, z + 0.012]} color="#c0cacc" hot={hot} />
      {separated && <>
        <Block at={[0, 0.005, 0]} size={[w * 0.92, 0.014, z * 0.88]} color="#264d42" />
        <Block at={[w * 0.28, 0.025, 0]} size={[w * 0.22, 0.03, z * 0.6]} color="#9caca7" />
        <Label text="HOST" width={w * 0.22} at={[w * 0.28, 0.042, 0]} top />
      </>}
      {Array.from({ length: 8 }, (_, i) => <Block key={i} at={[-w * 0.42 + i * w * 0.12, 0, -z / 2 - 0.006]} size={[0.012, h * 0.72, 0.02]} color="#546c73" />)}
      <Label text={id === 'compute-pod' ? 'COMPUTE / 2 GPU' : 'COORDINATOR'} at={[0, h / 2 + 0.001 + (separated ? 0.12 : 0), 0]} width={w * 0.9} top />
      <Label text={id === 'compute-pod' ? 'COMPUTE / 2 GPU' : 'COORDINATOR'} at={[0, 0, z / 2 + 0.001]} width={w * 0.9} />
      {[-1, 1].map(s => <group key={s}>
        <Tube a={[s * w * 0.28, -h * 0.23, -z / 2]} b={[s * w * 0.28, -h * 0.23, -z / 2 - 0.05]} radius={0.018} color={s > 0 ? '#437e89' : '#945b45'} />
        <Block at={[s * (w / 2 + 0.025), -h / 2, 0]} size={[0.05, 0.025, z * 0.8]} />
      </group>)}
    </>;
  } else if (id === 'heat-exchanger') {
    content = <>
      <Block size={p.size} color="#718e91" hot={hot} />
      {Array.from({ length: 10 }, (_, i) => <Block key={i} at={[-p.size[0] * 0.45 + i * p.size[0] * 0.1, 0, -p.size[2] / 2 - 0.008]} size={[0.008, p.size[1], 0.016]} color="#b6c3c1" />)}
    </>;
  } else if (id === 'sky-camera') {
    content = <>
      <Block at={[0, -0.04, 0]} size={[0.12, 0.04, 0.12]} color="#c6d1d0" hot={hot} />
      <mesh geometry={dome} material={material('#152b35', hot)} scale={[0.06, 0.06, 0.06]} />
      <Tube a={[0, -0.06, 0]} b={[0, deck - p.pos[1], 0]} radius={0.023} />
    </>;
  } else if (id === 'starlink') {
    content = <>
      <Block size={p.size} color="#eceee8" hot={hot} />
      <Block at={[0, -0.025, 0]} size={[p.size[0] * 0.6, 0.02, p.size[2] * 0.65]} color="#a8b6b6" />
      <Tube a={[0, -0.06, 0]} b={[0, -p.size[1] / 2, 0]} radius={0.04} />
      <Label text="SATELLITE" width={0.25} at={[0, p.size[1] / 2 + 0.001, 0]} top />
    </>;
  } else if (id === 'starlink-mast' || id === 'mesh-radio') {
    const r = id === 'starlink-mast' ? 0.03 : 0.017;
    content = <>
      <Tube a={[0, -p.size[1] / 2, 0]} b={[0, p.size[1] / 2, 0]} radius={r} color="#b4c0c0" />
      <Block at={[0, -p.size[1] / 2 + 0.015, 0]} size={[0.13, 0.03, 0.13]} color="#6c838b" hot={hot} />
      {id === 'starlink-mast' ? [-1, 1].map(s => <Tube key={s} a={[s * 0.2, -p.size[1] / 2, 0]} b={[0, 0, 0]} radius={0.012} />) : <Block at={[0, p.size[1] * 0.18, 0]} size={[0.045, p.size[1] * 0.45, 0.045]} color="#e3e6df" hot={hot} />}
    </>;
  } else if (id.startsWith('gnss')) {
    content = <>
      <mesh geometry={cyl} material={material('#d8e2de', hot)} scale={[p.size[0] / 2, p.size[1], p.size[2] / 2]} />
      <Tube a={[0, -p.size[1] / 2, 0]} b={[0, deck - p.pos[1], 0]} radius={0.012} />
    </>;
  } else {
    content = <>
      <Block size={p.size} color={id === 'ballast' ? '#3d4c52' : COLORS[p.subsystem]} hot={hot} />
      {id !== 'ballast' && <Label text={id === 'mppt-bus' ? 'MPPT / DC' : id.toUpperCase()} width={p.size[0] * 0.88} at={[0, p.size[1] / 2 + 0.001, 0]} top />}
    </>;
  }
  return <group name={id} position={pos} {...handlers}>{content}</group>;
}


function RubRail({ side, hot, ghost }: { side: number; hot: boolean; ghost: boolean }) {
  const geometry = useMemo(() => {
    const shape = roundedOutline(side + .06, .12);
    shape.holes.push(roundedOutline(side - .035, .075));
    return new ExtrudeGeometry(shape,{depth:.10,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:2,curveSegments:8});
  },[side]);
  useEffect(() => () => geometry.dispose(),[geometry]);
  return <group><mesh geometry={geometry} rotation={[-Math.PI/2,0,0]} position={[0,-.05,0]} material={material('#2f4b51',hot,ghost)} />
    {[-1,1].map(s => <Block key={s} at={[s*(side/2+.035),0,0]} size={[.008,.055,.22]} color="#d2bc7f" ghost={ghost} />)}
  </group>;
}

/** Deployed soft righting volume; a mechanical concept, never credited as permanent hull buoyancy. */
export function RightingBag({ design, inflation }: { design: NodeDesign; inflation: number }) {
  const { bagCenter } = recoveryHardware(design);
  const radii = RIGHTING_BAG.radii;
  return <group>
    <group position={bagCenter} scale={Math.max(.001,inflation)}>
      <mesh scale={radii}><sphereGeometry args={[1,32,20]} /><meshStandardMaterial color="#dca35f" roughness={.74} metalness={.02} /></mesh>
      {[0,Math.PI/2].map(a => <mesh key={a} rotation={[0,a,0]} scale={[radii[0]*1.006,radii[1]*1.006,1]}><torusGeometry args={[1,.006,6,48]} /><meshStandardMaterial color="#a87542" roughness={.9} /></mesh>)}
      <mesh rotation={[Math.PI/2,0,0]} scale={[radii[0]*1.006,radii[2]*1.006,1]}><torusGeometry args={[1,.008,6,48]} /><meshStandardMaterial color="#eee1bb" roughness={.85} /></mesh>
    </group>
    <Tube a={[.63,design.keelDepthM+design.hullDepthM,0]} b={[bagCenter[0],bagCenter[1]-radii[1]*inflation,0]} radius={.018} color="#38535a" />
  </group>;
}
