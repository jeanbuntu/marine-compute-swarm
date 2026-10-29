import { SimulationToolbar } from '../SimulationToolbar';
import { ReasoningPanel } from '../reasoning/ReasoningPanel';
import { observe, signature, validateDecision, type Decision, type Observation } from '../../model/reasoning/harness';
import { fitFleet, mapPoint, worldPoint, type MapCamera } from '../../model/fleetMap';
import { weatherSun } from '../../model/weatherRecovery';
import { SiteHeader } from '../SiteHeader';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { batteryCapacityWh } from '../../model/swarm';
import { evaluate } from '../../model/hydrostatics';
import { createWeather, environment, logEvent, network, SCENARIOS, stepWeather, type Conditions, type ScenarioId, type WeatherState } from '../../model/weather';
import { FleetRecovery } from './FleetRecovery';
import { RecoveryLab } from './RecoveryLab';
import './weather.css';

const time = (s: number) => `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor(s / 60 % 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
const color = (mode: string) => ['Offline', 'Inverted', 'Retrieval'].includes(mode) ? '#ff6b6b' : ['Holding'].includes(mode) ? '#d5dfe0' : '#ffc247';
const controls: { key: keyof Conditions; label: string; unit: string; min: number; max: number; step: number }[] = [
  { key: 'wind', label: 'Wind', unit: 'm/s', min: 0, max: 40, step: 1 },
  { key: 'swell', label: 'Significant wave height', unit: 'm Hs', min: 0, max: 10, step: 0.1 },
  { key: 'period', label: 'Wave period', unit: 's', min: 3, max: 20, step: 1 },
  { key: 'rain', label: 'Rain', unit: 'mm/h', min: 0, max: 60, step: 1 },
  { key: 'current', label: 'Background current', unit: 'm/s', min: 0, max: 2, step: 0.05 },
  { key: 'tide', label: 'Tidal stream amplitude', unit: 'm/s', min: 0, max: 1.5, step: 0.05 },
  { key: 'direction', label: 'Flow toward (0° north)', unit: '°', min: 0, max: 360, step: 15 },
  { key: 'range', label: 'Nominal radio radius · EST', unit: 'm', min: 50, max: 600, step: 10 },
  { key: 'speed', label: 'Through-water speed limit · EST', unit: 'm/s', min: 0.1, max: 1, step: 0.05 },
];

export function WeatherApp({ reasoning = false }: { reasoning?: boolean }) {
  const [museOpen,setMuseOpen]=useState(reasoning || new URLSearchParams(window.location.search).get('muse')==='open');
  const [museActive,setMuseActive]=useState(museOpen);
  const designs = useStore(s => s.designs);
  const [reasoningEpoch,setReasoningEpoch]=useState(0);
  const [scenario, setScenario] = useState<ScenarioId>('day');
  const preset = SCENARIOS.find(p => p.id === scenario)!;
  const [conditions, setConditions] = useState<Conditions>({ ...preset.conditions });
  const [state, setState] = useState<WeatherState>(() => createWeather(designs));
  const [selected, select] = useState(() => new URLSearchParams(window.location.search).get('inspect') === 'master' ? 'M' : 'W01');
  const [playing, play] = useState(() => !['master','worker'].includes(new URLSearchParams(window.location.search).get('inspect') ?? ''));
  const [speed, setSpeed] = useState(10);
  const [showControls, setShowControls] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [detailOpen, setDetailOpen] = useState(() => ['master','worker'].includes(new URLSearchParams(window.location.search).get('inspect') ?? ''));
  const dragging = useRef<string | null>(null);
  const dragCamera=useRef<MapCamera|null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [mapSize,setMapSize]=useState({width:1000,height:680});
  useEffect(()=>{
    if(!svg.current||typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;if(r.width&&r.height)setMapSize(previous=>Math.abs(previous.width-r.width)<1&&Math.abs(previous.height-r.height)<1?previous:{width:r.width,height:r.height});});
    observer.observe(svg.current);return()=>observer.disconnect();
  },[detailOpen]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setState(s => stepWeather(s, conditions, scenario, (museActive ? 1 : speed) / 10, designs)), 100);
    return () => window.clearInterval(id);
  }, [playing, speed, conditions, scenario, designs, museActive]);
  const env = environment(conditions, state.t), net = network(state, env.range);
  const node = state.nodes.find(n => n.id === selected)!;
  const master = state.nodes[0];
  const soc = node.wh / batteryCapacityWh(designs[node.role]);
  const hydro = evaluate(designs[node.role], env.stowed ? 'stowed' : 'deployed', conditions.wind);
  const displayNodes=state.nodes.map(n=>({...n,...(n.displayAnchor??{})}));
  const camera=fitFleet(displayNodes,mapSize.width,mapSize.height),sun=weatherSun(state.t,scenario);
  const pos = (x:number,y:number)=>mapPoint(camera,x,y);
  const gridSize=camera.gridM/camera.metersPerUnit;
  const [gridX,gridY]=pos(0,0);
  const displayMaster=displayNodes[0];
  const [mx, my] = pos(displayMaster.x, displayMaster.y);
  const mutate = (message: string, fn: (s: WeatherState) => WeatherState) => setState(s => logEvent(stepWeather(fn(s), conditions, scenario, 0, designs), message));
  const inject = (type: 'range' | 'flip' | 'strike' | 'ingress' | 'battery') => {
    const labels = { range: 'Displaced beyond every relay', flip: 'Full capsize injected', strike: 'Wildlife impact: displacement + inversion injected (severity assumed)', ingress: 'Water ingress injected: electrical isolation', battery: 'Battery reduced to 8%' };
    mutate(`${selected}: ${labels[type]}`, s => ({ ...s, nodes: s.nodes.map(n => {
      if (n.id !== selected) return n;
      if (type === 'range') return { ...n, x: Math.max(...s.nodes.filter(p => p.id !== n.id).map(p => p.x)) + env.range + 80, y: master.y };
      if (type === 'flip') return { ...n, inverted: true };
      if (type === 'strike') return { ...n, inverted: true, x: n.x + 90, y: n.y - 50 };
      if (type === 'ingress') return { ...n, ingress: true };
      return { ...n, wh: batteryCapacityWh(designs[n.role]) * 0.08 };
    }), wildlife: type === 'strike' ? true : s.wildlife }));
  };
  const changeScenario = (id: ScenarioId) => {
    setScenario(id); setConditions({ ...SCENARIOS.find(p => p.id === id)!.conditions });
    setReasoningEpoch(v=>v+1); setState(createWeather(designs)); select('W01');
  };
  const pointerPosition = (e: React.PointerEvent<SVGSVGElement>) => {
    const point = svg.current!.createSVGPoint(); point.x = e.clientX; point.y = e.clientY;
    const matrix = svg.current!.getScreenCTM();
    if (!matrix) return;
    const p = point.matrixTransform(matrix.inverse());
    const [x,y]=worldPoint(dragCamera.current??camera,p.x,p.y);
    setState(s => ({ ...s, nodes: s.nodes.map(n => n.id === dragging.current ? { ...n, x, y } : n) }));
  };
  const finishDrag = () => {
    if (dragging.current) { const id = dragging.current; mutate(`${id}: manually displaced; evaluating links and return`, s => s); dragging.current = null; }
  };
  const netPower = node.pvW - node.loadW;
  return <div className={`weather-app weather-${scenario}`}>
    <SiteHeader page="weather" />
    <SimulationToolbar speeds={museActive ? [1] : undefined} playing={playing} speed={museActive ? 1 : speed} time={`Day ${sun.day} · ${time(sun.hour*3600)}`} onPlaying={play} onSpeed={value=>setSpeed(museActive ? 1 : value)}>
      <label className="toolbar-field">Conditions<select aria-label="Conditions" value={scenario} onChange={e=>changeScenario(e.target.value as ScenarioId)}>{SCENARIOS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="toolbar-field">Selection<select aria-label="Selected node" value={selected} onChange={e=>select(e.target.value)}>{state.nodes.map(n=><option key={n.id}>{n.id}</option>)}</select></label>
      <button aria-expanded={showControls} onClick={()=>setShowControls(!showControls)}>Adjust conditions</button>
      <button aria-expanded={museOpen} onClick={()=>setMuseOpen(!museOpen)}>Muse coordinator</button>
      <button onClick={()=>{setReasoningEpoch(v=>v+1);setState(createWeather(designs));select('W01');}}>Reset fleet</button>
    </SimulationToolbar>
    <main>
      <div className="w-heading"><div><div className="w-eyebrow">OCEAN RESILIENCE / FAILURE REHEARSAL</div><h1>Weather Simulator<span>.</span></h1><p>Test the fleet, inject failures and inspect Muse’s reasoning and response.</p></div><button onClick={() => setShowPlan(!showPlan)} aria-expanded={showPlan}>Recovery & design rationale ↗</button></div>
      <ReasoningPanel expanded={museOpen} onExpandedChange={setMuseOpen} onActivityChange={setMuseActive} epoch={reasoningEpoch} state={state} conditions={conditions} scenario={scenario} designs={designs} onClear={()=>setState(s=>({...s,reasoningPolicy:undefined}))} onApply={(decision:Decision,input:Observation)=>{
        const current=observe(state,conditions,scenario,designs,useStore.getState().config);
        const rejected=validateDecision(decision,current);
        if(rejected)return rejected;
        if(signature(current)!==signature(input)||current.t-input.t>120||current.t<input.t)return 'Rejected stale snapshot; local policy retained.';
        setState(s=>logEvent({...s,reasoningPolicy:{strategy:decision.strategy,searchRadiusM:decision.searchRadiusM,expiresAt:s.t+Math.min(120,decision.nextCheckS)}},`Muse strategy: ${decision.strategy} — ${decision.summary}`));
        return `Executed ${decision.strategy}: bounded strategy sent to local controller. Dispatch remains subject to live feasibility checks.`;
      }} />
      {showControls&&detailOpen&&<div className="recovery-conditions"><h2>Conditions</h2>{controls.map(c=><label key={c.key}>{c.label} · {conditions[c.key]} {c.unit}<input aria-label={c.label} type="range" min={c.min} max={c.max} step={c.step} value={conditions[c.key]} onChange={e=>setConditions(v=>({...v,[c.key]:Number(e.target.value)}))}/></label>)}</div>}
      <section id="weather-scenario" aria-label="Fleet rehearsal">
        <div className="w-scenario"><div><span className="w-eyebrow">{preset.subtitle}</span><h2>{preset.question}</h2></div></div>
        <div className="w-detail-switch" role="group" aria-label="Simulator detail level"><button aria-pressed={!detailOpen} onClick={()=>setDetailOpen(false)}>Fleet map</button><button aria-pressed={detailOpen} onClick={()=>setDetailOpen(true)}>3D recovery close-up</button><a href="#recovery-plan">Recovery plan ↓</a>{detailOpen && <label>Inspect node <select aria-label="Recovery node" value={selected} onChange={e=>select(e.target.value)}>{state.nodes.map(n=><option key={n.id} value={n.id}>{n.id} · {n.role}</option>)}</select></label>}</div>
        {detailOpen ? <RecoveryLab key={selected} design={designs[node.role]} nodeId={selected} swell={conditions.swell} inverted={node.inverted} ingress={node.ingress} liveRighting={node.righting} fleetPlaying={playing} playbackSpeed={speed} onClose={()=>setDetailOpen(false)} /> : <div className="w-workspace">
          <section className="w-map-panel" aria-label="Fleet simulation">
            <div className="w-map-top"><span><i className="w-live" />{playing ? 'SIMULATING' : 'PAUSED'}<b>{sun.ghi===0 ? 'NIGHT / PV OFF' : env.stowed ? 'SURVIVAL / STOW REQUESTED' : 'DAYLIGHT / PV ACTIVE'}</b></span></div>
            <svg ref={svg} className="w-map" viewBox={`0 0 ${mapSize.width} ${mapSize.height}`} role="img" aria-label="Interactive fleet map. Select a node, then drag it to test separation. Keyboard users can use the node selector and displacement button." onPointerMove={e => { if (dragging.current) pointerPosition(e); }} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
              <defs><pattern id="ocean-grid" x={gridX%gridSize} y={gridY%gridSize} width={gridSize} height={gridSize} patternUnits="userSpaceOnUse"><path d={`M${gridSize} 0H0V${gridSize}`} fill="none" stroke="#9db4d3" strokeOpacity=".1" /></pattern><radialGradient id="ocean-glow"><stop stopColor={sun.ghi===0 ? '#0b1223' : '#142136'} /><stop offset="1" stopColor="#090f1e" /></radialGradient><pattern id="rain-lines" width="32" height="45" patternUnits="userSpaceOnUse"><path d="M10 0L0 25" stroke="#9db4d3" strokeOpacity=".18" /></pattern></defs>
              <rect width={mapSize.width} height={mapSize.height} fill="url(#ocean-glow)" /><rect width={mapSize.width} height={mapSize.height} fill="url(#ocean-grid)" />
              {Array.from({ length: Math.ceil(mapSize.height/90) }, (_, i) => <path key={i} d={`M0 ${i * 90 + (state.t * 2 % 40)} Q250 ${i * 90 - 25} 500 ${i * 90} T${mapSize.width} ${i * 90 + 15}`} stroke="#9db4d3" strokeOpacity={0.05 + conditions.swell / 120} strokeWidth={1 + conditions.swell / 3} fill="none" />)}
              {conditions.rain > 0 && <rect width={mapSize.width} height={mapSize.height} fill="url(#rain-lines)" opacity={conditions.rain / 60} />}
              <ellipse cx={mx} cy={my} rx={env.range / camera.metersPerUnit} ry={env.range / camera.metersPerUnit} fill="#9db4d3" fillOpacity=".025" stroke="#9db4d3" strokeOpacity=".35" strokeDasharray="5 7" />
              <text x={mx} y={my - env.range / camera.metersPerUnit - 12} textAnchor="middle" fill="#9db4d3" fontSize="12">ASSUMED DIRECT LINK · {env.range.toFixed(0)} m</text>
              {net.edges.map(([a, b]) => { const na = displayNodes.find(n => n.id === a)!, nb = displayNodes.find(n => n.id === b)!; const [x1, y1] = pos(na.x, na.y), [x2, y2] = pos(nb.x, nb.y); return <line key={`${a}-${b}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={net.connected.has(a) ? '#9db4d3' : '#ffc247'} strokeOpacity=".12" />; })}
              {state.rescue?.report && !state.nodes.find(n=>n.id===state.rescue?.targetId)?.displayAnchor && (()=>{
                const rescue=state.rescue, report=rescue.report!;
                const [x,y]=pos(report.x,report.y);
                const path=[{x:master.x,y:master.y},...rescue.waypoints,{x:report.x,y:report.y}].map(p=>pos(p.x,p.y).join(',')).join(' ');
                return <g pointerEvents="none">{rescue.ringRadiusM>0 ? <><circle cx={x} cy={y} r={rescue.ringRadiusM/camera.metersPerUnit} fill="#ffc247" fillOpacity=".04" stroke="#ffc247" strokeDasharray="6 6" /></>:<polyline points={path} fill="none" stroke="#ffc247" strokeOpacity=".65" strokeDasharray="7 6" /> }
                  <ellipse cx={x} cy={y} rx={Math.min(rescue.uncertaintyM/camera.metersPerUnit,1000)} ry={Math.min(rescue.uncertaintyM/camera.metersPerUnit,1000)} fill="#ffc247" fillOpacity=".025" stroke="#ffc247" strokeOpacity=".25" strokeDasharray="3 7" />
                  <path d={`M${x-8} ${y}h16M${x} ${y-8}v16`} stroke="#ffc247" />
                  <text x={x} y={y-18} fill="#ffc247" fontSize="11" textAnchor="middle">{rescue.targetId} · LAST {report.source.toUpperCase()} FIX</text>
                  {rescue.waypoints.filter(w=>w.kind!=='fleet').map(w=>{const [wx,wy]=pos(w.x,w.y);return <g key={w.id}><circle cx={wx} cy={wy} r="8" stroke="#ffc247" fill="none" strokeDasharray="3 3" />{w.kind==='bridge'&&<text x={wx} y={wy+24} fill="#ffc247" fontSize="10" textAnchor="middle">{w.id} RELAY</text>}</g>;})}
                </g>;
              })()}
              {state.wildlife && <g transform="translate(610 240)"><ellipse rx="65" ry="20" fill="#99b6c7" opacity=".4" /><path d="M-55 0l-30 -20 6 20 -6 20z" fill="#99b6c7" opacity=".5" /><text y="48" textAnchor="middle" fill="#d4dde5" fontSize="12">WILDLIFE HOLD · FLEET-WIDE</text></g>}
              {displayNodes.map(n => { const [x, y] = pos(n.x, n.y); const chosen = selected === n.id; const roll = n.displayAnchor ? 0 : n.inverted ? n.righting.rollDeg : Math.sin(state.t * 2 * Math.PI / conditions.period + n.homeX) * Math.min(30, conditions.swell * 5); return <g key={n.id} data-node-id={n.id} transform={`translate(${x} ${y})`} onPointerDown={e => { e.preventDefault(); select(n.id); if(n.displayAnchor)return; dragging.current = n.id; dragCamera.current=camera; svg.current!.setPointerCapture(e.pointerId); }} style={{ cursor: n.displayAnchor ? 'pointer' : 'grab' }}>
                {state.rescue?.escortIds.includes(n.id)&&<circle r="30" fill="none" stroke="#ffc247" strokeOpacity=".7" />}
                <title>{n.id} · {n.mode}{n.inverted?` · ${n.righting.phase}`:''}</title>
                {n.righting.inflation>0&&<ellipse cx="-22" cy="-9" rx={9*n.righting.inflation} ry={13*n.righting.inflation} fill="#dca35f" stroke="#f0d5a9" />}
                {n.mode==='Self-righting'&&<circle r="33" fill="none" stroke="#ffc247" strokeWidth="2" strokeDasharray={`${n.righting.progress*207} 207`} transform="rotate(-90)" />}
                <circle r={chosen ? 27 : 21} fill={chosen ? '#ffc247' : '#9db4d3'} fillOpacity={chosen ? '.1' : '.03'} stroke={chosen ? '#ffc247' : 'none'} />
                <g transform={`rotate(${roll})`}><path d="M-16 -6L-6 -16H6L16 -6V6L6 16H-6L-16 6Z" fill={n.inverted ? '#5c3438' : '#293443'} stroke={color(n.mode)} strokeWidth="1.5" /><path d="M-12 0H12M0 -12V12M-9 -9L9 9M9 -9L-9 9" stroke={color(n.mode)} strokeOpacity=".45" /><rect x="-6" y="-6" width="12" height="12" rx="2" fill={n.role === 'master' ? '#ffc247' : color(n.mode)} /></g>
                <text y="43" textAnchor="middle" fill={chosen ? '#fff' : '#9db4d3'} fontSize="12">{n.id === 'M' ? 'MASTER' : n.id}{n.displayAnchor ? ' · DEAD / RETRIEVE' : n.inverted ? n.righting.phase==='Failed'?' · INVERTED':` · ${n.righting.phase.toUpperCase()}` : n.reserveHold?' · RESERVE':''}</text>
                {!net.connected.has(n.id) && <circle cx="19" cy="-19" r="4" fill="#ff6b6b" />}
              </g>; })}
              <g transform={`translate(${mapSize.width-45} 45)`} fill="#9db4d3"><text x="0" y="-22" textAnchor="middle" fontSize="12">N</text><path d="M0 -12L-5 7 0 3 5 7Z" /><text y="35" textAnchor="middle" fontSize="11">E →</text></g>
              <g transform={`translate(35 ${mapSize.height-45})`} fill="#9db4d3"><path d={`M0 -5V5M0 0H${gridSize}M${gridSize} -5V5`} stroke="#9db4d3" /><text x={gridSize/2} y="24" textAnchor="middle" fontSize="12">{camera.gridM} m</text></g>
            </svg>
            <div className="w-map-bottom"><span>Drag active nodes · grid {camera.gridM} m</span><span>Auto-fit · all {state.nodes.length} nodes visible</span></div>
            {showControls && <div className="w-conditions"><div className="w-eyebrow">EDIT THIS SCENARIO</div>{controls.map(c => <label key={c.key}>{c.label}<output>{conditions[c.key].toFixed(c.step < 1 ? 2 : 0)} {c.unit}</output><input type="range" min={c.min} max={c.max} step={c.step} value={conditions[c.key]} onChange={e => setConditions(v => ({ ...v, [c.key]: Number(e.target.value) }))} /></label>)}<p>Scenario changes reset the fleet and conditions. Reset fleet preserves your conditions.</p></div>}
          </section>
          <aside className="w-inspector">
            <div className="w-inspector-title"><span className="w-eyebrow">NODE TELEMETRY · {selected}</span></div>
            <div className="w-node-heading"><h2>{node.role === 'master' ? 'Master' : `Worker ${selected.slice(1)}`}</h2><span style={{ color: color(node.mode) }}>{node.displayAnchor ? "Dead / retrieval required" : node.mode}</span></div>
            {node.displayAnchor&&<p className="w-note terminal-note">Permanently disabled. Marker frozen at the failure location for this lesson; physical drift continues in the underlying model. Reset fleet represents recovery.</p>}
            {(!playing&&(node.inverted||node.reserveHold))&&<p className="w-note">Paused — press Play to advance automatic recovery and sunlight.</p>}
            {node.righting.phase!=='Ready'&&<div className="w-righting-status">Righting: {node.righting.phase} · {Math.round(node.righting.elapsedS)} / 60 s<br />{node.righting.phase==='Upright'?'Upright; bag deployed, service required':node.righting.phase==='Failed'?'Attempt failed; physical retrieval required':'Conditional automatic mechanism sequence'}</div>}
            <div className="w-battery"><span style={{ width: `${soc * 100}%`, background: soc < .25 ? '#ffc247' : '#d5dfe0' }} /></div>
            <div className="w-measures"><div><span>Battery</span><b>{(soc * 100).toFixed(1)}<small>%</small></b></div><div><span>Net power</span><b>{netPower >= 0 ? '+' : ''}{netPower.toFixed(0)}<small>W</small></b></div><div><span>From master</span><b>{Math.hypot(node.x - master.x, node.y - master.y).toFixed(0)}<small>m</small></b></div><div><span>Lost link for</span><b>{node.lostS.toFixed(0)}<small>s</small></b></div></div>
            <div className="w-link-status"><i style={{ background: net.connected.has(selected) ? '#d5dfe0' : '#ff6b6b' }} />{net.connected.has(selected) ? selected === 'M' ? 'Coordinator online' : Math.hypot(node.x - master.x, node.y - master.y) <= env.range ? 'Direct link to master' : 'Connected through mesh relay' : 'No route to coordinator'}</div>
            <p className="w-note">{node.reserveHold?'Reserve protocol: essentials only. Escorts gather and hold until 25% charge; the fleet follows drift.':!net.connected.has(node.id)?`Independent distress pod: ${node.beaconStatus}. Dispatch uses the latest received fix.`:'Recovery coordinator monitors energy and position reports.'} <a href="#recovery-plan">View recovery plan ↓</a></p>
            <div className="w-section-title">INJECT A FAILURE <span>ON {selected}</span></div>
            <div className="w-injections"><button onClick={() => inject('range')}>↗ Push beyond all relays</button><button onClick={() => inject('flip')}>↻ Capsize node</button><button onClick={() => inject('strike')}>≈ Wildlife impact drill</button><button onClick={() => inject('ingress')}>↓ Water ingress</button><button onClick={() => inject('battery')}>ϟ Drain battery to 8%</button></div>
            <div className="w-section-title">FLEET EVENTS</div>
            <div className="w-fleet-buttons"><button aria-pressed={state.wildlife} onClick={() => mutate(state.wildlife ? 'Wildlife clear: operator releases hold' : 'Wildlife detected: all thrusters idle; compute shed', s => ({ ...s, wildlife: !s.wildlife }))}>{state.wildlife ? 'Release wildlife hold' : 'Wildlife nearby'}</button><button onClick={() => mutate(state.masterOnline ? 'Coordinator failure: cached rendezvous remains; backhaul unavailable' : 'Coordinator restored', s => ({ ...s, masterOnline: !s.masterOnline }))}>{state.masterOnline ? 'Fail coordinator' : 'Restore coordinator'}</button></div>
            <p className="w-note">Capsize runs the conditional 60 s righting sequence on this map. Ingress or a spent/failed kit still needs retrieval. The 3D close-up explains the same mechanism.</p>
          </aside>
        </div>}
        <FleetRecovery state={state} node={node} onFormation={formation=>mutate(`Recovery formation: ${formation}`,s=>({...s,recoveryFormation:formation}))} onToggle={key=>mutate(`${key==='satelliteAvailable'?'Satellite test channel':key==='skyView'?'Sky view':'Righting kit'} ${state[key]?'unavailable':'available'}`,s=>({...s,[key]:!s[key]}))} />
        <div className="w-readouts"><div><span>Mesh reachability</span><b>{net.connected.size}<small> / {state.nodes.length} nodes</small></b></div><div><span>Effective link radius · EST</span><b>{env.range.toFixed(0)}<small> m / hop</small></b></div><div><span>Water current</span><b>{Math.abs(env.stream).toFixed(2)}<small> m/s{env.stream < 0 ? ' · reversed' : ''}</small></b></div><div><span>Concept tide level</span><b>{env.tideLevel >= 0 ? '+' : ''}{env.tideLevel.toFixed(2)}<small> m</small></b></div><div><span>Selected hull · small-angle GM</span><b>{hydro.gmM.toFixed(2)}<small> m · {hydro.ok ? 'static check passes' : 'static limits exceeded'}</small></b></div></div>
        <div className="w-bottom-grid"><article className="w-response"><span className="w-eyebrow">RESPONSE UNDER TEST</span><h2>{node.mode === 'Self-righting' ? 'Isolate. Inflate. Roll upright.' : node.mode === 'Inverted' ? 'Righting failed. Locate and retrieve.' : node.mode === 'Power reserve' ? 'Preserve power. Report. Recharge or retrieve.' : node.mode === 'Retrieval' ? 'No headway. Call for retrieval.' : state.wildlife ? 'Give wildlife space. Let the fleet drift.' : !state.masterOnline ? 'Local autonomy; uplink unavailable.' : 'Relay first. Return locally. Preserve reserve.'}</h2><p>{preset.rationale}</p><ol><li><b>0–15 s without coordinator:</b> retry the mesh; hold the cached formation slot using local navigation.</li><li><b>After 15 s:</b> try autonomous return. After the assumed 60 s acquisition, the independent satellite pod can report to shore. A bounded relay chain follows received fixes.</li><li><b>Below 25% / 10% battery:</b> shed compute / idle propulsion and keep essentials. Charge from solar; resume independent operation at 25%. Escorts need at least 35% battery and sufficient thrust margin.</li></ol><p className="w-note">Proposed firmware policy, simulated here only. An inverted node’s 15 W safety load assumes protected electronics; a working antenna while inverted is not established. Node icons show simulation truth. The amber cross and search path use received reports only; a disconnected node’s true position is never used for dispatch.</p></article>
          <article className="w-event-log"><div className="w-section-title">EVENT LOG <span>SIMULATION TIME</span></div><div aria-live="polite" role="log">{state.events.length === 0 ? <p className="w-muted">Conditions running. Inject a failure to trace the response.</p> : state.events.slice(0, 10).map((e, i) => <p key={`${e.t}-${i}`}><time>{time(e.t)}</time>{e.message}</p>)}</div></article></div>
      </section>
      {showPlan && <section className="w-rationale" aria-label="Recovery and design rationale"><span className="w-eyebrow">DESIGN DISCUSSION / OPEN QUESTIONS</span><h2>Design for recovery, not an “unflippable” promise.</h2><div className="w-plan-grid"><article><h3>01 / Self-righting candidate</h3><p>The shared designs now carry a packed offset righting bag, gas supply, recovery controller, leak sensor, distress pod, drive guards and captive panel locks. Existing low ballast is retained. The bag is intended to break inverted symmetry without a permanent tall buoyancy dome over the PV deck. Its deployment and restoring moment remain unvalidated.</p><p>A broad flat PV deck and tall stowed panel stack may resist or obstruct recovery. Extra ballast trades reserve buoyancy and transport mass for stability. Do not add it without rerunning the hull checks.</p><b>Next test:</b><p>Full 0–180° righting-arm curve, flooded compartments, broken panels, then physical knockdown and wave-basin tests. Positive small-angle GM alone does not establish self-righting. <a href="https://rnli.org/magazine/magazine-featured-list/2021/november/how-do-lifeboats-self-right" target="_blank" rel="noreferrer">RNLI self-righting reference ↗</a></p></article><article><h3>02 / Establish the real range</h3><p>250 m is a test hypothesis, not a radio specification. Rain/swell radius reductions are adjustable scenario heuristics. A real limit needs frequency, antenna heights, transmit power, receiver sensitivity, fade margin and an over-water trial.</p><p>Mesh extends reach only while powered neighbors connect to the master. Failing the coordinator removes backhaul; electing a worker does not give it the master's satellite hardware.</p><b>Candidate backup:</b><p>Independent low-rate satellite distress telemetry per node, or several uplink-equipped coordinators. The model now includes an independent 20 Wh reserve and a simulated low-rate satellite distress channel. Delivery depends on test-channel availability, sky view and reserve energy. It is not a second compute uplink or a real provider connection. <a href="https://ifp.iridium.com/products/iridium-9603/" target="_blank" rel="noreferrer">Iridium SBD reference ↗</a></p></article><article><h3>03 / Marine life comes first</h3><p>Nearby wildlife triggers a fleet-wide idle-thruster hold in this drill. A tail impact injects displacement and inversion; its severity is assumed, not a modeled whale force.</p><p>Explore smooth guards, retained debris and no loose lines. Avoid chasing, entangling barriers or untested acoustic deterrents. Drift also creates risk; deployment requires a site-specific wildlife response and detection plan.</p><b>Next test:</b><p>Detection coverage and missed detections, guarded-thruster contact, impact damage and safe retrieval. Guidance depends on species and location. <a href="https://www.fisheries.noaa.gov/topic/marine-life-viewing-guidelines/guidelines-and-distances" target="_blank" rel="noreferrer">NOAA wildlife guidance ↗</a></p></article></div><details><summary>More failure scenarios to investigate</summary><p>Breaking waves and green water; lightning; salt ingress and corrosion; GNSS loss or spoofing; biofouling; fishing-line or kelp entanglement; damaged propeller guards; panel detachment and marine debris; fire or thermal runaway; vessel collision; grounding at low tide; forecast error; common-mode software failure; maintenance and retrieval during unsafe seas.</p></details></section>}
      <footer className="w-footer">EXPLORATORY MODEL <span>Estimated drift + battery balance + threshold mesh. No CFD, wave-breaking, structural impact, ingress rate, grounding or full-angle stability solver. No live weather or automatic wildlife detection.</span></footer>
    </main>
  </div>;
}
