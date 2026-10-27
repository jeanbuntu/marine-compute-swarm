import type { ThreeEvent } from '@react-three/fiber';
import { BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, MeshStandardMaterial, CanvasTexture, DataTexture, RGBAFormat, SRGBColorSpace, LinearFilter, LinearMipmapLinearFilter, Vector3, Quaternion } from 'three';
import type { NodeDesign, Part, Subsystem } from '../model/parts';
import { partPosition, PETAL_TILT_DEG, type PetalState } from '../model/hydrostatics';

type V3 = [number, number, number];
const COLORS: Record<Subsystem, string> = {
  hull: '#d5dfe0', petals: '#101c26', power: '#385e64', compute: '#adb8bb', cooling: '#637f83',
  propulsion: '#26373c', navigation: '#e0e4dc', comms: '#e4e7e2', camera: '#26373c',
};
export const subsystemColor = (s: Subsystem) => COLORS[s];
const box = new BoxGeometry(1, 1, 1);
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
function Block({ at = [0, 0, 0], size, color = '#83969a', hot = false, ghost = false }: { at?: V3; size: V3; color?: string; hot?: boolean; ghost?: boolean }) {
  return <mesh geometry={box} material={material(color, hot, ghost)} position={at} scale={size} />;
}
/** A real length of tube between mounting points, in meters. */
function Tube({ a, b, radius = 0.015, color = '#8e9b9d' }: { a: V3; b: V3; radius?: number; color?: string }) {
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
function SolarPanel({ width, depth, thickness, hot }: { width: number; depth: number; thickness: number; hot: boolean }) {
  return <group>
    <Block size={[width, thickness, depth]} color="#a9b7b9" hot={hot} />
    <mesh position={[0, thickness / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} material={solarMaterial(width, depth, hot)}>
      <planeGeometry args={[Math.max(0.05, width - 0.035), Math.max(0.05, depth - 0.035)]} />
    </mesh>
    {[-0.3, 0.3].map(z => <Block key={z} at={[0, -thickness / 2 - 0.012, depth * z]} size={[width, 0.024, 0.025]} color="#6f858c" />)}
  </group>;
}
/** Watertight shell drawn as walls, so inspection can reveal the equipment inside. */
function Shell({ width, height, hot, ghost, keel = false }: { width: number; height: number; hot: boolean; ghost: boolean; keel?: boolean }) {
  const t = 0.025, c = keel ? '#637d83' : '#d5dfe0';
  return <group>
    {[-1, 1].map(s => <group key={s}>
      <Block at={[s * (width - t) / 2, 0, 0]} size={[t, height, width]} color={c} hot={hot} ghost={ghost} />
      <Block at={[0, 0, s * (width - t) / 2]} size={[width - 2 * t, height, t]} color={c} hot={hot} ghost={ghost} />
      {!keel && <>
        <Block at={[s * width / 2, height / 2 - 0.04, 0]} size={[0.035, 0.07, width + 0.04]} color="#334d54" ghost={ghost} />
        <Block at={[0, height / 2 - 0.04, s * width / 2]} size={[width + 0.04, 0.07, 0.035]} color="#334d54" ghost={ghost} />
        <Block at={[s * (width - 0.12) / 2, -height / 2 + 0.03, 0]} size={[0.12, 0.06, width]} color="#8ca1a6" ghost={ghost} />
      </>}
    </group>)}
    {!keel && <Block at={[0, height / 2 - t / 2, 0]} size={[width, t, width]} color={c} hot={hot} ghost={ghost} />}
    {keel && <Block at={[0, -height / 2 + t / 2, 0]} size={[width, t, width]} color={c} ghost={ghost} />}
  </group>;
}

export interface NodeModelProps {
  design: NodeDesign; petals: PetalState; offsets?: Record<string, V3>;
  highlightId?: string | null; hotAll?: boolean; ghostShell?: boolean;
  onPartOver?(id: string | null): void; onPartClick?(id: string): void;
}

export function NodeModel({ design, petals, offsets = {}, highlightId, hotAll, ghostShell, onPartOver, onPartClick }: NodeModelProps) {
  const separated = Object.keys(offsets).length > 0;
  const battery = design.parts.find(p => p.id === 'battery');
  const bus = design.parts.find(p => p.id === 'mppt-bus');
  const compute = design.parts.find(p => p.id === 'compute-pod');
  const exchanger = design.parts.find(p => p.id === 'heat-exchanger');
  return <group>
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
    {design.parts.map(p => <PartMesh key={p.id} part={p} design={design} petals={petals} offset={offsets[p.id]} hot={!!hotAll || highlightId === p.id} ghost={!!ghostShell && (p.subsystem === 'hull' || p.id === 'deck-pv')} separated={separated} onOver={onPartOver} onClick={onPartClick} />)}
  </group>;
}

function PartMesh({ part: p, design: d, petals, offset = [0, 0, 0], hot, ghost, separated, onOver, onClick }: {
  part: Part; design: NodeDesign; petals: PetalState; offset?: V3; hot: boolean; ghost: boolean; separated: boolean;
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
  } else if (id.startsWith('petal-')) {
    const dx = Math.sign(p.pos[0]), dz = Math.sign(p.pos[2]);
    const angle = petals === 'deployed' ? PETAL_TILT_DEG * Math.PI / 180 : 0;
    const width = dx ? d.petalLengthM : side, depth = dz ? d.petalLengthM : side;
    const rot: V3 = [dz ? -dz * angle : 0, 0, dx ? dx * angle : 0];
    const hinge: V3 = [dx * side / 2, pos[1] - offset[1] - Math.sin(angle) * d.petalLengthM / 2, dz * side / 2];
    const rel = (a: V3): V3 => a.map((v, i) => v - (pos[i] - offset[i])) as V3;
    content = <>
      <group rotation={rot}><SolarPanel width={width} depth={depth} thickness={0.05} hot={hot} /></group>
      {petals === 'deployed' && <>
        {[-0.34, 0.34].map(t => {
          const h: V3 = [hinge[0] + (dz ? t * side : 0), hinge[1], hinge[2] + (dx ? t * side : 0)];
          const root: V3 = [h[0], deck - 0.18, h[2]];
          const tip: V3 = [h[0] + dx * d.petalLengthM * 0.62 * Math.cos(angle), h[1] + d.petalLengthM * 0.62 * Math.sin(angle) - 0.045, h[2] + dz * d.petalLengthM * 0.62 * Math.cos(angle)];
          return <group key={t}>
            <Tube a={rel([h[0], deck - 0.05, h[2]])} b={rel(h)} radius={0.023} />
            <Tube a={rel([h[0] - (dz ? 0.09 : 0), h[1], h[2] - (dx ? 0.09 : 0)])} b={rel([h[0] + (dz ? 0.09 : 0), h[1], h[2] + (dx ? 0.09 : 0)])} radius={0.035} color="#344b52" />
            {!separated && <Tube a={rel(root)} b={rel(tip)} radius={0.019} />}
          </group>;
        })}
        {!separated && <Tube a={rel([hinge[0], deck + 0.015, hinge[2]])} b={rel([hinge[0] + dx * 0.3, hinge[1] + 0.04, hinge[2] + dz * 0.3])} radius={0.011} color="#202d31" />}
      </>}
    </>;
  } else if (id === 'deck-pv') {
    content = <SolarPanel width={side * 0.9} depth={side * 0.9} thickness={p.size[1]} hot={hot} />;
  } else if (id.startsWith('thruster-')) {
    const a = Math.atan2(p.pos[0], p.pos[2]);
    content = <group rotation={[0, a, 0]}>
      <mesh geometry={cyl} material={material('#253c43', hot)} rotation={[Math.PI / 2, 0, 0]} scale={[0.065, 0.25, 0.065]} />
      {[-1, 1].map(s => <mesh key={s} geometry={ring} material={material('#acb9ba', hot)} position={[0, 0, s * 0.14]} scale={[0.08, 0.08, 0.08]} />)}
      <Block at={[0, 0, 0.145]} size={[0.12, 0.018, 0.015]} color="#afb9b6" />
      <Block at={[0, 0, 0.145]} size={[0.018, 0.12, 0.015]} color="#afb9b6" />
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
        {(id === 'compute-pod' ? [-1, 1] : [0]).map(s => <group key={s} position={[s * w * 0.23, 0.04, 0]}>
          <Block size={[w * 0.38, 0.05, z * 0.72]} color="#394b50" />
          <Block at={[0, 0.026, 0]} size={[w * 0.35, 0.008, z * 0.65]} color="#a3b4b6" />
          <Label text={id === 'compute-pod' ? 'GPU' : 'HOST'} width={w * 0.28} at={[0, 0.031, 0]} top />
        </group>)}
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
