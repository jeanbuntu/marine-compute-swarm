import { useEffect, useRef, useState } from 'react';
import { SiteHeader, SITE_PAGES } from './SiteHeader';
import './home.css';

const introductions: Record<string, string> = {
  swarm: 'Watch a fleet turn sunlight into compute. Follow cloud tracking, energy use and the estimated value of a daylight day.',
  unit: 'Meet the hardware. Switch between master and worker nodes, move the camera and explore solar tracking, propulsion and component dimensions.',
  weather: 'Test weather, low batteries and recovery on one fleet. Open the optional Muse coordinator to inspect model inputs, decisions and execution.',
};
const nodes = [[110,112],[150,88],[190,112],[230,88],[270,112],[130,155],[170,155],[210,155],[250,155],[150,195],[190,195],[230,195]];
function Node({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}><path d="M-19 -8L-8 -19H8L19 -8V8L8 19H-8L-19 8Z" fill="#172b42" stroke="#a0b3c4" /><path d="M-15 0H15M0 -15V15M-11 -11L11 11M11 -11L-11 11" stroke="#667f99" strokeWidth=".7" /><rect x="-6" y="-6" width="12" height="12" rx="2" fill="#ffc247" /></g>;
}
function Preview({ kind }: { kind: string }) {
  return <svg viewBox="0 0 380 250" className={`preview-scene preview-${kind}`} role="img" aria-label={`${SITE_PAGES.find(p => p.id === kind)?.name} animated illustration`}>
    <defs><pattern id={`grid-${kind}`} width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#9db4d3" strokeOpacity=".1" /></pattern><radialGradient id={`sea-${kind}`}><stop stopColor="#19354b" /><stop offset="1" stopColor="#091322" /></radialGradient></defs>
    <rect width="380" height="250" fill={`url(#sea-${kind})`} /><rect width="380" height="250" fill={`url(#grid-${kind})`} />
    <g className="preview-fleet">{nodes.map(([x,y],i) => <g key={i}>{i > 0 && <line x1="190" y1="155" x2={x} y2={y} stroke="#9db4d3" strokeOpacity=".2" />}<Node x={x} y={y} scale={.55} /></g>)}</g>
    {kind === 'weather' ? <><circle className="preview-pulse" cx="190" cy="155" r="65" fill="none" stroke="#ffc247" strokeDasharray="4 5" opacity=".6" /><path className="preview-rain" d="M65 40l-8 25M100 35l-8 25M135 40l-8 25M240 30l-8 25M285 40l-8 25M320 35l-8 25" stroke="#9db4d3" opacity=".5" /><text x="16" y="235" fill="#ffc247" fontSize="10">WEATHER + MUSE</text></> : <g className="preview-cloud"><ellipse cx="145" cy="55" rx="75" ry="25" fill="#9db4d3" opacity=".15" /><ellipse cx="175" cy="42" rx="40" ry="24" fill="#d5dfe0" opacity=".15" /></g>}
    <text x="16" y="25" fill="#9db4d3" fontSize="9" letterSpacing="2">CONCEPT PREVIEW</text>
  </svg>;
}
function UnitPreview() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current!;
    if (!window.matchMedia || typeof IntersectionObserver === 'undefined') return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const update = () => { if (visible && !motion.matches && !document.hidden) void video.play().catch(()=>{}); else video.pause(); };
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); });
    observer.observe(video); motion.addEventListener('change',update); document.addEventListener('visibilitychange',update);
    return () => { observer.disconnect(); motion.removeEventListener('change',update); document.removeEventListener('visibilitychange',update); video.pause(); };
  }, []);
  return <video ref={ref} className="preview-video" muted loop playsInline preload="none" poster="/previews/unit.jpg" aria-label="Master node floating in the Unit Bench"><source src="/previews/unit.mp4" type="video/mp4" /></video>;
}
export function HomePage() {
  const [active, setActive] = useState<string | null>(null);
  return <div className="home-page"><SiteHeader page="home" /><main>
    <div className="home-intro"><span className="home-eyebrow">SOLAR POWER · OCEAN COMPUTE · ADAPTIVE COORDINATION</span><h1>Compute that follows<br />the sun<span>.</span></h1><p>Marine Compute Swarm explores floating, solar-powered computers that work together at sea. Start with the fleet, inspect a node, then test how it responds.</p></div>
    <div className="home-guide" aria-live="polite"><span>{active ? SITE_PAGES.find(p => p.id === active)?.name : 'Choose your starting point'}</span><p>{active ? introductions[active] : 'Three connected views of one concept. Hover or focus a preview to learn more, then open it to explore.'}</p></div>
    <div className="preview-grid">{[SITE_PAGES[0], SITE_PAGES[2], SITE_PAGES[1]].map((page,i) => <a className="preview-card" key={page.id} href={page.href} onMouseEnter={() => setActive(page.id)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(page.id)} onBlur={() => setActive(null)}>
      <div className="preview-screen">{page.id==='unit'?<UnitPreview />:<Preview kind={page.id} />}<span className="preview-open">Open view ↗</span></div><div className="preview-caption"><span className="preview-number">0{i+1}</span><div><h2>{page.name}</h2><p>{page.description}</p></div><span aria-hidden="true">↗</span></div><p className="preview-mobile-description">{introductions[page.id]}</p>
    </a>)}</div>
    <footer className="home-footer">Exploratory simulation <span>Hardware, energy and recovery estimates are design assumptions. These views explain the concept and help test it.</span></footer>
  </main></div>;
}
