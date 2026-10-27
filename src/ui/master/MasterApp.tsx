import { MasterScene } from '../../scene/master/MasterScene';
import { hasWebGL } from '../../scene/webgl';
import { clock } from '../format';
import { msim, useMaster, type ViewMode } from '../../state/master';
import { LeftDrawer } from './LeftDrawer';
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
    <header className="panel mtop">
      <b style={{ fontSize: 16 }}>Master node</b>
      <a className="mlink" href="?" title="Back to the swarm view">← Swarm</a>
      <Seg label="Camera" value={s.view} options={VIEWS} onChange={(v) => s.set({ view: v })} />
      <button onClick={() => s.set({ paused: !s.paused })}>{s.paused ? 'Play' : 'Pause'}</button>
      <span className="dim small">sun {t.sun.azDeg.toFixed(0)}° az · {t.sun.elevDeg.toFixed(0)}° el · {clock(t.tSky)} · Hs {msim.sea.hsM.toFixed(1)} m</span>
    </header>
  );
}

export function MasterApp() {
  const webgl = hasWebGL();
  const tab = useMaster((s) => s.tab), set = useMaster((s) => s.set);
  const analysis = useSkyAnalysis();
  return (
    <div className="mroot">
      {webgl ? <MasterScene /> : <p style={{ color: '#cfe6ff', padding: '200px 24px 24px' }}>The 3D view needs WebGL, which this browser does not provide.</p>}
      <TopBar />
      <LeftDrawer />
      <SkyOverlay />
      <aside className="panel mright" aria-label="Analysis">
        <Seg label="Analysis" value={tab} options={[{ v: 'petals', label: 'Petals' }, { v: 'propulsion', label: 'Propulsion' }, { v: 'sky', label: 'Sky camera' }]} onChange={(v) => set({ tab: v })} />
        {tab === 'petals' && <PetalsTab />}
        {tab === 'propulsion' && <PropulsionTab />}
        {tab === 'sky' && <SkyTab onReset={analysis.reset} />}
      </aside>
    </div>
  );
}
