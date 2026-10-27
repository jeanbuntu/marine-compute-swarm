import { useState } from 'react';
import type { Part } from '../model/parts';
import { submitEdit } from '../state/editor';

/** Edits one part's mass and height. Unstable values are blocked by the store and explained in the panel. */
export function PartEditor({ part }: { part: Part }) {
  const [mass, setMass] = useState(String(part.massKg));
  const [height, setHeight] = useState(String(Number(part.pos[1].toFixed(3))));

  const apply = () => {
    if (Number(mass) !== part.massKg) submitEdit({ partId: part.id, field: 'massKg', value: Number(mass) });
    if (Number(height) !== Number(part.pos[1].toFixed(3))) submitEdit({ partId: part.id, field: 'posY', value: Number(height) });
  };

  return (
    <div>
      <div className="grid2">
        <label>
          <span className="dim">Mass (kg)</span>
          <input aria-label="Mass (kg)" value={mass} onChange={(e) => setMass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} />
        </label>
        <label>
          <span className="dim">Height above keel (m)</span>
          <input aria-label="Height above keel (m)" value={height} onChange={(e) => setHeight(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" onClick={apply}>Apply</button>
        <span className="dim">{part.powerW} W · ${part.costUsd.toLocaleString()}{part.est && <span className="est">EST</span>}</span>
      </div>
    </div>
  );
}
