import { partEnvelope } from '../model/nodeDesign';
import { useMemo } from 'react';
import { useStore } from '../state/store';
import { evaluate, evaluateWorst } from '../model/hydrostatics';
import type { Subsystem } from '../model/parts';
import { editingRole } from '../state/editor';
import { OutcomeBanner } from './OutcomeBanner';
import { PartEditor } from './PartEditor';

const ORDER: Subsystem[] = ['hull', 'power', 'compute', 'cooling', 'propulsion', 'navigation', 'comms', 'camera', 'petals'];
const f = (n: number, d = 2) => Number(n.toFixed(d)).toString();

export function ExplodedPanel() {
  const nodeId = useStore((s) => s.explodedNodeId);
  const inspectionExploded = useStore((s) => s.inspectionExploded);
  const designs = useStore((s) => s.designs);
  const selectedPartId = useStore((s) => s.selectedPartId);
  const { explode, selectPart } = useStore.getState();

  const role = nodeId ? editingRole() : 'worker';
  const design = designs[role];
  const worst = useMemo(() => evaluateWorst(design), [design]);
  const deployed = useMemo(() => evaluate(design, 'deployed'), [design]);
  const groups = useMemo(() => ORDER.map((s) => [s, design.parts.filter((p) => p.subsystem === s)] as const).filter(([, p]) => p.length), [design]);
  if (!nodeId) return null;
  const part = design.parts.find((p) => p.id === selectedPartId) ?? null;

  return (
    <aside className="panel exploded">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>{role === 'master' ? 'Master node' : 'Worker node'} <span className="dim">{nodeId}</span></h2>
        <button onClick={() => explode(null)}>Close</button>
      </div>
      <p className="dim" style={{ margin: '0 0 8px' }}>
        {role === 'master' ? 'Carries the swarm’s only Starlink terminal and the coordinator.' : 'Compute worker; links to the master over the mesh radio.'}
      </p>

      <div className="row" style={{ marginBottom: 8 }}>
        <button aria-pressed={!inspectionExploded} className={!inspectionExploded ? 'primary' : ''} onClick={() => useStore.getState().setInspectionExploded(false)}>Assembled</button>
        <button aria-pressed={inspectionExploded} className={inspectionExploded ? 'primary' : ''} onClick={() => useStore.getState().setInspectionExploded(true)}>Exploded</button>
      </div>
      <p className="dim small">1 scene unit = 1 m · white scale bar = 1 m<br />Hull {f(design.hullSideM)} × {f(design.hullSideM)} × {f(design.hullDepthM)} m · keel {f(design.keelDepthM)} m deep<br />Deployed span {f(design.hullSideM + 2 * design.petalLengthM * Math.cos(20 * Math.PI / 180))} m · hardware dimensions EST</p>
      <span className={`pill ${worst.ok ? 'ok' : 'bad'}`}>{worst.ok ? 'Floats and stays upright' : `Unstable: ${worst.violations.join(', ')}`}</span>
      <div className="grid2" style={{ marginTop: 8 }}>
        <span>Mass <b>{f(worst.massKg, 0)} kg</b></span>
        <span>Draft <b>{f(deployed.draftM)} m</b></span>
        <span>Freeboard <b>{f(worst.freeboardM)} m</b></span>
        <span>Reserve <b>{f(worst.reservePct * 100, 0)}%</b></span>
        <span>GM <b>{f(worst.gmM)} m</b></span>
        <span>Heel <b>{f(worst.heelDeg, 1)}°</b></span>
      </div>

      <OutcomeBanner />

      {part && (
        <>
          <h3>{part.name}</h3>
          <p style={{ margin: '0 0 8px' }}>{part.rationale}</p>
          <p className="dim small">Envelope: {partEnvelope(design, part).map(v => `${Math.round(v * 1000)} mm`).join(" × ")} · EST</p>
          <PartEditor key={`${part.id}-${part.massKg}-${part.pos[1]}`} part={part} />
        </>
      )}

      {groups.map(([sub, parts]) => (
        <div key={sub}>
          <h3>{sub}</h3>
          {parts.map((p) => (
            <div key={p.id} className={`partrow ${p.id === selectedPartId ? 'sel' : ''}`} onClick={() => selectPart(p.id)}>
              <span>{p.name}</span><span className="dim">{f(p.massKg, 1)} kg</span>
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}
