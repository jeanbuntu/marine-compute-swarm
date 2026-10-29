import { SiteHeader } from '../SiteHeader';
import { useStore } from '../../state/store';
import { Dimensions } from '../Dimensions';
import { MasterScene } from '../../scene/master/MasterScene';
import { hasWebGL } from '../../scene/webgl';
import { clock } from '../format';
import { msim, useMaster, type ViewMode } from '../../state/master';
import { SimulationToolbar } from '../SimulationToolbar';
import { LeftDrawer, ScenarioSelect } from './LeftDrawer';
import { PetalsTab } from './PetalsTab';
import { PropulsionTab } from './PropulsionTab';
import { SkyOverlay } from './SkyOverlay';
import { SkyTab } from './SkyTab';
import { Seg, useTick } from './controls';
import { useSkyAnalysis } from './useSkyAnalysis';
import './master.css';

const VIEWS: { v: ViewMode; label: string }[] = [{ v: 'close', label: 'Close-up' }, { v: 'under', label: 'Underwater' }, { v: 'top', label: 'Top-down' }, { v: 'sky', label: 'Sky camera' }];

function TopBar() {
  useTick(500);
  const s = useMaster(), t = msim.telemetry;
  return (
    <SimulationToolbar speeds={[1,2,5]} playing={!s.paused} speed={s.speed} time={clock(t.tSky)} onPlaying={playing => s.set({ paused: !playing })} onSpeed={speed => s.set({ speed })}>
      <Seg label="Unit type" value={s.role} options={[{ v: 'master', label: 'Master' }, { v: 'worker', label: 'Worker' }]} onChange={s.setRole} />
      <label className="toolbar-field">Camera views<select aria-label="Camera views" value={s.view} onChange={e => s.set({ view: e.target.value as ViewMode })}>{VIEWS.map(v => <option key={v.v} value={v.v}>{v.label}</option>)}</select></label>
      <ScenarioSelect />
      <button aria-expanded={s.controlsOpen} onClick={() => s.set({ controlsOpen: !s.controlsOpen, analysisOpen: false })}>Adjust conditions</button>
      <button aria-pressed={s.analysisOpen && !s.dimensions} onClick={() => s.set({ analysisOpen: !s.analysisOpen || s.dimensions, dimensions: false, controlsOpen: false })}>Analysis</button>
      <button aria-pressed={s.dimensions} onClick={() => s.set({ dimensions: !s.dimensions, analysisOpen: !s.dimensions, controlsOpen: false })}>Dimensions</button>
      <button aria-pressed={s.exploded} onClick={() => s.set({ exploded: !s.exploded, paused: true, view: s.view === 'sky' ? 'close' : s.view })}>{s.exploded ? 'Assemble' : 'Explode'}</button>
    </SimulationToolbar>
  );
}

export function MasterApp() {
  const webgl = hasWebGL();
  const controlsOpen = useMaster(s => s.controlsOpen), analysisOpen = useMaster(s => s.analysisOpen);
  const dimensions = useMaster(s => s.dimensions), selected = useMaster(s => s.selectedPart), role = useMaster(s => s.role);
  const design = useStore(s => s.designs[role]);
  const tab = useMaster((s) => s.tab), set = useMaster((s) => s.set);
  const analysis = useSkyAnalysis();
  return (
    <div className="mroot">
      <SiteHeader page="unit" />
      {webgl ? <MasterScene key={role} /> : <p style={{ color: '#cfe6ff', padding: '200px 24px 24px' }}>The 3D view needs WebGL, which this browser does not provide.</p>}
      <TopBar />
      {controlsOpen && <LeftDrawer />}
      <SkyOverlay />
      {analysisOpen && <aside className="panel mright" aria-label="Analysis"><button onClick={()=>set({analysisOpen:false,dimensions:false})}>Close panel</button>
        {dimensions ? <Dimensions design={design} selected={selected} onSelect={id => set({ selectedPart: id })} onFocus={() => set({ focusRequest: useMaster.getState().focusRequest + 1, paused: true, exploded: true, view: 'close' })} /> : <>
        <Seg label="Analysis" value={tab} options={[{ v: 'petals', label: 'Petals' }, { v: 'propulsion', label: 'Propulsion' }, { v: 'sky', label: 'Sky camera' }]} onChange={(v) => set({ tab: v })} />
        {tab === 'petals' && <PetalsTab />}
        {tab === 'propulsion' && <PropulsionTab />}
        {tab === 'sky' && <SkyTab onReset={analysis.reset} />}
        </>}
      </aside>}
    </div>
  );
}
