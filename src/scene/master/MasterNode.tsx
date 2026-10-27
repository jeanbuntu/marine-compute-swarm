import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, Quaternion, Vector3, Line as ThreeLine, BufferGeometry, LineBasicMaterial } from 'three';
import { NodeModel, Block, SolarPanel } from '../NodeModel';
import { msim, useMaster } from '../../state/master';
import { PETAL_DIRS, PETAL_IDS, petalNormalBody, type PetalId } from '../../model/master/solar';
import { thrustersFromDesign } from '../../model/master/thrust';
import { evaluate } from '../../model/hydrostatics';

const RAD = Math.PI / 180;
const _a = new Vector3(), _b = new Vector3(), _q = new Quaternion(), _up = new Vector3(0, 1, 0);

/** Where the sky camera sits, in the node's waterline frame (the node group's pivot). */
export function skyCameraLocal(): [number, number, number] {
  const c = msim.design.parts.find((p) => p.id === 'sky-camera')!, d = msim.hullP.draftM;
  return [c.pos[0], c.pos[1] - d, c.pos[2]];
}

/**
 * The master node, pivoting about its waterline. Hull attitude, heave and every petal angle are written
 * straight from the simulation each frame, so nothing re-renders when they change.
 */
export function MasterNode() {
  const outer = useRef<Group>(null);
  const design = msim.design;
  const draft = useMemo(() => evaluate(design, 'deployed').draftM, [design]);

  useFrame(() => {
    const o = outer.current;
    if (!o) return;
    const a = msim.telemetry.att;
    o.position.set(msim.pos[0], msim.telemetry.heaveM, msim.pos[1]);
    o.rotation.set(a.pitch, a.yaw, a.roll, 'YXZ');
  });

  return (
    <group ref={outer}>
      <group position={[0, -draft, 0]}>
        <NodeModel design={design} petals="deployed" hidePetals />
        {PETAL_IDS.map((id) => <LivePetal key={id} id={id} />)}
        <ThrusterGlyphs />
      </group>
      <SunRay />
    </group>
  );
}

function LivePetal({ id }: { id: PetalId }) {
  const d = msim.design, side = d.hullSideM, L = d.petalLengthM, deck = d.keelDepthM + d.hullDepthM + 0.08;
  const dir = PETAL_DIRS[id], dx = dir[0], dz = dir[2];
  const hinge = useRef<Group>(null), rod = useRef<Mesh>(null);
  const line = useMemo(() => new ThreeLine(new BufferGeometry().setFromPoints([new Vector3(), new Vector3(0, 0.7, 0)]), new LineBasicMaterial({ color: '#ffd24a' })), []);
  const width = dx ? L : side, depth = dz ? L : side;

  useFrame(() => {
    const g = hinge.current;
    if (!g) return;
    const t = msim.tilts[id] * RAD, c = Math.cos(t), s = Math.sin(t);
    g.rotation.set(dz ? -dz * t : 0, 0, dx ? dx * t : 0);
    // actuator rod: from a fixed anchor in the hull to the underside of the petal, so its length follows the tilt
    const reach = side / 2 + 0.62 * L * c + 0.045 * s;
    _a.set(dx * (side / 2 - 0.28), deck - 0.1, dz * (side / 2 - 0.28));
    _b.set(dx * reach, deck + 0.62 * L * s - 0.045 * c, dz * reach);
    const m = rod.current;
    if (m) {
      _b.sub(_a);
      m.position.copy(_a).addScaledVector(_b, 0.5);
      m.quaternion.copy(_q.setFromUnitVectors(_up, _b.clone().normalize()));
      m.scale.set(0.011, _b.length(), 0.011);
    }
    const n = petalNormalBody(dir, t);
    line.visible = useMaster.getState().normals;
    line.quaternion.copy(_q.setFromUnitVectors(_up, new Vector3(n[0], n[1], n[2])));
    line.position.set(dx * (side / 2 + (L / 2) * c), deck + (L / 2) * s + 0.03, dz * (side / 2 + (L / 2) * c));
  });

  return (
    <>
      <group ref={hinge} position={[dx * side / 2, deck, dz * side / 2]}>
        <group position={[dx * L / 2, 0, dz * L / 2]}>
          <SolarPanel width={width} depth={depth} thickness={0.05} hot={false} />
        </group>
        <Block at={[0, -0.01, 0]} size={[dz ? side : 0.07, 0.07, dx ? side : 0.07]} color="#344b52" />
      </group>
      <mesh ref={rod}><cylinderGeometry args={[1, 1, 1, 8]} /><meshStandardMaterial color="#8e9b9d" metalness={0.4} roughness={0.5} /></mesh>
      <primitive object={line} />
    </>
  );
}

/** Thrust arrows at each thruster (force on the hull, green) so the direction of propulsion reads at a glance. */
function ThrusterGlyphs() {
  const th = useMemo(() => thrustersFromDesign(msim.design, msim.params.layout), []);
  const refs = useRef<(Mesh | null)[]>([]);
  useFrame(() => {
    const layout = msim.params.layout;
    const live = thrustersFromDesign(msim.design, layout);
    live.forEach((t, i) => {
      const m = refs.current[i];
      if (!m) return;
      const u = msim.u[i] ?? 0, len = Math.abs(u) / 40;
      m.visible = len > 0.03 && useMaster.getState().particles;
      _a.set(t.ax * Math.sign(u), 0, t.az * Math.sign(u));
      m.quaternion.copy(_q.setFromUnitVectors(_up, _a.lengthSq() ? _a.normalize() : _up));
      m.position.set(t.x + _a.x * len / 2, 0.23, t.z + _a.z * len / 2);
      m.scale.set(0.02, len, 0.02);
    });
  });
  return <>{th.map((t, i) => (
    <mesh key={t.id} ref={(m) => { refs.current[i] = m; }}>
      <cylinderGeometry args={[1, 1, 1, 8]} /><meshBasicMaterial color="#3df08a" depthTest={false} transparent opacity={0.9} />
    </mesh>
  ))}</>;
}

/** A line from the deck toward the sun, so the petal normals can be judged against it. */
function SunRay() {
  const geo = useMemo(() => new BufferGeometry().setFromPoints([new Vector3(0, 1.3, 0), new Vector3(0, 1.3, 0)]), []);
  const line = useMemo(() => new ThreeLine(geo, new LineBasicMaterial({ color: '#fff4b0', transparent: true, opacity: 0.8 })), [geo]);
  useFrame(() => {
    line.visible = useMaster.getState().normals && msim.telemetry.sun.elevDeg > 0;
    const s = msim.telemetry.sun, el = s.elevDeg * RAD, az = s.azDeg * RAD;
    const dir = _a.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    if (line.parent) dir.applyQuaternion(_q.copy(line.parent.quaternion).invert()); // draw in world space inside the rotating node
    const p = geo.attributes.position;
    p.setXYZ(1, dir.x * 3, 1.3 + dir.y * 3, dir.z * 3); p.needsUpdate = true;
  });
  return <primitive object={line} />;
}
