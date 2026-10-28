import { useEffect, useRef, useState } from 'react';
import { decisionSchema, demoDecision, messages, observe, signature, validateDecision, type Decision, type Observation } from '../../model/reasoning/harness';
import type { Conditions, ScenarioId, WeatherState } from '../../model/weather';
import type { Designs } from '../../model/swarm';
import { useStore } from '../../state/store';
import './reasoning.css';

type Trace={id:number;at:number;source:'demo'|'Muse';observation:Observation;prompt:ReturnType<typeof messages>;status:string;raw?:string;decision?:Decision;latencyMs?:number;usage?:unknown;outcome?:string};
type Props={selectedNode?:string;onInject?:(type:'battery'|'flip'|'ingress'|'range')=>void;epoch?:number;state:WeatherState;conditions:Conditions;scenario:ScenarioId;designs:Designs;onApply:(decision:Decision,observation:Observation)=>string;onClear:()=>void};
export function ReasoningPanel(props:Props) {
  const config=useStore(s=>s.config);
  const observation=observe(props.state,props.conditions,props.scenario,props.designs,config);
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
  return <section className="muse-panel" aria-label="Muse reasoning pipeline">
    <div className="muse-title"><div><span className="w-eyebrow">MASTER NODE / ADAPTIVE COORDINATION</span><h2>Muse reasoning</h2><p>Routine control stays local. Escalate uncertainty, inspect a decision, measure its effect.</p></div><span className="muse-badge">{mode==='demo'?'DETERMINISTIC DEMO':connection.configured?'MUSE KEY CONFIGURED':'MUSE NOT CONFIGURED'}</span></div>
    <div className="muse-flow" aria-label="Decision flow">{['01 · Observe','02 · Escalation gate','03 · Muse API','04 · Validate','05 · Local controller','06 · Feedback'].map((label,i)=><div key={label}><b>{label}</b><small>{[`${observation.nodes.length} nodes · received fixes`,observation.adverse.length?`${observation.adverse.length} adverse signals`:'Routine → no automatic API call',busy?'Awaiting response':mode==='demo'?'No API calls':connection.model,'Schema + freshness + dispatch limits',props.state.reasoningPolicy&&props.state.reasoningPolicy.expiresAt>props.state.t?`${props.state.reasoningPolicy.strategy} until ${props.state.reasoningPolicy.expiresAt.toFixed(0)} s`:'Baseline recovery policy',`${props.state.rescue?.status??'Formation'} · ${props.state.t.toFixed(0)} s`][i]}</small></div>)}</div>
    {props.onInject&&<div className="muse-inject"><span>Inject on {props.selectedNode}</span><button onClick={()=>props.onInject?.('battery')}>Low battery · 8%</button><button onClick={()=>props.onInject?.('flip')}>Capsize</button><button onClick={()=>props.onInject?.('ingress')}>Water ingress</button><button onClick={()=>props.onInject?.('range')}>Lost beyond relays</button><small>Select another node or change weather in the fleet rehearsal below.</small></div>}
    <div className="muse-toolbar"><label>Provider <select value={mode} onChange={e=>{generation.current++;request.current?.abort();setMode(e.target.value as 'demo'|'Muse');setAuto(false);}}><option value="demo">Local demo · no API</option><option value="Muse">Meta Muse Wonder</option></select></label><label><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} />Auto-escalate adverse events</label><label><input type="checkbox" checked={execute} onChange={e=>{generation.current++;request.current?.abort();setExecute(e.target.checked);if(!e.target.checked)props.onClear();}} />Execute validated strategies</label><button disabled={busy||(mode==='Muse'&&(!connection.configured||!token||calls>=20))} onClick={()=>void run()}>{busy?'Reasoning…':'Evaluate snapshot'}</button><button onClick={()=>{generation.current++;request.current?.abort();setAuto(false);props.onClear();}}>Return to baseline</button><button disabled={!traces.length} onClick={download}>Export traces</button></div>
    {mode==='Muse'&&<div className="muse-config"><label>Dashboard access token <input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} placeholder="MUSE_ACCESS_TOKEN (not the Meta key)" /></label><span>{connection.endpoint} · {connection.model} · {calls}/20 session requests</span><p>Meta key stays on the server in MODEL_API_KEY. Requests have a 45 s timeout, 10 s manual spacing, 30 s automatic cooldown and a six/minute server budget.</p></div>}
    <div className="muse-feedback" aria-label="Live coordinator feedback"><span>Received links <b>{observation.nodes.filter(n=>n.connected).length}/{observation.nodes.length}</b></span><span>Reported PV <b>{observation.nodes.reduce((sum,n)=>sum+(n.pvW??0),0).toFixed(0)} W</b></span><span>Reported load <b>{observation.nodes.reduce((sum,n)=>sum+(n.loadW??0),0).toFixed(0)} W</b></span><span>Current policy <b>{props.state.reasoningPolicy&&props.state.reasoningPolicy.expiresAt>props.state.t?props.state.reasoningPolicy.strategy:'baseline'}</b></span></div>
    <div className="muse-debug"><aside><div className="w-eyebrow">DECISION HISTORY</div>{!traces.length&&<p>Inject a failure below, then evaluate. Shadow mode is the default.</p>}{traces.map(t=><button className={t.id===trace?.id?'active':''} key={t.id} onClick={()=>setSelected(t.id)}><b>{t.at.toFixed(0)} s · {t.source} · {t.status}</b><small>{t.decision?.strategy??t.outcome??'Awaiting provider'}{t.latencyMs!==undefined?` · ${t.latencyMs} ms`:''}</small></button>)}</aside><article>
      <div role="status">{trace?.outcome??'Ready. No model request has been sent.'}</div>
      {trace?.decision&&<div className="muse-decision"><h3>{trace.decision.strategy}</h3><p>{trace.decision.summary}</p><b>Evidence</b><ul>{trace.decision.evidence.map((v,i)=><li key={i}>{v}</li>)}</ul><b>Uncertainty</b><ul>{trace.decision.uncertainty.map((v,i)=><li key={i}>{v}</li>)}</ul><p>Requested review: {trace.decision.nextCheckS} s · effective policy capped at 120 s.</p></div>}
      <details open={!trace}><summary>{trace?'Exact request sent':'Next input snapshot & prompt'}</summary><pre>{JSON.stringify(trace?.prompt??messages(observation),null,2)}</pre></details>
      <details><summary>Raw response & token usage</summary><pre>{trace?.raw??'No response yet.'}</pre><pre>{JSON.stringify(trace?.usage??null,null,2)}</pre></details>
    </article></div>
    <p className="muse-footnote">Decision rationale is model-provided explanation, not internal chain of thought. Inputs use received reports, not lost-node truth coordinates. Cloud counts come from a separate seeded tracker using Swarm settings; Weather PV remains its daylight/rain model. No live forecast, satellite service or vessel control is connected.</p>
  </section>;
}
