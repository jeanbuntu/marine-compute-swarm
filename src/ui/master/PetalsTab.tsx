import { msim } from '../../state/master';
import { PETAL_IDS } from '../../model/master/solar';
import { PETAL_COLORS, LineChart, Stat, deg, fmtW, useTick } from './controls';

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

export function PetalsTab() {
  useTick();
  const t = msim.telemetry, h = msim.history.slice(-300);
  const gain = t.pv.fixedW > 0 ? (t.pv.actualW / t.pv.fixedW - 1) * 100 : 0;
  const capture = t.pv.idealW > 0 ? (t.pv.actualW / t.pv.idealW) * 100 : 0;
  const rate = msim.params.actuator.rateDegS;
  const behind = t.demandDegS > rate;
  const bars: { label: string; w: number; color: string; note?: string }[] = [
    { label: 'Ideal (every petal on the sun)', w: t.pv.idealW, color: '#8aa4c8' },
    { label: 'Petals, as controlled', w: t.pv.actualW, color: '#ffc247' },
    { label: 'Fixed 20° (as built)', w: t.pv.fixedW, color: '#4fd1c5' },
    { label: 'Flat (0°)', w: t.pv.flatW, color: '#6f8794' },
    { label: 'Swarm model assumption', w: t.pv.swarmModelW, color: '#b58cff', note: 'area × GHI, no angles' },
  ];
  const top = Math.max(1, ...bars.map((b) => b.w));
  return (
    <div className="mtab">
      <div className="mcards">
        <Stat label="Tracking gain vs fixed 20°" value={pct(gain)} tone={gain > 0 ? 'ok' : 'warn'} sub={fmtW(t.pv.actualW - t.pv.fixedW)} />
        <Stat label="Capture of ideal" value={`${capture.toFixed(0)}%`} sub={`${fmtW(t.pv.actualW)} of ${fmtW(t.pv.idealW)}`} />
        <Stat label="Beam / diffuse" value={`${t.irr.directWm2.toFixed(0)} / ${t.irr.diffuseWm2.toFixed(0)}`} sub={`W/m² · cloud factor ${t.shade.toFixed(2)}`} />
        <Stat label="Petal rate needed" value={`${t.demandDegS.toFixed(1)}°/s`} tone={behind ? 'bad' : 'ok'} sub={`actuator limit ${rate}°/s${behind ? ' — falling behind' : ''}`} />
      </div>

      <h3>Eight petals · four paired drives</h3><p className="dim small">E/SE · S/SW · W/NW · N/NE share their tilt. Geared linkage concept; four loaded drives, with no counterbalance credit.</p>
      <table className="mtable">
        <thead><tr><th></th><th>Tilt</th><th>Wanted</th><th>Ideal</th><th>cos θ</th><th>W/m²</th></tr></thead>
        <tbody>
          {PETAL_IDS.map((id) => (
            <tr key={id}>
              <td style={{ color: PETAL_COLORS[id] }}><b>{id}</b></td>
              <td>{t.tilts[id].toFixed(1)}°</td><td>{t.targets[id].toFixed(1)}°</td><td className="dim">{t.ideal[id].toFixed(1)}°</td>
              <td>{t.cosInc[id].toFixed(2)}</td><td>{t.petalWm2[id].toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dim small" style={{ marginTop: 4 }}>
        Allowed tilt {t.limits.minDeg.toFixed(0)}° to {t.limits.maxDeg.toFixed(0)}° (tip clearance in this sea, actuator stops)
        {t.collisionLimited && <p role="status" style={{ color: 'var(--accent)' }}>Panel clearance interlock: linked drives stopped before contact. Tracking output uses the actual angles.</p>}
        {t.stowed && <b style={{ color: 'var(--bad)' }}> · STOWED: wind above 12 m/s</b>}
      </div>

      <div className="mcards"><Stat label="Actuator demand (EST)" value={fmtW(t.actuatorW)} sub="Gravity load at commanded speed, 55% drive efficiency plus controller overhead. Wave/wind torque not included." /></div>
      <h3>Power from the same sun</h3>
      {bars.map((b) => (
        <div key={b.label} className="mbar2" title={b.note}>
          <span className="small">{b.label}</span>
          <div className="track"><div style={{ width: `${(b.w / top) * 100}%`, background: b.color }} /></div>
          <b className="small">{fmtW(b.w)}</b>
        </div>
      ))}
      <div className="dim small">Deck PV alone: {fmtW(t.pv.deckW)}. Petal power uses beam + sky + sea-reflected light on each tilted face (EST decomposition). Shading between petals and the mast is not modelled.</div>

      <h3>Hull and heel</h3>
      <div className="mcards">
        <Stat label="Roll / pitch now" value={`${deg(t.att.roll).toFixed(1)}° / ${deg(t.att.pitch).toFixed(1)}°`} sub={`heave ${t.heaveM.toFixed(2)} m`} />
        <Stat label="Static heel from petals" value={`${deg(Math.hypot(t.heel.roll, t.heel.pitch)).toFixed(1)}°`} sub={`GM ${t.heel.gmEff.toFixed(2)} m`} tone={deg(Math.hypot(t.heel.roll, t.heel.pitch)) > 8 ? 'bad' : undefined} />
      </div>

      <h3>Petal tilt · last 30 s</h3>
      <LineChart unit="°" series={[
        ...PETAL_IDS.map((id, i) => ({ label: `${id} actual`, color: PETAL_COLORS[id], data: h.map((s) => s.tilt[i]) })),
        { label: 'W ideal', color: PETAL_COLORS.W, dash: true, data: h.map((s) => s.ideal[PETAL_IDS.indexOf('W')]) },
      ]} />
      <h3>Hull motion · last 30 s</h3>
      <LineChart unit="°" series={[
        { label: 'roll', color: '#ffc247', data: h.map((s) => deg(s.roll)) },
        { label: 'pitch', color: '#4fd1c5', data: h.map((s) => deg(s.pitch)) },
      ]} />
      <LineChart height={64} unit=" m" series={[
        { label: 'wave elevation', color: '#6fb8ff', data: h.map((s) => s.eta) },
        { label: 'hull heave', color: '#ff7a90', data: h.map((s) => s.heave) },
      ]} />
      <h3>PV power · last 30 s</h3>
      <LineChart unit=" W" min={0} series={[
        { label: 'controlled', color: '#ffc247', data: h.map((s) => s.pvW) },
        { label: 'fixed 20°', color: '#4fd1c5', data: h.map((s) => s.pvFixedW) },
        { label: 'ideal', color: '#8aa4c8', dash: true, data: h.map((s) => s.pvIdealW) },
      ]} />
    </div>
  );
}
