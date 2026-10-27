import { msim } from '../../state/master';
import { thrustPowerW } from '../../model/swarm';
import { MAX_THRUST_N, jetSpeedMs, thrustersFromDesign } from '../../model/master/thrust';
import { LineChart, Stat, fmtW, useTick } from './controls';

const VEC = [
  { key: 'current', label: 'Current drag on hull', color: '#6fb8ff' },
  { key: 'wind', label: 'Wind on freeboard + petals', color: '#b8c7d9' },
  { key: 'drift', label: 'Wave drift (mean)', color: '#4fd1c5' },
] as const;

/** Plan view: x east, z south, so up on screen is north. */
function VectorPlot({ vectors, scale }: { vectors: { label: string; color: string; v: [number, number] }[]; scale: number }) {
  const C = 90;
  return (
    <svg width={180} height={180} role="img" aria-label="Force vectors, plan view" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
      <circle cx={C} cy={C} r={70} fill="none" stroke="rgba(255,255,255,0.12)" />
      <text x={C - 3} y={12} fontSize={10} fill="#9db4d3">N</text><text x={C - 3} y={178} fontSize={10} fill="#9db4d3">S</text>
      <text x={168} y={C + 3} fontSize={10} fill="#9db4d3">E</text><text x={4} y={C + 3} fontSize={10} fill="#9db4d3">W</text>
      <rect x={C - 8} y={C - 8} width={16} height={16} fill="rgba(255,255,255,0.2)" />
      {vectors.map((a) => {
        const x = C + a.v[0] * scale, y = C + a.v[1] * scale;
        return <g key={a.label}><line x1={C} y1={C} x2={x} y2={y} stroke={a.color} strokeWidth={2.2} /><circle cx={x} cy={y} r={3.2} fill={a.color} /></g>;
      })}
    </svg>
  );
}

export function PropulsionTab() {
  useTick();
  const t = msim.telemetry, p = t.prop, params = msim.params, h = msim.history.slice(-300);
  const th = thrustersFromDesign(msim.design, params.layout);
  const solarW = t.pv.actualW;
  const maxVec = Math.max(5, ...VEC.map((v) => Math.hypot(...p.env[v.key])), Math.hypot(...p.force));
  const curSpeed = Math.hypot(params.currentEastMs, params.currentNorthMs);
  const swarmModelW = thrustPowerW(curSpeed);
  return (
    <div className="mtab">
      <div className="mcards">
        <Stat label="Thrust power" value={fmtW(p.powerW)} sub={solarW > 0 ? `${((p.powerW / solarW) * 100).toFixed(0)}% of PV right now` : 'no PV'} tone={p.powerW > solarW * 0.5 ? 'warn' : undefined} />
        <Stat label="Thrust force" value={`${p.thrustN.toFixed(1)} N`} sub={`of ${(MAX_THRUST_N * 2).toFixed(0)} N along a diagonal`} tone={p.saturated ? 'bad' : undefined} />
        <Stat label="Position error" value={`${p.posErrM.toFixed(1)} m`} sub={`speed ${p.speedMs.toFixed(2)} m/s`} />
        <Stat label="Energy per hour" value={`${(p.powerW).toFixed(0)} Wh`} sub="at the current draw" />
      </div>
      {p.saturated && <div className="banner small">Thrusters are at their limit; the node cannot hold this condition.</div>}

      <h3>Forces on the hull (plan view, north up)</h3>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <VectorPlot scale={70 / maxVec} vectors={[
          ...VEC.map((v) => ({ label: v.label, color: v.color, v: p.env[v.key] as [number, number] })),
          { label: 'Thrust (on hull)', color: '#3df08a', v: p.force },
        ]} />
        <div className="small" style={{ flex: 1 }}>
          {VEC.map((v) => <div key={v.key}><span style={{ color: v.color }}>●</span> {v.label}: <b>{Math.hypot(...p.env[v.key]).toFixed(1)} N</b></div>)}
          <div><span style={{ color: '#3df08a' }}>●</span> Thrust: <b>{p.thrustN.toFixed(1)} N</b></div>
          <div className="dim" style={{ marginTop: 6 }}>Station keeping must make thrust equal and opposite to the first three.</div>
        </div>
      </div>

      <h3>Thrusters</h3>
      <table className="mtable">
        <thead><tr><th></th><th>Axis</th><th>Command</th><th>Water jet</th><th></th></tr></thead>
        <tbody>
          {th.map((x, i) => {
            const u = p.u[i] ?? 0;
            return (
              <tr key={x.id}>
                <td><b>T{i + 1}</b></td>
                <td className="dim">{Math.round((Math.atan2(x.ax, -x.az) * 180) / Math.PI)}°</td>
                <td>{u.toFixed(1)} N</td>
                <td>{Math.abs(u) > 0.4 ? `${jetSpeedMs(u).toFixed(2)} m/s` : '—'}</td>
                <td style={{ width: 90 }}><div className="track bi"><div style={{ left: u >= 0 ? '50%' : `${50 - (Math.abs(u) / MAX_THRUST_N) * 50}%`, width: `${(Math.abs(u) / MAX_THRUST_N) * 50}%`, background: Math.abs(u) > MAX_THRUST_N * 0.9 ? '#ff6b6b' : '#3df08a' }} /></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="dim small">Rated {MAX_THRUST_N.toFixed(0)} N each (bollard, 300 W). Green arrows on the hull show the force; particles show the water leaving in the opposite direction.</div>

      <h3>Yaw</h3>
      <div className="small">
        {p.yawAuthority
          ? <>This layout can make yaw torque.{params.yawAssist && p.yawTargetDeg !== null && <> Best heading {p.yawTargetDeg.toFixed(0)}° would add <b>{p.yawBestGainPct.toFixed(1)}%</b> PV.</>}</>
          : <><b style={{ color: 'var(--bad)' }}>No yaw authority.</b> The as-built thrusters point along the corner diagonals, so their forces pass through the centre and cannot turn the hull. Try the tangential layout in Propulsion to see what turning toward the sun is worth.</>}
      </div>

      <h3>Against the swarm model</h3>
      <div className="small dim">
        Holding against the {curSpeed.toFixed(2)} m/s current alone, the swarm's cubic-speed formula charges {fmtW(swarmModelW)}.
        This view includes wind, wave drift and the low efficiency of small ducted thrusters at low speed, which the swarm model does not.
      </div>

      <h3>Last 30 s</h3>
      <LineChart unit=" W" min={0} series={[{ label: 'thrust power', color: '#3df08a', data: h.map((s) => s.thrustW) }, { label: 'PV', color: '#ffc247', dash: true, data: h.map((s) => s.pvW) }]} />
      <LineChart height={64} unit=" N" min={0} series={[{ label: 'thrust force', color: '#6fb8ff', data: h.map((s) => s.thrustN) }]} />
    </div>
  );
}
