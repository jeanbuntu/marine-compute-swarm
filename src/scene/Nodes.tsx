import { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Group, Sprite, Vector3 } from 'three';
import { Line } from '@react-three/drei';
import { partPosition } from '../model/hydrostatics';
import { useStore } from '../state/store';
import { sim } from '../state/sim';
import { evaluate } from '../model/hydrostatics';
import { DimensionGuide } from './DimensionGuide';
import { NodeModel } from './NodeModel';
import { explodeOffsets, EXPLODE_FACTOR } from './explode';

import { swarmIntro, SWARM_INTRO_DETAIL_M, SWARM_INTRO_NODES } from './swarmIntro';
import { DETAIL_DIST_M, showDetail } from './lod';

export const EXPLODED_LIFT_M = 1.8; // exploded nodes float above the water so no part is hidden by it
const _v = new Vector3();

/** Node ids are `n<i>`; hover ids are `<nodeId>` or `<nodeId>/<partId>`. */
export function Nodes({forceDetail=false}:{forceDetail?:boolean}) {
  const config=useStore(s=>s.config),count=config.nodes;
  const {size}=useThree();
  const intro=swarmIntro(size.width/size.height,config.spacingM,count);
  const markerStartDistance=Math.hypot(...intro.position.map((v,i)=>v-intro.target[i]))*1.25;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SwarmNode key={i} index={i} forceDetail={forceDetail} markerStartDistance={markerStartDistance} />
      ))}
    </>
  );
}

function SwarmNode({ index, forceDetail, markerStartDistance }: { index: number; forceDetail:boolean; markerStartDistance:number }) {
  const id = `n${index}`;
  const role = index === 0 ? 'master' : 'worker';
  const design = useStore((s) => s.designs[role]);
  const hovered = useStore((s) => s.hoveredId);
  const exploded = useStore((s) => s.explodedNodeId === id);
  const dimensions = useStore(s => s.inspectionDimensions);
  const inspectionExploded = useStore((s) => s.inspectionExploded);
  const separated = exploded && inspectionExploded;
  const selected = useStore((s) => s.selectedNodeId === id);
  const selectedPart = useStore((s) => s.selectedPartId);
  const { hover, explode, selectPart } = useStore.getState();
  const root = useRef<Group>(null);
  const [near, setNear] = useState(forceDetail);
  const marker = useRef<Sprite>(null);
  const { camera, controls } = useThree();
  const draft = useMemo(() => evaluate(design, 'deployed').draftM, [design]);
  const offsets = useMemo(() => (separated ? explodeOffsets(design.parts, EXPLODE_FACTOR) : {}), [separated, design]);

  const hoverPart = hovered?.startsWith(`${id}/`) ? hovered.slice(id.length + 1) : null;
  const hoverNode = hovered === id || hoverPart !== null;
  const petalHover = !!hoverPart && hoverPart.startsWith('petal-');

  useFrame(({ clock }) => {
    const n = sim.swarm.nodes[index];
    if (!root.current || !n) return;
    const t = clock.elapsedTime;
    // Gentle swell motion: bob and small roll/pitch, offset per node.
    const ph = index * 1.7;
    root.current.position.set(n.pos[0], Math.sin(t * 0.9 + ph) * 0.04, -n.pos[1]);
    root.current.rotation.set(Math.sin(t * 0.7 + ph) * 0.02, 0, Math.cos(t * 0.8 + ph) * 0.02);
    const dist = camera.position.distanceTo(_v.set(n.pos[0], 0, -n.pos[1]));
    const detailLimit = index < SWARM_INTRO_NODES ? SWARM_INTRO_DETAIL_M : DETAIL_DIST_M;
    const want = forceDetail || showDetail(dist * DETAIL_DIST_M / detailLimit, exploded, near);
    if (want !== near) setNear(want);
    if (marker.current) {
      const target=(controls as OrbitControlsImpl|null)?.target;
      const overview=target?camera.position.distanceTo(target)>markerStartDistance:false;
      marker.current.visible = !forceDetail && overview && dist > detailLimit && !exploded;
    }
  });

  return (
    <group ref={root} name={id}>
      {(near || exploded) && (
      <group position={[0, separated ? EXPLODED_LIFT_M : -draft, 0]}>
        {separated && selectedPart && (() => {
          const p = design.parts.find(p => p.id === selectedPart);
          if (!p) return null;
          const start = partPosition(design, p, 'deployed');
          const end = start.map((v, i) => v + (offsets[p.id]?.[i] ?? 0)) as [number, number, number];
          return <Line points={[start, end]} color="#d6e7e8" lineWidth={1} dashed dashSize={0.08} gapSize={0.05} transparent opacity={0.65} />;
        })()}
        {exploded && <group position={[0, separated ? -0.6 : draft + 0.04, 2.5]}>
          <Line points={[[-0.5, 0, 0], [0.5, 0, 0]]} color="#edf5ed" lineWidth={2} />
          {[-0.5, 0, 0.5].map(x => <Line key={x} points={[[x, 0, -0.06], [x, 0, 0.06]]} color="#edf5ed" lineWidth={2} />)}
        </group>}
        {exploded && dimensions && <DimensionGuide design={design} partId={selectedPart ?? 'hull-shell'} offsets={offsets} />}
        <NodeModel
          design={design}
          petals={sim.sky.sun(sim.timeS).ghiWm2 > 0 ? 'deployed' : 'stowed'}
          offsets={offsets}
          highlightId={exploded ? (hoverPart ?? selectedPart) : petalHover ? hoverPart : null}
          hotAll={hoverNode && !petalHover && !exploded}
          ghostShell={separated}
          onPartOver={(p) => hover(p ? `${id}/${p}` : null)}
          onPartClick={(p) => (exploded ? selectPart(p) : explode(id))}
        />
      </group>
      )}
      <sprite
        ref={marker} scale={[0.018, 0.018, 1]}
        onPointerOver={(e) => { e.stopPropagation(); hover(id); }}
        onPointerOut={() => hover(null)}
        onClick={(e) => { e.stopPropagation(); explode(id); }}
      >
        <spriteMaterial color={selected ? '#ffffff' : role === 'master' ? '#ffc247' : '#4fd1c5'} sizeAttenuation={false} depthTest={false} transparent opacity={hoverNode ? 1 : 0.85} />
      </sprite>
    </group>
  );
}
