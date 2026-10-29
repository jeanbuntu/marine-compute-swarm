import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export const PLAYBACK_SPEEDS = [1, 2, 5, 10, 20, 60, 120, 600, 1800, 3600];
/** Every simulator uses the same ordered controls, anchored immediately below navigation. */
export function SimulationToolbar({ playing, speed, time, onPlaying, onSpeed, children, speeds = PLAYBACK_SPEEDS }: {
  playing: boolean; speed: number; time: string; onPlaying(value: boolean): void; onSpeed(value: number): void; children?: ReactNode; speeds?: number[];
}) {
  const controlsId = useId(), root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  useEffect(()=>{
    if(!optionsOpen)return;
    const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOptionsOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOptionsOpen(false);toggle.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[optionsOpen]);
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    let frames = 0, start = performance.now(), id = 0;
    const sample = (now: number) => {
      frames++;
      if (now - start >= 1000) { setFps(Math.round(frames * 1000 / (now - start))); frames = 0; start = now; }
      id = requestAnimationFrame(sample);
    };
    id = requestAnimationFrame(sample); return () => cancelAnimationFrame(id);
  }, []);
  return <div ref={root} className="simulation-toolbar" role="region" aria-label="Simulation controls">
    <div className="playback-controls">
      <button className="playback-toggle" onClick={() => onPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Ⅱ Pause' : '▶ Play'}</button>
      <label className="toolbar-field">Speed<select aria-label="Speed" value={speed} onChange={e => onSpeed(Number(e.target.value))}>{speeds.map(v => <option key={v} value={v}>{v}×</option>)}</select></label>
      <span className="toolbar-clock" aria-label="Simulation time">{time}</span>
      <span className="toolbar-fps" title="Browser display refresh rate, independent of simulation speed">{fps ?? '—'} fps</span>
    </div>
    <button ref={toggle} aria-controls={controlsId} className="module-toggle" aria-expanded={optionsOpen} onClick={()=>setOptionsOpen(!optionsOpen)}>View options <span>Conditions, selection & tools {optionsOpen ? "−" : "+"}</span></button>
    <div id={controlsId} className={`module-controls ${optionsOpen ? "is-open" : ""}`}>{children}</div>
  </div>;
}
