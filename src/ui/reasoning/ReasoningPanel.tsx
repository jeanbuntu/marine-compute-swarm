import { useEffect, useRef, useState } from 'react';
import { decisionSchema, demoDecision, messages, observe, signature, validateDecision, type Decision, type Observation } from '../../model/reasoning/harness';
import type { Conditions, ScenarioId, WeatherState } from '../../model/weather';
import type { Designs } from '../../model/swarm';
import { useStore } from '../../state/store';
import './reasoning.css';

type Trace={id:number;at:number;source:'demo'|'Muse';observation:Observation;prompt:ReturnType<typeof messages>;status:string;raw?:string;decision?:Decision;latencyMs?:number;usage?:unknown;outcome?:string};
type Props={expanded?:boolean;onExpandedChange?:(open:boolean)=>void;onActivityChange?:(active:boolean)=>void;epoch?:number;state:WeatherState;conditions:Conditions;scenario:ScenarioId;designs:Designs;onApply:(decision:Decision,observation:Observation)=>string;onClear:()=>void};
export function ReasoningPanel(props:Props) {
  const config=useStore(s=>s.config);
  const observation=observe(props.state,props.conditions,props.scenario,props.designs,config);
  const [localExpanded,setLocalExpanded]=useState(true);
  const expanded=props.expanded??localExpanded;
  const setExpanded=(open:boolean)=>{setLocalExpanded(open);props.onExpandedChange?.(open);};
  const [connection,setConnection]=useState({configured:false,model:'muse-wonder-1.0',endpoint:'https://api.meta.ai/v1/chat/completions'});
  const [token,setToken]=useState(''),[mode,setMode]=useState<'demo'|'Muse'>('demo'),[auto,setAuto]=useState(false),[execute,setExecute]=useState(false);
  const [traces,setTraces]=useState<Trace[]>([]),[selected,setSelected]=useState<number|null>(null),[busy,setBusy]=useState(false),[calls,setCalls]=useState(0);
  const latest=useRef({props,observation,execute});latest.current={props,observation,execute};
  const inFlight=useRef(false),last=useRef({wall:0,key:'',sim:0,review:60}),request=useRef<AbortController|null>(null),generation=useRef(0);
  useEffect(()=>{const controller=new AbortController();fetch('/api/muse',{signal:controller.signal}).then(r=>r.json()).then(setConnection).catch(()=>{});return()=>{controller.abort();request.current?.abort();};},[]);
  useEffect(()=>{generation.current++;request.current?.abort();last.current={wall:0,key:'',sim:0,review:60};setAuto(false);},[props.scenario,props.designs,props.epoch]);
  const add=(trace:Trace)=>{setTraces(t=>[trace,...t].slice(0,40));setSelected(trace.id);};
  const patch=(id:number,values:Partial<Trace>)=>setTraces(t=>t.map(x=>x.id===id?{...x,...values}:x));
  async function run(manual=true) {
    if(inFlight.current)return;
    const o=latest.current.observation,key=signature(o),now=Date.now();
    if(!manual&&(!o.adverse.length||!o.coordinatorOnline||now-last.current.wall<30000||(last.current.key===key&&o.t-last.current.sim<last.current.review)))return;
    if(mode==='Muse'&&(!connection.configured||!token))return;
    if(mode==='Muse'&&now-last.current.wall<10000)return;
    if(calls>=20&&mode==='Muse')return;
    const id=now,gen=generation.current;
    last.current={wall:now,key,sim:o.t,review:60};inFlight.current=true;setBusy(true);
    add({id,at:o.t,source:mode,observation:o,prompt:messages(o),status:'Requesting'});
    try {
      let d:Decision;
      if(mode==='demo'){d=demoDecision(o);patch(id,{raw:JSON.stringify(d,null,2),latencyMs:0});}
      else {
        setCalls(n=>n+1);request.current=new AbortController();
        const result=await fetch('/api/muse',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(o),signal:request.current.signal});
        const data=await result.json();patch(id,{raw:data.raw,latencyMs:data.latencyMs,usage:data.usage});
        if(!result.ok)throw new Error(data.error??`Server HTTP ${result.status}`);
        d=decisionSchema.parse(data.decision);
      }
      last.current.review=d.nextCheckS;
      const current=latest.current.observation;
      const stale=gen!==generation.current||signature(current)!==key||current.t<o.t||current.t-o.t>120;
      const rejection=stale?'Snapshot changed or expired; response discarded.':validateDecision(d,current);
      let outcome=rejection??'Validated; shadow mode — no action executed.';
      if(!rejection&&execute&&latest.current.execute)outcome=latest.current.props.onApply(d,o);
      patch(id,{decision:d,status:rejection?'Rejected':execute?'Applied':'Shadow',outcome});
    }catch(e){patch(id,{status:'Fallback',outcome:e instanceof Error?e.message:'Request failed; local control continues.'});}
    finally{inFlight.current=false;setBusy(false);}
  }
  const runRef=useRef(run);runRef.current=run;
  useEffect(()=>{if(!auto)return;const timer=window.setInterval(()=>void runRef.current(false),1000);return()=>clearInterval(timer);},[auto]);
  const trace=traces.find(t=>t.id===selected)??traces[0];
  function download(){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(traces,null,2)],{type:'application/json'}));a.href=url;a.download='muse-reasoning-traces.json';a.click();URL.revokeObjectURL(url);}
  const policy=props.state.reasoningPolicy&&props.state.reasoningPolicy.expiresAt>props.state.t?props.state.reasoningPolicy:undefined;
  const active=expanded||auto||execute||busy||!!policy;
  useEffect(()=>{props.onActivityChange?.(active);},[active,props.onActivityChange]);
  const input=trace?.observation??observation;
  function baseline(){generation.current++;request.current?.abort();setAuto(false);setExecute(false);props.onClear();}
  const tokenCount=(trace?.usage as {total_tokens?:number}|undefined)?.total_tokens;
  return <section className={`muse-panel ${expanded?'is-expanded':'is-collapsed'}`} aria-label="Muse coordinator">
    <div className="muse-summary">
      <div><span className="w-eyebrow">FLEET REASONING & COORDINATION</span><h2>Muse coordinator</h2><p>{expanded?'Inspect the same fleet through received telemetry, a model decision and local execution.':'Fleet strategy through Muse reasoning. Open the inspector to see its inputs and decisions.'}</p></div>
      <div className="muse-summary-actions"><span className="muse-badge">{busy?'REASONING…':policy?`ACTIVE: ${policy.strategy.toUpperCase()}`:auto?'AUTO-ESCALATION ON':execute?'EXECUTION ENABLED':'LOCAL CONTROL'}</span><button aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Hide Muse':'Open Muse'}</button>{!expanded&&(auto||execute||policy)&&<button onClick={baseline}>Return to baseline</button>}</div>
    </div>
    {expanded&&<div className="muse-body">
      <div className="muse-toolbar">
        <label className="muse-provider">Provider<select aria-label="Provider" value={mode} onChange={e=>{generation.current++;request.current?.abort();setMode(e.target.value as 'demo'|'Muse');setAuto(false);}}><option value="demo">Local demo · no API</option><option value="Muse">Meta Muse Wonder</option></select></label>
        <button disabled={busy||(mode==='Muse'&&(!connection.configured||!token||calls>=20))} onClick={()=>void run()}>{busy?'Reasoning…':'Evaluate snapshot'}</button>
        <button onClick={baseline}>Return to baseline</button>
        <span className="muse-debug-speed">1× while Muse is open or active · inject failures in the fleet below</span>
      </div>
      {mode==='Muse'&&<div className="muse-config"><label>Dashboard access token<input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} placeholder="MUSE_ACCESS_TOKEN (not the Meta key)" /></label><span>{connection.configured?connection.model:'Server credentials not configured'} · {calls}/20 live requests</span><details><summary>Connection details</summary><p>{connection.endpoint}. Meta credentials stay on the server. 45 s timeout, 10 s manual spacing, 30 s automatic cooldown and six requests/minute per server process.</p></details></div>}
      <div className="muse-outcome" role="status" aria-live="polite">{busy?'Evaluating the captured fleet snapshot…':trace?.outcome??'No model request yet. Choose a provider, inject a failure, then evaluate.'}</div>
      <div className="muse-inspectors">
        <details className="muse-inspector"><summary><b>Inputs & prompt</b><span>{input.nodes.filter(n=>n.connected).length}/{input.nodes.length} received links · {input.adverse.length} adverse signals{trace?` · snapshot ${trace.at.toFixed(0)} s`:''}</span></summary>
          <p>{trace?'The captured input for the selected decision.':'The next input follows the fleet until you evaluate.'} Disconnected nodes contribute received reports, not their truth positions.</p>
          <div className="muse-input-facts"><span>Conditions<b>{input.conditions.wind} m/s wind · {input.conditions.swell} m swell</b></span><span>Daylight<b>{input.sun.ghi.toFixed(0)} W/m² · {input.sun.hour.toFixed(1)} h</b></span><span>Local recovery<b>{input.baseline.status}</b></span></div>
          <p><b>Escalation signals:</b> {input.adverse.join(', ')||'Routine conditions'}</p>
          <div className="muse-report-table"><table><caption>Received node telemetry</caption><thead><tr><th>Node</th><th>Link</th><th>Charge</th><th>Reported fault</th><th>Fix age</th></tr></thead><tbody>{input.nodes.map(n=><tr key={n.id}><td>{n.id}</td><td>{n.connected?'Connected':'Lost'}</td><td>{n.batteryPct===null?'Unknown':`${n.batteryPct.toFixed(1)}%`}</td><td>{n.fault??'Unknown'}</td><td>{n.reportAgeS===null?'Unknown':`${n.reportAgeS.toFixed(0)} s`}</td></tr>)}</tbody></table></div>
          <details><summary>{trace?'Exact request sent':'Next input snapshot & prompt'}</summary><pre>{JSON.stringify(trace?.prompt??messages(observation),null,2)}</pre></details>
        </details>
        <details className="muse-inspector"><summary><b>Decision & output</b><span>{trace?.decision?.strategy??trace?.status??'No decision yet'}{trace?.latencyMs!==undefined?` · ${(trace.latencyMs/1000).toFixed(1)} s`:''}</span></summary>
          {!trace&&<p>Evaluate a snapshot to see the proposed strategy, its evidence and whether it was executed.</p>}
          {trace&&<p><b>{trace.source==='demo'?'Local demonstration; no model called':connection.model}</b> · {trace.status}</p>}
          {trace?.decision&&<div className="muse-decision"><h3>{trace.decision.strategy}</h3><p>{trace.decision.summary}</p><b>Evidence</b><ul>{trace.decision.evidence.map((v,i)=><li key={i}>{v}</li>)}</ul><b>Uncertainty</b><ul>{trace.decision.uncertainty.map((v,i)=><li key={i}>{v}</li>)}</ul><p>Review in {trace.decision.nextCheckS} simulated seconds; policy expires within 120 seconds.</p></div>}
          <details><summary>Raw response & token usage{tokenCount!==undefined?` · ${tokenCount.toLocaleString()} tokens`:''}</summary><pre>{trace?.raw??'No response yet.'}</pre><pre>{JSON.stringify(trace?.usage??null,null,2)}</pre></details>
        </details>
      </div>
      <div className="muse-secondary">
        <details><summary>Automation & execution · {execute?'Execution enabled':'Shadow mode'}</summary><div className="muse-options"><label><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} />Auto-escalate adverse events</label><label><input type="checkbox" checked={execute} onChange={e=>{generation.current++;request.current?.abort();setExecute(e.target.checked);if(!e.target.checked)props.onClear();}} />Execute validated strategies</label></div><p>Shadow mode shows proposals. Execution sends a bounded strategy to this same fleet; local power, damage, wildlife and dispatch checks still apply. Hiding Muse preserves the session and any active automation.</p></details>
        <details><summary>Decision history · {traces.length}</summary><div className="muse-history">{!traces.length&&<p>No decisions recorded in this session.</p>}{traces.map(t=><button className={t.id===trace?.id?'active':''} key={t.id} onClick={()=>setSelected(t.id)}>{t.at.toFixed(0)} s · {t.source} · {t.status} · {t.decision?.strategy??'No strategy'}</button>)}</div><button disabled={!traces.length} onClick={download}>Export traces</button></details>
        <details><summary>Model scope & sources</summary><p>Rationale is the model’s explanatory output. Cloud telemetry comes from a separate seeded tracker; Weather PV uses its daylight/rain model. No live forecast, satellite service or vessel control is connected.</p></details>
      </div>
    </div>}
  </section>;
}
