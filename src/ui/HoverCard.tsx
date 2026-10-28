import { partEnvelope } from '../model/nodeDesign';
import { useStore } from '../state/store';

/** Tooltip card for whatever the pointer is over: a node, or one of its parts. */
export function HoverCard() {
  const hovered = useStore((s) => s.hoveredId);
  const designs = useStore((s) => s.designs);
  if (!hovered) return null;
  const [nodeId, partId] = hovered.split('/');
  const role = nodeId === 'n0' ? 'master' : 'worker';
  const part = partId ? designs[role].parts.find((p) => p.id === partId) : null;
  const exploded = useStore.getState().explodedNodeId === nodeId;
  return (
    <div className="panel" style={{ left: '50%', transform: 'translateX(-50%)', bottom: 16, maxWidth: 360, pointerEvents: 'none' }}>
      {part ? (
        <>
          <b>{part.name}</b>
          <div className="dim">{part.subsystem} · {Number(part.massKg.toFixed(2))} kg · {part.powerW} W</div>
          <div className="dim small">{partEnvelope(designs[role], part).map(v => `${Math.round(v * 1000)} mm`).join(" × ")} · EST</div>
          <div>{part.rationale}</div>
        </>
      ) : (
        <>
          <b>{role === 'master' ? 'Master node' : 'Worker node'} {nodeId}</b>
          {!exploded && <div className="dim">Click to open the exploded view</div>}
        </>
      )}
    </div>
  );
}
