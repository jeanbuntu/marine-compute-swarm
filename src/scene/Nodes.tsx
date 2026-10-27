import { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Sprite, Vector3 } from 'three';
import { useStore } from '../state/store';
import { sim } from '../state/sim';
import { evaluate } from '../model/hydrostatics';
import { NodeModel } from './NodeModel';
import { explodeOffsets, EXPLODE_FACTOR } from './explode';

import { DETAIL_DIST_M, showDetail } from './lod';

const MARKER_MIN_DIST_M = DETAIL_DIST_M;
export const EXPLODED_LIFT_M = 1.8; // exploded nodes float above the water so no part is hidden by it
const _v = new Vector3();

/** Node ids are `n<i>`; hover ids are `<nodeId>` or `<nodeId>/<partId>`. */
export function Nodes() {
  const count = useStore((s) => s.config.nodes);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SwarmNode key={i} index={i} />
      ))}
    </>
  );
}

function SwarmNode({ index }: { index: number }) {
  const id = `n${index}`;
  const role = index === 0 ? 'master' : 'worker';
  const design = useStore((s) => s.designs[role]);
  const hovered = useStore((s) => s.hoveredId);
  const exploded = useStore((s) => s.explodedNodeId === id);
  const selected = useStore((s) => s.selectedNodeId === id);
  const selectedPart = useStore((s) => s.selectedPartId);
  const { hover, explode, selectPart } = useStore.getState();
  const root = useRef<Group>(null);
  const [near, setNear] = useState(false);
  const marker = useRef<Sprite>(null);
  const { camera } = useThree();
  const draft = useMemo(() => evaluate(design, 'deployed').draftM, [design]);
  const offsets = useMemo(() => (exploded ? explodeOffsets(design.parts, EXPLODE_FACTOR) : {}), [exploded, design]);

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
    const want = showDetail(dist, exploded, near);
    if (want !== near) setNear(want);
    if (marker.current) marker.current.visible = dist > MARKER_MIN_DIST_M && !exploded;
  });

  return (
    <group ref={root} name={id}>
      {(near || exploded) && (
      <group position={[0, exploded ? EXPLODED_LIFT_M : -draft, 0]}>
        <NodeModel
          design={design}
          petals={sim.sky.sun(sim.timeS).ghiWm2 > 0 ? 'deployed' : 'stowed'}
          offsets={offsets}
          highlightId={exploded ? (hoverPart ?? selectedPart) : petalHover ? hoverPart : null}
          hotAll={hoverNode && !petalHover && !exploded}
          ghostShell={exploded}
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
