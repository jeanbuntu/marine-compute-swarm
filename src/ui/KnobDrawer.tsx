import { useStore } from '../state/store';
import { CONFIG_KNOBS, DESIGN_KNOBS, GROUPS, type ConfigKnob, type DesignKnob } from './knobDefs';
import { knobValue } from '../model/solver';
import { OutcomeBanner } from './OutcomeBanner';

/** Every knob, hidden until asked for. Hardware knobs edit the worker design through the stability gate. */
export function KnobDrawer() {
  const open = useStore((s) => s.drawerOpen);
  const config = useStore((s) => s.config);
  const worker = useStore((s) => s.designs.worker);
  const selected = useStore((s) => s.selectedNodeId);
  if (!open) return null;
  const { setConfig, applyDesignEdit } = useStore.getState();

  const row = (k: ConfigKnob | DesignKnob, value: number, onChange: (v: number) => void) => (
    <div className="knob" key={k.key}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <label htmlFor={`knob-${k.key}`}>{k.label}{k.est && <span className="est">EST</span>}</label>
        <span className="dim">{Number(value.toFixed(3))} {k.unit}</span>
      </div>
      <input id={`knob-${k.key}`} type="range" aria-label={k.label} min={k.min} max={k.max} step={k.step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="dim small">{k.note}</div>
    </div>
  );

  return (
    <aside className="panel drawer" style={selected ? { maxHeight: 'calc(100% - 144px - 400px)' } : undefined}>
      <OutcomeBanner />
      {GROUPS.map((g) => (
        <section key={g}>
          <h3 role="heading" aria-level={3}>{g}</h3>
          {g === 'Hardware' && <div className="dim small">Worker node. Changes that break hydrodynamic stability are blocked.</div>}
          {CONFIG_KNOBS.filter((k) => k.group === g).map((k) => row(k, config[k.key] as number, (v) => setConfig({ [k.key]: v })))}
          {DESIGN_KNOBS.filter((k) => k.group === g).map((k) => row(k, knobValue(worker, k.key), (v) => applyDesignEdit('worker', { knob: k.key, value: v })))}
        </section>
      ))}
    </aside>
  );
}
