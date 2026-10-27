import { msim, useMaster } from '../../state/master';
import { SEA_PRESETS, type SeaPreset } from '../../model/master/waves';
import type { MasterParams } from '../../model/master/masterSim';
import { Check, Section, Seg, Slider, useTick } from './controls';

interface Scenario { name: string; hint: string; patch(p: MasterParams): Partial<MasterParams> }
const manual = (p: MasterParams, az: number, el: number) => ({ ...p.sun, mode: 'manual' as const, azDeg: az, elevDeg: el });
const SCENARIOS: Scenario[] = [
  { name: 'Dawn, calm', hint: 'Sun low in the east: west petal rises, east petal lowers', patch: (p) => ({ sun: manual(p, 95, 12), sea: { ...p.sea, ...SEA_PRESETS.calm }, windMs: 3 }) },
  { name: 'Morning swell', hint: 'Long swell rolls the hull while petals chase the sun', patch: (p) => ({ sun: manual(p, 120, 35), sea: { ...p.sea, ...SEA_PRESETS.swell }, windMs: 6 }) },
  { name: 'Noon overhead', hint: 'Sun near the zenith: petals go nearly flat', patch: (p) => ({ sun: manual(p, 180, 78), sea: { ...p.sea, ...SEA_PRESETS.swell }, windMs: 5 }) },
  { name: 'Afternoon chop', hint: 'Short steep seas demand the fastest petal motion', patch: (p) => ({ sun: manual(p, 255, 22), sea: { ...p.sea, ...SEA_PRESETS.chop }, windMs: 9 }) },
  { name: 'Storm', hint: 'Heavy seas and wind above the 12 m/s stow limit', patch: (p) => ({ sun: manual(p, 200, 40), sea: { ...p.sea, ...SEA_PRESETS.storm }, windMs: 18 }) },
  { name: 'Day sweep', hint: 'The real sun crosses the sky at 600×', patch: (p) => ({ sun: { ...p.sun, mode: 'clock' }, skySpeed: 600, sea: { ...p.sea, ...SEA_PRESETS.swell } }) },
];

