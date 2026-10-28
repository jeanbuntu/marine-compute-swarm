import { useStore } from '../state/store';
import { clock } from './format';

const SPEEDS = [1, 2, 5, 60, 120, 600, 1800];

export function HeroPanel() {
  const timeS = useStore((s) => s.timeS);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const drawerOpen = useStore((s) => s.drawerOpen);
  const { setPlaying, setSpeed, setDrawer } = useStore.getState();
  return (
    <header className="panel topbar">
      <h1>Solar Swarm</h1>
      <div className="dim">Data centers that follow the sun.</div>
      <div className="row">
        <button onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : 'Play'}</button>
        <select aria-label="Speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ background: 'rgba(255,255,255,0.08)', color: 'inherit', border: '1px solid var(--line)', borderRadius: 6, padding: 5 }}>
          {SPEEDS.map((v) => <option key={v} value={v} style={{ color: '#000' }}>{v}×</option>)}
        </select>
        <b>{clock(timeS)}</b>
        <button onClick={() => setDrawer(!drawerOpen)} aria-expanded={drawerOpen}>Controls</button>
      </div>
      <div className="small"><a href="?view=unit&role=master" style={{ color: 'var(--accent)' }}>Unit bench · Master / Worker →</a></div>
      <div className="small"><a href="?view=weather" style={{ color: 'var(--accent)' }}>Weather simulator →</a></div>
      <div className="dim small">Drag to orbit · Shift + drag to pan · Scroll to zoom</div>
    </header>
  );
}
