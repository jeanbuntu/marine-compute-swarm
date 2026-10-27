import { useMemo } from 'react';
import { useStore } from '../state/store';
import { evaluate, evaluateWorst } from '../model/hydrostatics';
import type { Subsystem } from '../model/parts';
import type { Edit } from '../model/solver';
import { acceptRecommendation, editingRole } from '../state/editor';
import { PartEditor } from './PartEditor';

const ORDER: Subsystem[] = ['hull', 'power', 'compute', 'cooling', 'propulsion', 'navigation', 'comms', 'camera', 'petals'];
const editLabel = (e: Edit) => ('knob' in e ? e.knob : `${e.partId} ${e.field}`);
const f = (n: number, d = 2) => Number(n.toFixed(d)).toString();

export function ExplodedPanel() {
  const nodeId = useStore((s) => s.explodedNodeId);
  const designs = useStore((s) => s.designs);
  const selectedPartId = useStore((s) => s.selectedPartId);
  const outcome = useStore((s) => s.lastOutcome);
  const { explode, selectPart, dismissOutcome } = useStore.getState();

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

      <span className={`pill ${worst.ok ? 'ok' : 'bad'}`}>{worst.ok ? 'Floats and stays upright' : `Unstable: ${worst.violations.join(', ')}`}</span>
      <div className="grid2" style={{ marginTop: 8 }}>
        <span>Mass <b>{f(worst.massKg, 0)} kg</b></span>
        <span>Draft <b>{f(deployed.draftM)} m</b></span>
        <span>Freeboard <b>{f(worst.freeboardM)} m</b></span>
        <span>Reserve <b>{f(worst.reservePct * 100, 0)}%</b></span>
        <span>GM <b>{f(worst.gmM)} m</b></span>
        <span>Heel <b>{f(worst.heelDeg, 1)}°</b></span>
      </div>

      {outcome && outcome.outcome.status !== 'ok' && (
        <div className="banner" role="alert">
          <b>{outcome.outcome.message}</b>
          {outcome.outcome.status === 'recommend' && (
            <>
              <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                {outcome.outcome.changes.map((c, i) => <li key={i}>{editLabel(c)} → {f(c.value)}</li>)}
              </ul>
              <div className="row">
                <button className="primary" onClick={acceptRecommendation}>Apply all</button>
                <button onClick={dismissOutcome}>Dismiss</button>
              </div>
            </>
          )}
          {outcome.outcome.status === 'infeasible' && <div className="row" style={{ marginTop: 6 }}><button onClick={dismissOutcome}>Dismiss</button></div>}
        </div>
      )}

      {part && (
        <>
          <h3>{part.name}</h3>
          <p style={{ margin: '0 0 8px' }}>{part.rationale}</p>
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