export function LeftDrawer() {
  useTick(500);
  const s = useMaster(), p = s.params;
  const hour = ((msim.tSky / 3600) % 24 + 24) % 24;
  return (
    <aside className="panel mleft" aria-label="Conditions">
      <Section title="Scenarios">
        <div className="mscen">
          {SCENARIOS.map((sc) => <button key={sc.name} title={sc.hint} onClick={() => { s.setParams(sc.patch(msim.params)); }}>{sc.name}</button>)}
        </div>
        <button onClick={() => { msim.resetMotion(); s.setParams({}); }}>Reset position and hull</button>
      </Section>

      <Section title="Sun">
        <Seg label="Sun source" value={p.sun.mode} options={[{ v: 'manual', label: 'Pin the sun' }, { v: 'clock', label: 'Time of day' }]} onChange={(v) => s.patchSun({ mode: v })} />
        {p.sun.mode === 'manual' ? <>
          <Slider label="Azimuth" value={p.sun.azDeg} min={0} max={360} step={1} unit="°" onChange={(v) => s.patchSun({ azDeg: v })} />
          <Slider label="Elevation" value={p.sun.elevDeg} min={-5} max={90} step={1} unit="°" onChange={(v) => s.patchSun({ elevDeg: v })} />
          <div className="dim small">0° north, 90° east, 180° south, 270° west.</div>
        </> : <>
          <Slider label="Local solar hour" value={hour} min={0} max={24} step={0.1} digits={1} unit=" h" onChange={(v) => { msim.tSky = v * 3600; s.setParams({}); }} />
          <Slider label="Latitude" value={p.sun.latDeg} min={-70} max={70} step={1} unit="°" onChange={(v) => s.patchSun({ latDeg: v })} />
          <Slider label="Day of year" value={p.sun.doy} min={1} max={365} step={1} onChange={(v) => s.patchSun({ doy: v })} />
        </>}
        <Seg label="Sky clock speed" value={p.skySpeed} options={[1, 60, 600, 3000].map((v) => ({ v, label: `${v}×` }))} onChange={(v) => s.setParams({ skySpeed: v })} />
      </Section>

      <Section title="Clouds">
        <Slider label="Coverage" value={p.sky.coverage * 100} min={0} max={100} step={5} unit="%" onChange={(v) => s.patchSky({ coverage: v / 100 })} />
        <Slider label="Cloud wind east" value={p.sky.windEastMs} min={-20} max={20} step={1} unit=" m/s" onChange={(v) => s.patchSky({ windEastMs: v })} />
        <Slider label="Cloud wind north" value={p.sky.windNorthMs} min={-20} max={20} step={1} unit=" m/s" onChange={(v) => s.patchSky({ windNorthMs: v })} />
        <Slider label="Cloud pattern (seed)" value={p.sky.seed} min={1} max={60} step={1} onChange={(v) => s.patchSky({ seed: v })} />
      </Section>

      <Section title="Sea">
        <Seg label="Sea state" value={'' as SeaPreset} options={(['calm', 'swell', 'chop', 'storm'] as SeaPreset[]).map((v) => ({ v, label: v }))} onChange={(v) => s.patchSea({ ...SEA_PRESETS[v] })} />
        <Slider label="Wave height (Hs)" value={p.sea.hsM} min={0} max={6} step={0.05} digits={2} unit=" m" onChange={(v) => s.patchSea({ hsM: v })} />
        <Slider label="Wave period" value={p.sea.tpS} min={3} max={16} step={0.5} digits={1} unit=" s" onChange={(v) => s.patchSea({ tpS: v })} />
        <Slider label="Travelling toward" value={p.sea.headingDeg} min={0} max={360} step={5} unit="°" onChange={(v) => s.patchSea({ headingDeg: v })} />
        <Slider label="Directional spread" value={p.sea.spreadDeg} min={0} max={80} step={5} unit="°" onChange={(v) => s.patchSea({ spreadDeg: v })} />
        <Slider label="Wave pattern (seed)" value={p.sea.seed} min={1} max={60} step={1} onChange={(v) => s.patchSea({ seed: v })} />
      </Section>

      <Section title="Wind and current" open={false}>
        <Slider label="Wind speed" value={p.windMs} min={0} max={25} step={0.5} digits={1} unit=" m/s" onChange={(v) => s.setParams({ windMs: v })} />
        <Slider label="Wind from" value={p.windFromDeg} min={0} max={360} step={5} unit="°" onChange={(v) => s.setParams({ windFromDeg: v })} />
        <Slider label="Current east" value={p.currentEastMs} min={-1} max={1} step={0.05} digits={2} unit=" m/s" onChange={(v) => s.setParams({ currentEastMs: v })} />
        <Slider label="Current north" value={p.currentNorthMs} min={-1} max={1} step={0.05} digits={2} unit=" m/s" onChange={(v) => s.setParams({ currentNorthMs: v })} />
        <div className="dim small">Wind above 12 m/s stows the petals.</div>
      </Section>

      <Section title="Petal controller">
        <Seg label="Strategy" value={p.strategy} options={[{ v: 'track', label: 'Track sun' }, { v: 'fixed', label: 'Fixed 20°' }, { v: 'flat', label: 'Flat' }]} onChange={(v) => s.setParams({ strategy: v })} />
        <Slider label="Actuator speed" value={p.actuator.rateDegS} min={1} max={40} step={1} unit="°/s" onChange={(v) => s.patchActuator({ rateDegS: v })} />
        <Slider label="Lowest mechanical angle" value={p.actuator.mechMinDeg} min={-60} max={0} step={5} unit="°" onChange={(v) => s.patchActuator({ mechMinDeg: v })} />
        <Slider label="Highest mechanical angle" value={p.actuator.mechMaxDeg} min={30} max={90} step={5} unit="°" onChange={(v) => s.patchActuator({ mechMaxDeg: v })} />
        <Slider label="Sensing delay" value={p.actuator.latencyS} min={0} max={2} step={0.1} digits={1} unit=" s" onChange={(v) => s.patchActuator({ latencyS: v })} />
        <Slider label="Tilt sensor noise" value={p.actuator.imuNoiseDeg} min={0} max={3} step={0.1} digits={1} unit="°" onChange={(v) => s.patchActuator({ imuNoiseDeg: v })} />
      </Section>

      <Section title="Propulsion">
        <Seg label="Thruster layout" value={p.layout} options={[{ v: 'radial', label: 'As built (diagonal)', title: 'No yaw torque' }, { v: 'tangential', label: 'Tangential', title: 'Can turn the hull' }]} onChange={(v) => s.setParams({ layout: v })} />
        <Seg label="Maneuver" value={p.maneuver} options={[{ v: 'hold', label: 'Hold station' }, { v: 'dodge', label: 'Move (dodge)' }]} onChange={(v) => s.setParams({ maneuver: v })} />
        {p.maneuver === 'dodge' && <>
          <Slider label="Heading" value={p.dodgeHeadingDeg} min={0} max={360} step={5} unit="°" onChange={(v) => s.setParams({ dodgeHeadingDeg: v })} />
          <Slider label="Speed" value={p.dodgeSpeedMs} min={0.05} max={1} step={0.05} digits={2} unit=" m/s" onChange={(v) => s.setParams({ dodgeSpeedMs: v })} />
        </>}
        <Check label="Yaw toward the best sun heading" value={p.yawAssist} onChange={(v) => s.setParams({ yawAssist: v })} />
        <Slider label="Hull heading" value={(p.headingDeg + 360) % 360} min={0} max={359} step={1} unit="°" onChange={(v) => s.setParams({ headingDeg: v })} />
      </Section>

      <Section title="Display" open={false}>
        <Check label="See through the water near the node" value={s.cutaway} onChange={(v) => s.set({ cutaway: v })} />
        <Check label="Flow particles and thrust arrows" value={s.particles} onChange={(v) => s.set({ particles: v })} />
        <Check label="Petal normals and sun ray" value={s.normals} onChange={(v) => s.set({ normals: v })} />
        <Check label="Picture-in-picture" value={s.pip} onChange={(v) => s.set({ pip: v })} />
        <Seg label="Physics speed" value={p.physSpeed} options={[0.25, 0.5, 1, 2].map((v) => ({ v, label: `${v}×` }))} onChange={(v) => s.setParams({ physSpeed: v })} />
      </Section>
    </aside>
  );
}
