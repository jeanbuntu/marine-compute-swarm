import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { CylinderGeometry, BoxGeometry, SphereGeometry, TorusGeometry, MeshStandardMaterial } from 'three';
import type { NodeDesign, Part, Subsystem } from '../model/parts';
import { partPosition, PETAL_TILT_DEG, type PetalState } from '../model/hydrostatics';

const COLORS: Record<Subsystem, string> = {
  hull: '#e8eef2', petals: '#2f5fd0', power: '#f2b134', compute: '#5b6cff', cooling: '#2bb3a6',
  propulsion: '#4a5560', navigation: '#e0556b', comms: '#b06cf0', camera: '#222a30',
};
export const subsystemColor = (s: Subsystem) => COLORS[s];

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 16);
const sph = new SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const ring = new TorusGeometry(1, 0.12, 8, 20);
const mats = new Map<string, MeshStandardMaterial>();
function material(color: string, opts: { hot?: boolean; ghost?: boolean }) {
  const key = `${color}|${opts.hot}|${opts.ghost}`;
  let m = mats.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color, roughness: 0.55, metalness: 0.15,
      emissive: opts.hot ? '#ffd24a' : '#000000', emissiveIntensity: opts.hot ? 0.55 : 0,
      transparent: !!opts.ghost, opacity: opts.ghost ? 0.22 : 1, depthWrite: !opts.ghost,
    });
    mats.set(key, m);
  }
  return m;
}

export interface NodeModelProps {
  design: NodeDesign;
  petals: PetalState;
  offsets?: Record<string, [number, number, number]>;
  highlightId?: string | null;
  hotAll?: boolean;
  ghostShell?: boolean;
  onPartOver?(id: string | null): void;
  onPartClick?(id: string): void;
}

/** Node geometry in node coordinates: origin at the keel bottom center, y up. */
export function NodeModel({ design, petals, offsets = {}, highlightId, hotAll, ghostShell, onPartOver, onPartClick }: NodeModelProps) {
  const petalIdx = useMemo(() => design.parts.filter((p) => p.id.startsWith('petal-')).map((p) => p.id), [design]);
  return (
    <group>
      {design.parts.map((p) => (
        <PartMesh
          key={p.id} part={p} design={design} petals={petals} stackIdx={petalIdx.indexOf(p.id)}
          offset={offsets[p.id]} hot={!!hotAll || highlightId === p.id} ghost={!!ghostShell && p.subsystem === 'hull'}
          onOver={onPartOver} onClick={onPartClick}
        />
      ))}
    </group>
  );
}

interface PartMeshProps {
  part: Part; design: NodeDesign; petals: PetalState; stackIdx: number;
  offset?: [number, number, number]; hot: boolean; ghost: boolean;
  onOver?(id: string | null): void; onClick?(id: string): void;
}

function PartMesh({ part, design, petals, stackIdx, offset, hot, ghost, onOver, onClick }: PartMeshProps) {
  const [x, y, z] = partPosition(design, part, petals);
  const yy = petals === 'stowed' && stackIdx >= 0 ? y + stackIdx * 0.05 : y;
  const pos: [number, number, number] = [x + (offset?.[0] ?? 0), yy + (offset?.[1] ?? 0), z + (offset?.[2] ?? 0)];
  const mat = material(COLORS[part.subsystem], { hot, ghost });
  const handlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onOver?.(part.id); },
    onPointerOut: () => onOver?.(null),
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick?.(part.id); },
  };
  const side = design.hullSideM;
  const id = part.id;

  if (id === 'hull-shell') {
    return <mesh geometry={box} material={mat} position={[0, design.keelDepthM + design.hullDepthM / 2 + (offset?.[1] ?? 0), 0]} scale={[side, design.hullDepthM, side]} {...handlers} />;
  }
  if (id === 'keel-pod') {
    return <mesh geometry={box} material={mat} position={[0, design.keelDepthM / 2 + (offset?.[1] ?? 0), 0]} scale={[side * 0.6, design.keelDepthM, side * 0.6]} {...handlers} />;
  }
  if (id.startsWith('petal-')) {
    const dx = Math.sign(part.pos[0]), dz = Math.sign(part.pos[2]);
    const tilt = petals === 'deployed' ? (PETAL_TILT_DEG * Math.PI) / 180 : 0;
    const len = design.petalLengthM;
    const rot: [number, number, number] = [dz !== 0 ? -dz * tilt : 0, 0, dx !== 0 ? dx * tilt : 0];
    return (
      <mesh geometry={box} material={mat} position={pos} rotation={rot} scale={[dx !== 0 ? len : side, 0.05, dz !== 0 ? len : side]} {...handlers} />
    );
  }
  if (id.startsWith('thruster-')) {
    const ang = Math.atan2(part.pos[0], part.pos[2]);
    return (
      <group position={pos} rotation={[0, ang, 0]} {...handlers}>
        <mesh geometry={cyl} material={mat} rotation={[Math.PI / 2, 0, 0]} scale={[0.06, 0.3, 0.06]} />
        <mesh geometry={ring} material={mat} position={[0, 0, 0.16]} scale={[0.1, 0.1, 0.1]} />
      </group>
    );
  }
  if (id === 'sky-camera') return <mesh geometry={sph} material={mat} position={pos} scale={[0.07, 0.07, 0.07]} {...handlers} />;
  if (id === 'starlink') return <mesh geometry={box} material={mat} position={pos} scale={part.size} {...handlers} />;
  if (id === 'starlink-mast' || id === 'mesh-radio') return <mesh geometry={cyl} material={mat} position={pos} scale={[0.03, part.size[1], 0.03]} {...handlers} />;
  if (id.startsWith('gnss')) return <mesh geometry={cyl} material={mat} position={pos} scale={[0.05, 0.04, 0.05]} {...handlers} />;
  if (id === 'ballast') return <mesh geometry={box} material={mat} position={pos} scale={part.size} {...handlers} />;
  if (id === 'deck-pv') return <mesh geometry={box} material={material(COLORS.petals, { hot, ghost: false })} position={pos} scale={part.size} {...handlers} />;
  return <mesh geometry={box} material={mat} position={pos} scale={part.size} {...handlers} />;
}
