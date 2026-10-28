import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { Group, Vector3 } from 'three';
import type { NodeDesign } from '../model/parts';
import { partEnvelope } from '../model/nodeDesign';
import { partPosition } from '../model/hydrostatics';
import { petalGeometry, PETAL_DIRS, type PetalId } from '../model/hardware';
import { layoutRects, msim, useMaster } from '../state/master';

export function DimensionGuide({ design, partId, offsets = {}, live = false, unit = false }: { design: NodeDesign; partId: string; offsets?: Record<string, [number, number, number]>; live?: boolean; unit?: boolean }) {
  const root = useRef<Group>(null), p = design.parts.find(p => p.id === partId);
  useFrame(() => {
    if (!root.current || !p) return;
    const pos = partPosition(design, p, 'deployed'), off = offsets[p.id] ?? [0, 0, 0];
    if (p.id === 'hull-shell') pos[1] = design.keelDepthM + design.hullDepthM / 2;
    let yaw = 0, tilt = 0;
    if (p.id.startsWith('petal-')) {
      const id = p.id.slice(6) as PetalId, dir = PETAL_DIRS[id], pg = petalGeometry(design);
      tilt = (live ? msim.tilts[id] : 20) * Math.PI / 180;
      const reach = design.hullSideM / 2 + pg.length / 2 * Math.cos(tilt);
      pos[0] = dir[0] * reach; pos[2] = dir[2] * reach; pos[1] = design.keelDepthM + design.hullDepthM + 0.08 + pg.length / 2 * Math.sin(tilt);
      yaw = -Math.atan2(dir[2], dir[0]) + Math.PI / 2;
    }
    root.current.position.set(pos[0] + off[0], pos[1] + off[1], pos[2] + off[2]);
    // Box is in the panel's local width/thickness/length frame.
    root.current.rotation.set(0, yaw, 0); if (p.id.startsWith('petal-')) root.current.rotateX(-tilt);
  });
  if (!p) return null;
  const [w, h, d] = partEnvelope(design, p);
  return <group ref={root}>
    <Line points={[[-w/2,h/2+0.04,-d/2],[w/2,h/2+0.04,-d/2],[w/2,h/2+0.04,d/2],[-w/2,h/2+0.04,d/2],[-w/2,h/2+0.04,-d/2]]} color="#fff1ad" lineWidth={1.5} />
    <Line points={[[w/2+0.04,-h/2,d/2],[w/2+0.04,h/2,d/2]]} color="#fff1ad" lineWidth={1.5} />
    <Html calculatePosition={unit ? (el, camera, size) => {
      const ui = useMaster.getState(), rect = layoutRects(size.width, size.height, ui.view, ui.pip).scene;
      const projected = el.getWorldPosition(new Vector3()).project(camera);
      return rect && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 ? [rect.x + (projected.x + 1) / 2 * rect.w, rect.y + (1 - projected.y) / 2 * rect.h] : [-10000, -10000];
    } : undefined} position={[0,h/2+0.18,d/2+0.08]} center style={{ pointerEvents: 'none', whiteSpace: 'nowrap', background: '#102028ed', border: '1px solid #cfbc80', borderRadius: 6, padding: '6px 10px', color: '#fff1ad', fontSize: 12 }}>
      {p.name}<br />{[w,h,d].map(v => `${(v*1000).toFixed(v<0.2?2:0)} mm`).join(' × ')}
    </Html>
  </group>;
}
