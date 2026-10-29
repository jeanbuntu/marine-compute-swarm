import { useStore } from '../state/store';
import { clock } from './format';
import { SimulationToolbar } from './SimulationToolbar';
export function HeroPanel() {
  const s = useStore();
  return <SimulationToolbar playing={s.playing} speed={s.speed} time={clock(s.timeS)} onPlaying={s.setPlaying} onSpeed={s.setSpeed}>
    <label className="toolbar-field">Selection<select aria-label="Selected node" value={s.selectedNodeId??''} onChange={e=>s.select(e.target.value||null)}><option value="">Fleet overview</option>{Array.from({length:s.config.nodes},(_,i)=><option key={i} value={`n${i}`}>{i===0?'Master':`Worker ${i}`}</option>)}</select></label>
    <button onClick={() => s.setDrawer(!s.drawerOpen)} aria-expanded={s.drawerOpen}>Controls</button>
    <span className="toolbar-help">Select a node to inspect · drag to orbit</span>
  </SimulationToolbar>;
}
