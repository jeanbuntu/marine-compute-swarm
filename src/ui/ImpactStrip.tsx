import { useState } from 'react';
import { useStore } from '../state/store';
import { annualize, useImpact } from '../state/useImpact';
import { compact, money, pctVs, signed } from './format';

const SCALES = [100, 1000, 10000];

/** The headline: what a day of this swarm delivers, and what it would add up to at scale. */
export function ImpactStrip() {
  const config = useStore((s) => s.config);
  const designs = useStore((s) => s.designs);
  const { result, loading } = useImpact(config, designs);
  const [scale, setScale] = useState(1000);

  const s = result?.swarm, h = result?.stayPut;
  const cards = [
    { label: 'Energy harvested', value: s ? `${compact(s.energyKwh)} kWh` : '…', delta: s && h ? pctVs(s.energyKwh, h.energyKwh) : null },
    { label: 'Compute delivered', value: s ? `${compact(s.computeTflopH / 1000)} PFLOP-h` : '…', delta: s && h ? pctVs(s.computeTflopH, h.computeTflopH) : null },
    { label: 'Revenue', value: s ? money(s.revenueUsd) : '…', delta: s && h ? pctVs(s.revenueUsd, h.revenueUsd) : null },
    { label: 'Carbon avoided', value: s ? `${compact(s.co2AvoidedKg)} kg CO₂` : '…', delta: s && h ? pctVs(s.co2AvoidedKg, h.co2AvoidedKg) : null },
  ];
  const year = s ? annualize(s, config.nodes, scale) : null;

  return (
    <section className="panel impact" aria-label="Impact" style={{ opacity: loading ? 0.75 : 1 }}>
      <div className="dim" style={{ marginBottom: 6 }}>
        One daylight day, {config.nodes} nodes <span className="est">EST</span> {loading && <span>· updating…</span>}
      </div>
      <div className="cards">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <div className="dim">{c.label}</div>
            <div className="big">{c.value}</div>
            <div className="dim small">
              {c.delta === null ? ' ' : <>{signed(c.delta)} vs holding station</>}
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <span className="dim">At</span>
        {SCALES.map((n) => (
          <button key={n} className={n === scale ? 'primary' : ''} onClick={() => setScale(n)}>{n.toLocaleString()} nodes</button>
        ))}
        {year && (
          <span>
            ≈ <b>{compact(year.energyKwh / 1e6)} GWh</b> · <b>{money(year.revenueUsd)}</b> · <b>{compact(year.co2AvoidedKg / 1000)} t CO₂</b> avoided per year
            <span className="est">EST</span>
          </span>
        )}
      </div>
      <div className="dim small" style={{ marginTop: 4 }}>Assumes this day repeats all year. Percentages compare with a swarm that only holds station in the same weather.</div>
    </section>
  );
}
